// AI opponents. They only ever see viewFor(state, pid) — no peeking at hidden cards or characters.
// aiAction(view, pid) returns the next single action; the driver calls it until the turn ends.
//
// How they think:
//  • An opponent model estimates who holds each unrevealed character, from the draft order,
//    what was missing when the draft reached us, and what each rival would want.
//  • Targeted powers (Assassin, Thief, Warlord) maximise expected harm to whoever is winning.
//  • Character choice weighs income, building power, danger of being hit and endgame timing,
//    then samples with a temperature so play stays varied rather than scripted.
// Levels: easy (impulsive, short-sighted) · normal · hard ("cunning": full model, sharper choices).

import { CHAR, COLORS } from './data.js?v=efde9582';
import {
  rankOf, has, colorCount, buildCost, canPlace, destroyCost, shielded,
  targetRanks, countsTowardLimit, score,
} from './engine.js?v=efde9582';
import { search } from './search.js?v=efde9582';

// Lookahead budget for the cunning AI (rollouts per decision); tests may turn it off.
export const SEARCH = { on: true, budget: 120 };

const TEMP = { easy: 1.6, normal: 0.55, hard: 0.25 };
// Tunables, overridable for A/B tests (test/ai-duel.mjs). Applied to the hard level only.
// Tunables per level, overridable for A/B tests (test/ai-duel.mjs).
const BASE = { kingCrown: 1.8, archBase: 1.6, leadDiv: 6, danger: 1, drawBias: 0, colorChase: 1 };
export const TUNE = { easy: { ...BASE }, normal: { ...BASE }, hard: { ...BASE } };
const best = (arr, f) => arr.reduce((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined);
const worst = (arr, f) => best(arr, x => -f(x));
const sum = a => a.reduce((t, x) => t + x, 0);
const flip = (v, pid, pct) => ((v.round * 31 + v.call * 17 + pid * 7) % 100) < pct; // stable per turn

function sample(entries, temp) { // [[value, utility]] → value, softmax with temperature
  if (!entries.length) return undefined;
  const top = Math.max(...entries.map(e => e[1]));
  const w = entries.map(([x, u]) => [x, Math.exp((u - top) / Math.max(0.05, temp))]);
  let r = Math.random() * sum(w.map(e => e[1]));
  for (const [x, wt] of w) if ((r -= wt) <= 0) return x;
  return w[0][0];
}

// Points on the table right now (hidden Secret Vaults excluded for rivals) + tempo.
function threat(v, p) {
  const s = score(v, p).total - (p.id !== v.me && has(p, 'secret_vault') ? 3 : 0);
  const left = v.cfg.goal - p.city.length;
  return s + Math.max(0, 6 - left) * 1.6 + p.gold * 0.25 + (p.handCount ?? p.hand.length) * 0.3;
}

// How much is this card worth to keep in hand?
function cardValue(me, card) {
  if (!canPlace(me, card)) return -5;
  const cost = buildCost(me, card);
  let v = cost * 0.9;
  if (card.color === 'purple') v += 1;
  if (!me.city.some(d => d.color === card.color)) v += 1.5;
  const reach = me.gold + 3;
  if (cost > reach) v -= (cost - reach) * 1.2;
  return v;
}
const buildable = p => p.hand.filter(c => !c.hidden && canPlace(p, c));

// Rough value of a whole turn as character `charId` for player p (gold-equivalent).
function turnValue(v, p, charId, level = 'normal') {
  const K = TUNE[level];
  const key = CHAR[charId].key, goal = v.cfg.goal;
  const handN = p.handCount ?? p.hand.length, gold = p.gold;
  const opps = v.players.filter(q => q.id !== p.id);
  const income = (CHAR[charId].income ? colorCount(p, CHAR[charId].income) : 0) + (key === 'merchant' ? 1 : 0);
  const canBuild = Math.min(gold + 2 + income, 6) * (handN > 0 ? 0.55 : 0.2);
  let v0 = 2 + income + canBuild;
  switch (key) {
    case 'assassin': v0 += 1.8 + (Math.max(...opps.map(q => q.city.length)) >= goal - 2 ? 2 : 0); break;
    case 'thief': v0 += Math.max(0, ...opps.map(q => q.gold)) * 0.45; break;
    case 'magician': v0 += handN <= 1 ? Math.max(0, ...opps.map(q => (q.handCount ?? q.hand.length))) * 0.7 : 0.8; break;
    case 'king': v0 += v.crown !== p.id ? K.kingCrown : K.kingCrown / 2; break;
    case 'patrician': v0 += colorCount(p, 'yellow') * 0.9 + (v.crown !== p.id ? 1 : 0.4); break;
    case 'bishop': v0 += p.city.length >= goal - 3 ? 2.5 : 0.6; break;
    case 'abbot': v0 += 0.8; break;
    case 'architect': v0 += K.archBase + (handN >= 2 && gold >= 3 ? Math.min(gold, 9) * 0.45 : 0) + (p.city.length >= goal - 3 ? 1.5 : 0); break;
    case 'warlord': v0 += 0.8 + (Math.max(...opps.map(q => q.city.length)) >= goal - 2 ? 2.5 : 0); break;
    case 'queen': v0 += 1.5; break;
    case 'navigator': v0 += gold <= 2 || handN === 0 ? 3 : 1.2; v0 -= canBuild * 0.8; break;
    case 'wizard': v0 += 1.8 + (handN <= 1 ? 1 : 0); break;
    case 'seer': v0 += 1.5 + (handN <= 1 ? 1 : 0); break;
    case 'scholar': v0 += 1.5 + (handN <= 1 ? 1.5 : 0); break;
    case 'trader': v0 += p.hand.filter(d => d.color === 'green').length * 0.7; break;
  }
  return v0;
}

// ── opponent model ───────────────────────────────────────────────────────
// P(holder | character) for every character that hasn't been revealed yet.
export function holdProbs(v, me, level) {
  const up = new Set(v.draft.faceUp);
  const cands = v.cfg.chars.filter(c => !me.chars.includes(c) && !up.has(c) && !v.revealed.includes(c));
  const rivals = v.players.filter(q => q.id !== me.id && (q.charCount ?? q.chars.length) > q.chars.length);
  const hiddenHeld = sum(rivals.map(q => (q.charCount ?? q.chars.length) - q.chars.length));
  const unused = Math.max(0, cands.length - hiddenHeld);
  const saw = level !== 'easy' ? me.saw?.[0] : null;
  const order = v.draft.order, myIdx = order.indexOf(me.id), offered = new Set(saw || []);
  const out = new Map();
  for (const c of cands) {
    const w = new Map();
    for (const q of rivals) {
      let x = Math.exp(turnValue(v, q, c) / 2.2);
      if (saw) {
        const before = order.indexOf(q.id) < myIdx;
        if (before ? offered.has(c) : !offered.has(c)) x *= 0.06; // contradicts what we saw in the draft
      }
      w.set(q.id, x);
    }
    const mean = w.size ? sum([...w.values()]) / w.size : 1;
    let none = cands.length ? mean * unused / Math.max(1, rivals.length) : 0;
    if (saw && !offered.has(c) && myIdx === 0) none *= 2; // first picker: missing ones are the face-down card
    const total = sum([...w.values()]) + none || 1;
    out.set(c, new Map([...w].map(([pid, x]) => [pid, x / total])));
  }
  return out;
}

// Expected harm of naming each rank, given who probably holds it.
function bestTarget(v, me, ranks, level, kind) {
  const probs = holdProbs(v, me, level);
  const mine = threat(v, me);
  const entries = ranks.map(r => {
    const c = v.cfg.chars.find(x => rankOf(x) === r);
    const P = probs.get(c) || new Map();
    let ev = 0;
    for (const [pid, p] of P) {
      const q = v.players[pid];
      const lead = Math.max(0, threat(v, q) - mine);
      if (kind === 'kill') {
        const nearEnd = q.city.length >= v.cfg.goal - 1 ? 3 : q.city.length >= v.cfg.goal - 2 ? 1.2 : 0;
        ev += p * (turnValue(v, q, c) * (r === 4 ? 0.85 : 1) * (1 + lead / TUNE[level].leadDiv) + nearEnd);
      } else {
        ev += p * (q.gold * (1 + Math.max(0, lead) / 15) + 0.1 * lead);
      }
    }
    return [r, ev];
  });
  if (level === 'easy') return entries[Math.floor(Math.random() * entries.length)][0];
  return sample(entries, TEMP[level] * 1.5);
}

// ── draft ────────────────────────────────────────────────────────────────
function draftUtility(v, me, c, level) {
  const key = CHAR[c].key, goal = v.cfg.goal;
  const K = TUNE[level];
  let u = turnValue(v, me, c, level);
  if (level === 'easy') return u;
  const opps = v.players.filter(q => q.id !== me.id);
  const rivalNear = opps.some(q => q.city.length >= goal - 2);
  const iNear = me.city.length >= goal - 2;
  const leading = threat(v, me) >= Math.max(...opps.map(q => threat(v, q)));
  // danger: juicy characters attract the Assassin and Thief if they're still out there
  const killersOut = v.cfg.chars.some(x => rankOf(x) <= 2 && !v.draft.faceUp.includes(x) && !me.chars.includes(x));
  if (killersOut && ['merchant', 'king', 'architect', 'trader', 'patrician'].includes(key)) u -= (leading ? 1.1 : 0.6) * K.danger;
  if (rivalNear && (key === 'assassin' || key === 'warlord')) u += 1.6;
  if (iNear && key === 'bishop') u += leading ? 2.2 : 1;
  if (iNear && key === 'architect' && me.gold >= 4) u += 1.2;
  if (v.cfg.chars.length - v.draft.faceUp.length <= 3 && key === 'king' && v.crown !== me.id) u += 0.5; // small tables: crown matters
  return u;
}

function bestBuild(v, me, level) {
  const T = v.turn, goal = v.cfg.goal;
  const spare = c => me.hand.filter(x => x.uid !== c.uid).sort((a, b) => cardValue(me, a) - cardValue(me, b));
  const options = me.hand.filter(c => {
    if (!canPlace(me, c)) return false;
    if (countsTowardLimit(T.charId, c) && T.built >= T.max) return false;
    const cost = buildCost(me, c);
    return cost <= me.gold || (level !== 'easy' && c.id === 'thieves_den' && cost <= me.gold + spare(c).length);
  });
  if (!options.length) return null;
  const have = new Set(me.city.map(d => d.color));
  const finalRound = v.firstComplete !== null;
  const util = c => {
    let u = c.cost + (c.color === 'purple' ? 0.8 : 0);
    if (!have.has(c.color) && have.size < 5 && level !== 'easy') u += (have.size >= 3 ? 2.5 : 1.2) * TUNE[level].colorChase; // chase the five-colour bonus
    if (['dragon_gate', 'university'].includes(c.id)) u += 2;
    if (c.id === 'thieves_den' && buildCost(me, c) > me.gold) u -= 2;
    if (finalRound) u += c.cost; // last chance: points now
    return u;
  };
  const pick = level === 'easy' ? options[Math.floor(Math.random() * options.length)] : best(options, util);
  // Don't trigger the game end while clearly behind — unless a rival is about to end it anyway
  // (then waiting just hands them the +4). Compare final scores, not "threat" (which adds tempo).
  if (level !== 'easy' && me.city.length + 1 >= goal && v.firstComplete === null) {
    const after = { ...me, city: [...me.city, pick], hand: me.hand.filter(c => c.uid !== pick.uid) };
    const mine = score({ ...v, firstComplete: me.id }, after).total;
    const rivals = v.players.filter(p => p.id !== me.id);
    const toAct = p => (p.charCount ?? p.chars.length) > p.chars.length; // still has a turn this round
    const final = p => score(v, p).total + (toAct(p) ? Math.min(p.gold + 2, 6) : 0);
    const racing = rivals.some(p => p.city.length >= goal - 1);
    if (!racing && mine < Math.max(...rivals.map(final))) return null;
  }
  const cost = buildCost(me, pick);
  const pay = cost > me.gold ? spare(pick).slice(0, cost - me.gold).map(c => c.uid) : undefined;
  return { t: 'build', uid: pick.uid, pay };
}

function warlordMove(v, me, level) {
  const mine = threat(v, me);
  let pick = null, top = level === 'hard' ? 1.2 : 1.8;
  for (const o of v.players) {
    if (o.id === me.id || shielded(v, o)) continue;
    const lead = threat(v, o) - mine;
    const colors = new Set(o.city.filter(d => d.id !== 'haunted_city' && d.id !== 'school_of_magic').map(d => d.color));
    for (const d of o.city) {
      const cost = destroyCost(o, d);
      if (d.id === 'keep' || cost > me.gold) continue;
      const breaksColours = colors.size === 5 && o.city.filter(x => x.color === d.color).length === 1 ? 3 : 0;
      const nearEnd = o.city.length >= v.cfg.goal - 1 ? 3.5 : 0;
      const damage = (d.cost + breaksColours) * (1 + Math.max(0, lead) / 10) + nearEnd + (lead < -6 ? -3 : 0);
      const value = damage - cost * 0.85 - (me.gold - cost < 2 ? 0.8 : 0);
      if (value > top) { top = value; pick = { t: 'destroy', target: o.id, uid: d.uid }; }
    }
  }
  return pick;
}

export function aiAction(v, pid) {
  const me = v.players[pid];
  const level = v.cfg.level || 'normal';

  if (v.interrupt) { // Graveyard: buy the ruin back?
    const c = v.interrupt.card;
    return { t: 'graveyard', take: me.gold >= 1 && canPlace(me, c) && (c.cost >= 3 || me.gold >= 3) };
  }

  if (v.phase === 'draft') {
    const opts = v.draft.options || [];
    if (v.draft.mustDiscard) { // two players: bury what the opponent wants most
      const opp = v.players.find(p => p.id !== pid);
      return { t: 'discard', charId: level === 'easy' ? opts[0] : best(opts, c => turnValue(v, opp, c)) };
    }
    if (level === 'hard' && SEARCH.on && opts.length > 1) return search(v, pid, opts.map(charId => ({ t: 'pick', charId })), SEARCH.budget);
    return { t: 'pick', charId: sample(opts.map(c => [c, draftUtility(v, me, c, level)]), TEMP[level]) };
  }

  const T = v.turn;
  const P = T.pending;
  const myRanks = me.chars.map(rankOf);
  const opps = v.players.filter(p => p.id !== pid);
  const careless = level === 'easy' && flip(v, pid, 40);

  if (P?.k === 'keep') {
    const sorted = [...P.cards].sort((a, b) => cardValue(me, b) - cardValue(me, a));
    return { t: 'keep', uids: sorted.slice(0, P.n).map(c => c.uid) };
  }
  if (P?.k === 'wizard') {
    const can = P.cards.filter(c => canPlace(me, c) && buildCost(me, c) <= me.gold);
    const take = best(can, c => c.cost) || best(P.cards, c => cardValue(me, c));
    return { t: 'wizTake', uid: take.uid, build: can.includes(take) && take.cost >= 3 };
  }
  if (P?.k === 'seerGive') {
    const sorted = [...me.hand].sort((a, b) => cardValue(me, a) - cardValue(me, b));
    return { t: 'seerGive', uids: sorted.slice(0, P.targets.length).map(c => c.uid) };
  }

  if (!T.used.ability && !careless) {
    const key = CHAR[T.charId].key;
    if (key === 'assassin') {
      const ranks = targetRanks(v, [1]).filter(r => !myRanks.includes(r));
      if (ranks.length && level === 'hard' && SEARCH.on) return search(v, pid, ranks.map(rank => ({ t: 'kill', rank })), SEARCH.budget);
      if (ranks.length) return { t: 'kill', rank: bestTarget(v, me, ranks, level, 'kill') };
    }
    if (key === 'thief') {
      const ranks = targetRanks(v, [1, 2, v.killed]).filter(r => !myRanks.includes(r));
      if (ranks.length && level === 'hard' && SEARCH.on) return search(v, pid, ranks.map(rank => ({ t: 'rob', rank })), SEARCH.budget);
      if (ranks.length) return { t: 'rob', rank: bestTarget(v, me, ranks, level, 'rob') };
    }
    if (key === 'magician') {
      const myGood = buildable(me).filter(c => cardValue(me, c) > 1.5).length;
      const mine = threat(v, me);
      const target = best(opps, p => p.handCount * 1.2 + Math.max(0, threat(v, p) - mine) * 0.08);
      if (target && target.handCount >= me.hand.length + 2 - (myGood === 0 ? 1 : 0)) return { t: 'swap', target: target.id };
      const junk = me.hand.filter(c => cardValue(me, c) < 1.5);
      if (junk.length && v.deckCount) return { t: 'redraw', uids: junk.map(c => c.uid) };
    }
    if (key === 'wizard') {
      const t = best(opps.filter(p => p.handCount), p => p.handCount + threat(v, p) * 0.05);
      if (t) return { t: 'peek', target: t.id };
    }
    if (key === 'seer' && opps.some(p => p.handCount)) return { t: 'seer' };
    if (key === 'scholar' && v.deckCount) return { t: 'scholar' };
    if (key === 'navigator') {
      const good = buildable(me).length;
      return { t: 'nav', choice: (good >= 2 || !v.deckCount) ? 'gold' : 'cards' };
    }
  }

  if (!T.income) {
    if (level === 'easy') return { t: v.deckCount && Math.random() < 0.4 ? 'draw' : 'gold' };
    const good = buildable(me).filter(c => cardValue(me, c) > 0.5);
    const cheapest = Math.min(...good.map(c => buildCost(me, c)), 99);
    const needed = v.cfg.goal - me.city.length;
    const willBuild = T.max > 0;
    let draw = good.length === 0 || (good.length < Math.min(2 + TUNE[level].drawBias, needed) && me.gold >= cheapest + 1);
    if (!willBuild && good.length >= 2) draw = false;
    if (me.gold + 2 < cheapest && good.length >= 1) draw = false; // need money, not more cards
    if (has(me, 'library') || has(me, 'observatory')) draw = draw || (good.length < 3 && me.gold >= 4);
    return { t: draw && v.deckCount ? 'draw' : 'gold' };
  }

  if (level !== 'easy') {
    if (has(me, 'smithy') && !T.used.smithy && me.gold >= 4 && buildable(me).length <= 1 && v.deckCount) return { t: 'smithy' };
    if (has(me, 'laboratory') && !T.used.lab && me.hand.length) {
      const j = worst(me.hand, c => cardValue(me, c));
      if (cardValue(me, j) < 1) return { t: 'lab', uid: j.uid };
    }
  }

  const b = bestBuild(v, me, level);
  if (b) return b;

  if (CHAR[T.charId].key === 'warlord' && !T.used.ability && !careless) {
    const w = warlordMove(v, me, level);
    if (w) return w;
  }
  return { t: 'end' };
}

// Fallback when an AI choice turns out illegal: always make progress.
export function safeAction(v, pid) {
  if (v.interrupt) return { t: 'graveyard', take: false };
  if (v.phase === 'draft') return { t: v.draft.mustDiscard ? 'discard' : 'pick', charId: v.draft.options[0] };
  const P = v.turn.pending, me = v.players[pid];
  if (P?.k === 'keep') return { t: 'keep', uids: P.cards.slice(0, P.n).map(c => c.uid) };
  if (P?.k === 'wizard') return { t: 'wizTake', uid: P.cards[0].uid };
  if (P?.k === 'seerGive') return { t: 'seerGive', uids: me.hand.slice(0, P.targets.length).map(c => c.uid) };
  return v.turn.income ? { t: 'end' } : { t: 'gold' };
}
