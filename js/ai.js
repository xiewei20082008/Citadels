// AI opponents. They only ever see viewFor(state, pid) — no peeking at hidden cards or characters.
// aiAction(view, pid) returns the next single action; the driver calls it until the turn ends.
//
// How they think:
//  • An opponent model estimates who holds each unrevealed character, from the draft order,
//    what was missing when the draft reached us, and what each rival would want.
//  • Targeted powers (Assassin, Thief, Warlord) maximise expected harm to whoever is winning.
//  • Character choice weighs income, building power, danger of being hit and endgame timing,
//    then samples with a temperature so play stays varied rather than scripted.
// Cunning is the sole policy; lookahead is disabled only inside simulated rounds.

import { CHAR, COLORS, makeDeck } from './data.js?v=a295c9dc';
import {
  rankOf, has, colorCount, buildCost, canPlace, destroyCost, shielded,
  targetRanks, countsTowardLimit, score, canConfiscate, taxDue, seizeError, seizureCost, act,
} from './engine.js?v=a295c9dc';
import { search } from './search.js?v=a295c9dc';

// Lookahead budget for the cunning AI (rollouts per decision); tests may turn it off.
export const SEARCH = { on: true, budget: 120 };
// Injectable AI randomness; never use or expose the private engine seed.
export const WARRANT_RANDOM = { next: () => Math.random() };

const TEMP = 0.25;
// Tunables, overridable for A/B tests (test/ai-duel.mjs).
export const TUNE = { kingCrown: 1.8, archBase: 1.6, leadDiv: 6, danger: 1, drawBias: 0, colorChase: 1 };
const best = (arr, f) => arr.reduce((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined);
const worst = (arr, f) => best(arr, x => -f(x));
const sum = a => a.reduce((t, x) => t + x, 0);

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

// Hypergeometric match distribution: opponents hold samples of the unseen pool.
// Apply resource caps to each outcome, rather than capping the average matches.
export function spyRewards(total, matching, hand, gold, deck) {
  let probabilities = [1];
  const draws = Math.min(hand, total);
  for (let d = 0; d < draws; d++) {
    const next = Array(d + 2).fill(0);
    for (let k = 0; k <= d; k++) {
      const hit = Math.max(0, Math.min(1, (matching - k) / (total - d)));
      next[k + 1] += (probabilities[k] || 0) * hit;
      next[k] += (probabilities[k] || 0) * (1 - hit);
    }
    probabilities = next;
  }
  return probabilities.reduce((out, probability, matches) => {
    out.gold += probability * Math.min(matches, gold);
    out.cards += probability * Math.min(matches, 2, deck);
    return out;
  }, { gold: 0, cards: 0 });
}

export function spyOptions(v, me) {
  const known = new Set([...me.hand.filter(c => !c.hidden), ...v.players.flatMap(p => p.city)].map(c => c.uid));
  const unseen = makeDeck().filter(c => !known.has(c.uid));
  return v.players.filter(p => p.id !== me.id).flatMap(target => COLORS.map(color => {
    const reward = spyRewards(unseen.length, unseen.filter(c => c.color === color).length,
      target.handCount ?? target.hand.length, target.gold, v.deckCount);
    // Resource units have equal weight. Disruption is bounded at 35% of gold
    // removed; inspecting a larger hand adds at most 0.15 information value.
    const threatValue = reward.gold * Math.max(0, Math.min(0.35, (threat(v, target) - threat(v, me)) / 100));
    const informationValue = 0.15 * Math.min(6, target.handCount ?? target.hand.length) / 6;
    return { action: { t: 'spy', target: target.id, color, round: v.round },
      utility: reward.gold + reward.cards + threatValue + informationValue };
  }));
}

// Rough value of a whole turn as character `charId` for player p (gold-equivalent).
function turnValue(v, p, charId) {
  const K = TUNE;
  const key = CHAR[charId].key, goal = v.cfg.goal;
  const handN = p.handCount ?? p.hand.length, gold = p.gold;
  const opps = v.players.filter(q => q.id !== p.id);
  const income = (CHAR[charId].income ? colorCount(p, CHAR[charId].income) : 0) + (key === 'merchant' ? 1 : 0);
  const canBuild = Math.min(gold + 2 + income, 6) * (handN > 0 ? 0.55 : 0.2);
  let v0 = 2 + income + canBuild;
  switch (key) {
    case 'magistrate': v0 += 2.5 + (opps.some(q => q.gold >= 4) ? 1 : 0); break;
    case 'assassin': v0 += 1.8 + (Math.max(...opps.map(q => q.city.length)) >= goal - 2 ? 2 : 0); break;
    case 'thief': v0 += Math.max(0, ...opps.map(q => q.gold)) * 0.45; break;
    case 'spy': v0 += Math.max(0, ...spyOptions(v, p).map(o => o.utility)); break;
    case 'magician': v0 += handN <= 1 ? Math.max(0, ...opps.map(q => (q.handCount ?? q.hand.length))) * 0.7 : 0.8; break;
    case 'king': v0 += v.crown !== p.id ? K.kingCrown : K.kingCrown / 2; break;
    case 'patrician': v0 += colorCount(p, 'yellow') * 0.9 + (v.crown !== p.id ? 1 : 0.4); break;
    case 'bishop': v0 += p.city.length >= goal - 3 ? 2.5 : 0.6; break;
    case 'abbot': v0 += 0.8; break;
    case 'architect': v0 += K.archBase + (handN >= 2 && gold >= 3 ? Math.min(gold, 9) * 0.45 : 0) + (p.city.length >= goal - 3 ? 1.5 : 0); break;
    case 'warlord': v0 += 0.8 + (Math.max(...opps.map(q => q.city.length)) >= goal - 2 ? 2.5 : 0); break;
    case 'queen': v0 += 1.5; break;
    case 'tax_collector': {
      // Visible pool plus public construction estimates, discounted for a late,
      // attractive assassination target. Never treat this as spendable gold.
      const expected = opps.reduce((n, q) => n + ((q.handCount ?? q.hand.length) > 0 && q.gold >= 2 ? 0.65 : 0.15), 0);
      v0 += ((v.taxPool || 0) + expected) * 0.8;
      break;
    }
    case 'marshal': v0 += 0.8 + Math.max(0, ...marshalOptions(v, { ...p, gold: gold + income + 2 }).map(o => o.utility)); break;
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
export function holdProbs(v, me) {
  const up = new Set(v.draft.faceUp);
  const cands = v.cfg.chars.filter(c => !me.chars.includes(c) && !up.has(c) && !v.revealed.includes(c));
  const rivals = v.players.filter(q => q.id !== me.id && (q.charCount ?? q.chars.length) > q.chars.length);
  const hiddenHeld = sum(rivals.map(q => (q.charCount ?? q.chars.length) - q.chars.length));
  const unused = Math.max(0, cands.length - hiddenHeld);
  const saw = me.saw?.[0];
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
function bestTarget(v, me, ranks, kind) {
  const probs = holdProbs(v, me);
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
        ev += p * (turnValue(v, q, c) * (r === 4 ? 0.85 : 1) * (1 + lead / TUNE.leadDiv) + nearEnd);
      } else {
        ev += p * (q.gold * (1 + Math.max(0, lead) / 15) + 0.1 * lead);
      }
    }
    return [r, ev];
  });
  return sample(entries, TEMP * 1.5);
}

// ── draft ────────────────────────────────────────────────────────────────
function draftUtility(v, me, c) {
  const key = CHAR[c].key, goal = v.cfg.goal;
  const K = TUNE;
  let u = turnValue(v, me, c);
  const opps = v.players.filter(q => q.id !== me.id);
  const rivalNear = opps.some(q => q.city.length >= goal - 2);
  const iNear = me.city.length >= goal - 2;
  const leading = threat(v, me) >= Math.max(...opps.map(q => threat(v, q)));
  // danger: juicy characters attract the Assassin and Thief if they're still out there
  const killersOut = v.cfg.chars.some(x => rankOf(x) <= 2 && !v.draft.faceUp.includes(x) && !me.chars.includes(x));
  if (killersOut && ['merchant', 'king', 'architect', 'trader', 'patrician', 'tax_collector'].includes(key)) u -= (leading ? 1.1 : 0.6) * K.danger;
  if (rivalNear && (key === 'assassin' || key === 'warlord')) u += 1.6;
  if (iNear && key === 'bishop') u += leading ? 2.2 : 1;
  if (iNear && key === 'architect' && me.gold >= 4) u += 1.2;
  if (v.cfg.chars.length - v.draft.faceUp.length <= 3 && key === 'king' && v.crown !== me.id) u += 0.5; // small tables: crown matters
  return u;
}

function bestBuild(v, me) {
  const T = v.turn, goal = v.cfg.goal;
  const spare = c => me.hand.filter(x => x.uid !== c.uid).sort((a, b) => cardValue(me, a) - cardValue(me, b));
  const options = me.hand.filter(c => {
    if (!canPlace(me, c)) return false;
    if (countsTowardLimit(T.charId, c) && T.built >= T.max) return false;
    const cost = buildCost(me, c);
    return cost <= me.gold || (c.id === 'thieves_den' && cost <= me.gold + spare(c).length);
  });
  if (!options.length) return null;
  const have = new Set(me.city.map(d => d.color));
  const finalRound = v.firstComplete !== null;
  const w = v.warrants;
  const warned = w && !T.paidBuild && w.targets.includes(T.charId);
  const warrantRisk = !warned || w.pid === me.id ? 0 : w.signed !== null ? (w.signed === T.charId ? 1 : 0) : 1 / 3;
  const util = c => {
    let u = c.cost + (c.color === 'purple' ? 0.8 : 0);
    if (!have.has(c.color) && have.size < 5) u += (have.size >= 3 ? 2.5 : 1.2) * TUNE.colorChase; // chase the five-colour bonus
    if (['dragon_gate', 'university'].includes(c.id)) u += 2;
    if (c.id === 'thieves_den' && buildCost(me, c) > me.gold) u -= 2;
    if (finalRound) u += c.cost; // last chance: points now
    if (warrantRisk && !has(v.players[w.pid], c.id)) {
      u -= warrantRisk * (u + 1);
      // Prefer an affordable cheap opening only when a second build remains
      // possible even if the Magistrate declines and no refund arrives.
      if (T.max - T.built > 1 && options.some(d => d !== c && buildCost(me, d) + buildCost(me, c) +
        taxDue(v, me.gold - buildCost(me, c), T.charId) <= me.gold))
        u += warrantRisk * (7 - buildCost(me, c));
    }
    return u;
  };
  const pick = best(options, util);
  // Don't trigger the game end while clearly behind — unless a rival is about to end it anyway
  // (then waiting just hands them the +4). Compare final scores, not "threat" (which adds tempo).
  if (me.city.length + 1 >= goal && v.firstComplete === null) {
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

function warlordMove(v, me) {
  const mine = threat(v, me);
  let pick = null, top = 1.2;
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

// Shared host eligibility; sorted ties stay deterministic across seats and UIDs.
export function marshalOptions(v, me) {
  const before = score(v, me).total;
  return v.players.filter(p => p.id !== me.id).flatMap(target => target.city.filter(card => !seizeError(v, me, target, card)).map(card => {
    const cost = seizureCost(card);
    const after = { ...me, city: [...me.city, card], gold: me.gold - cost };
    const other = { ...target, city: target.city.filter(c => c.uid !== card.uid), gold: target.gold + cost };
    const completion = v.firstComplete === null && after.city.length >= v.cfg.goal;
    const next = { ...v, firstComplete: completion ? me.id : v.firstComplete };
    let utility = score(next, after).total - before + (score(v, target).total - score(next, other).total) * 0.65 - cost * 0.8 - cost * 0.3;
    if (completion && v.players.some(p => p.id !== me.id && score(next, p.id === target.id ? other : p).total > score(next, after).total)) utility = -100;
    return { action: { t: 'seize', target: target.id, uid: card.uid, round: v.round, charId: 20 }, utility };
  })).sort((a, b) => b.utility - a.utility || a.action.target - b.action.target || a.action.uid.localeCompare(b.action.uid));
}

function marshalMove(v, me, lookahead) {
  const b = bestBuild(v, me);
  const options = marshalOptions(v, me).filter(o => o.utility > 0);
  const actions = [...options.map(o => o.action), ...(b ? [b] : []), { t: 'end' }];
  if (lookahead && SEARCH.on && options.length) return search(v, me.id, actions, SEARCH.budget);
  // Compare both affordable orders using authoritative payments and taxes.
  // A pending warrant stops the sequence; the next policy call re-plans it.
  const value = state => {
    const mine = state.players[me.id];
    return score(state, mine).total - score(v, me).total + (mine.gold - me.gold) * 0.8 +
      v.players.filter(p => p.id !== me.id).reduce((u, p) => u +
        (score(v, p).total - score(state, state.players[p.id]).total) * 0.65 -
        (state.players[p.id].gold - p.gold) * 0.3, 0);
  };
  let pick = { t: 'end' }, top = 0;
  for (const action of actions.filter(a => a.t !== 'end')) {
    const next = act(v, me.id, action);
    if (next.error) continue;
    let utility = value(next);
    if (!next.interrupt) {
      const p = next.players[me.id];
      const follow = action.t === 'seize' ? [bestBuild(next, p)].filter(Boolean)
        : marshalOptions(next, p).filter(o => o.utility > 0).map(o => o.action);
      for (const a of follow) {
        const last = act(next, me.id, a);
        if (!last.error) utility = Math.max(utility, value(last));
      }
    }
    if (utility > top) { pick = action; top = utility; }
  }
  return pick;
}

export function aiAction(v, pid, { lookahead = true } = {}) {
  const me = v.players[pid];

  if (v.interrupt) { // Graveyard: buy the ruin back?
    if (v.interrupt.k === 'warrant') return warrantResponse(v, me);
    const c = v.interrupt.card;
    return { t: 'graveyard', take: me.gold >= 1 && canPlace(me, c) && (c.cost >= 3 || me.gold >= 3) };
  }

  if (v.phase === 'draft') {
    const opts = v.draft.options || [];
    if (v.draft.mustDiscard) { // two players: bury what the opponent wants most
      const opp = v.players.find(p => p.id !== pid);
      return { t: 'discard', charId: best(opts, c => turnValue(v, opp, c)) };
    }
    if (lookahead && SEARCH.on && opts.length > 1) return search(v, pid, opts.map(charId => ({ t: 'pick', charId })), SEARCH.budget);
    return { t: 'pick', charId: sample(opts.map(c => [c, draftUtility(v, me, c)]), TEMP) };
  }

  const T = v.turn;
  const P = T.pending;
  const myRanks = me.chars.map(rankOf);
  const opps = v.players.filter(p => p.id !== pid);

  if (P?.k === 'keep') {
    const sorted = [...P.cards].sort((a, b) => cardValue(me, b) - cardValue(me, a));
    return { t: 'keep', uids: sorted.slice(0, P.n).map(c => c.uid) };
  }
  if (P?.k === 'wizard') {
    const can = P.cards.filter(c => buildCost(me, c) <= me.gold);
    const take = best(can, c => c.cost) || best(P.cards, c => cardValue(me, c));
    return { t: 'wizTake', uid: take.uid, build: can.includes(take) && take.cost >= 3 };
  }
  if (P?.k === 'seerGive') {
    const sorted = [...me.hand].sort((a, b) => cardValue(me, a) - cardValue(me, b));
    return { t: 'seerGive', uids: sorted.slice(0, P.targets.length).map(c => c.uid) };
  }

  if (!T.used.ability) {
    const key = CHAR[T.charId].key;
    if (key === 'tax_collector' && v.taxPool > 0) return { t: 'collectTax', round: v.round, charId: T.charId };
    if (key === 'spy') return best(spyOptions(v, me), o => o.utility).action;
    if (key === 'magistrate') return assignWarrants(v, me);
    if (key === 'assassin') {
      const ranks = targetRanks(v, [1]).filter(r => !myRanks.includes(r));
      if (ranks.length && lookahead && SEARCH.on) return search(v, pid, ranks.map(rank => ({ t: 'kill', rank })), SEARCH.budget);
      if (ranks.length) return { t: 'kill', rank: bestTarget(v, me, ranks, 'kill') };
    }
    if (key === 'thief') {
      const ranks = targetRanks(v, [1, 2, v.killed]).filter(r => !myRanks.includes(r));
      if (ranks.length && lookahead && SEARCH.on) return search(v, pid, ranks.map(rank => ({ t: 'rob', rank })), SEARCH.budget);
      if (ranks.length) return { t: 'rob', rank: bestTarget(v, me, ranks, 'rob') };
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
    const good = buildable(me).filter(c => cardValue(me, c) > 0.5);
    const cheapest = Math.min(...good.map(c => buildCost(me, c)), 99);
    const needed = v.cfg.goal - me.city.length;
    const willBuild = T.max > 0;
    let draw = good.length === 0 || (good.length < Math.min(2 + TUNE.drawBias, needed) && me.gold >= cheapest + 1);
    if (!willBuild && good.length >= 2) draw = false;
    if (me.gold + 2 < cheapest && good.length >= 1) draw = false; // need money, not more cards
    if (has(me, 'library') || has(me, 'observatory')) draw = draw || (good.length < 3 && me.gold >= 4);
    return { t: draw && v.deckCount ? 'draw' : 'gold' };
  }

  if (has(me, 'smithy') && !T.used.smithy && me.gold >= 4 && buildable(me).length <= 1 && v.deckCount) return { t: 'smithy' };
  if (has(me, 'laboratory') && !T.used.lab && me.hand.length) {
    const j = worst(me.hand, c => cardValue(me, c));
    if (cardValue(me, j) < 1) return { t: 'lab', uid: j.uid };
  }

  if (T.charId === 20 && !T.used.ability) return marshalMove(v, me, lookahead);
  const b = bestBuild(v, me);
  if (b) return b;

  if (CHAR[T.charId].key === 'warlord' && !T.used.ability) {
    const w = warlordMove(v, me);
    if (w) return w;
  }
  return { t: 'end' };
}

// Fallback when an AI choice turns out illegal: always make progress.
export function safeAction(v, pid) {
  if (v.interrupt?.k === 'warrant') return { t: 'warrantResponse', id: v.interrupt.id, round: v.interrupt.round, take: false };
  if (v.interrupt) return { t: 'graveyard', take: false };
  if (v.phase === 'draft') return { t: v.draft.mustDiscard ? 'discard' : 'pick', charId: v.draft.options[0] };
  const P = v.turn.pending, me = v.players[pid];
  if (P?.k === 'keep') return { t: 'keep', uids: P.cards.slice(0, P.n).map(c => c.uid) };
  if (P?.k === 'wizard') return { t: 'wizTake', uid: P.cards[0].uid };
  if (P?.k === 'seerGive') return { t: 'seerGive', uids: me.hand.slice(0, P.targets.length).map(c => c.uid) };
  return v.turn.income ? { t: 'end' } : { t: 'gold' };
}

function assignWarrants(v, me) {
  const probs = holdProbs(v, me);
  const ranked = v.cfg.chars.map(charId => {
    let value = 0;
    if (rankOf(charId) > v.call) {
      const holders = me.chars.includes(charId) ? new Map([[me.id, 1]]) : probs.get(charId) || new Map();
      for (const [pid, chance] of holders) {
        const p = v.players[pid], c = CHAR[charId];
        if (c.key === 'navigator') continue;
        const income = c.income ? colorCount(p, c.income) + (c.key === 'merchant' ? 1 : 0) : 0;
        const gold = p.gold + 2 + income;
        const draws = ['architect', 'scholar', 'wizard', 'seer', 'patrician'].includes(c.key);
        const hand = p.handCount ?? p.hand.length;
        const buildingChance = Math.min(0.95, (hand || draws ? 0.65 + hand * 0.06 : 0.15) + (p.city.length >= v.cfg.goal - 2 ? 0.08 : 0));
        const expected = Math.max(1, Math.min(5, gold, 2 + hand * 0.4));
        const duplicateRisk = Math.min(0.6, me.city.length * 0.04);
        value += chance * buildingChance * expected * (1 - duplicateRisk);
      }
    }
    const useful = rankOf(charId) > v.call && !v.draft.faceUp.includes(charId) && CHAR[charId].key !== 'navigator';
    return { charId, useful, score: value * (0.88 + WARRANT_RANDOM.next() * 0.24) };
  }).sort((a, b) => b.score - a.score || Number(b.useful) - Number(a.useful) || rankOf(a.charId) - rankOf(b.charId) || a.charId - b.charId);
  const targets = ranked.slice(0, 3).map(x => x.charId);
  return { t: 'warrants', targets, signed: targets[0] };
}

function warrantResponse(v, me) {
  const i = v.interrupt;
  let take = canConfiscate(v);
  if (take) {
    const card = { ...i.card, round: v.round };
    const after = { ...me, city: [...me.city, card], gold: me.gold + (i.builder === me.id ? i.goldPaid : 0) };
    const completion = v.firstComplete === null && after.city.length >= v.cfg.goal;
    const next = { ...v, firstComplete: completion ? me.id : v.firstComplete };
    // Taking a second unique district can forfeit Ivory Tower's five points.
    take = score(next, after).total >= score(v, me).total;
    if (take && completion) {
      const rivals = v.players.filter(p => p.id !== me.id);
      const mine = score(next, after).total;
      const racing = rivals.some(p => p.city.length >= v.cfg.goal - 1);
      if (!racing && rivals.some(p => score(next, p).total > mine)) take = false;
    }
  }
  return { t: 'warrantResponse', id: i.id, round: i.round, take };
}
