// Run: node test/pressure.mjs [games]
// Pressure test. Plays thousands of games in every mode and checks three things:
//  1. Fairness: the AI's input must not change when only hidden information changes ("twin worlds").
//  2. Robustness: a random-move "monkey" seat mixed with AIs never breaks the rules or stalls.
//  3. Behaviour: targeting, repetition and silly moves, measured rather than eyeballed.
import assert from 'node:assert/strict';
import { constructionOptions, physicalCards, createGame, act, viewFor, currentActor, rankOf, score, buildCost, canPlace, charsPerPlayer, has } from '../js/engine.js';
import { aiAction, safeAction } from '../js/ai.js';
import { PRESETS, CHAR, makeDeck } from '../js/data.js';

const N = +process.argv[2] || 400;
let seed = 12345; // seeded Math.random so any failure can be replayed
Math.random = () => { let t = (seed = (seed + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TOTAL = makeDeck().length;
const SETS = [...Object.entries(PRESETS),
  ['magistrate', [17, 2, 11, 4, 5, 16, 7, 8, 9]],
  ['spy', [1, 18, 3, 4, 5, 6, 7, 8, 9]],
  ['spy-magistrate', [17, 18, 11, 12, 13, 16, 14, 8, 9]],
  ['tax-marshal', [1, 2, 3, 4, 5, 6, 7, 20, 19]],
  ['tax-marshal-variants', [17, 18, 11, 12, 13, 16, 14, 20, 19]]];
const LEVELS = ['hard'];

// ── 1. twin worlds ───────────────────────────────────────────────────────────
// Re-deal everything `pid` cannot see. Their view (= the only AI input) must not change.
function twin(s, pid) {
  const t = structuredClone(s);
  if (t.warrants && t.warrants.pid !== pid && !t.warrants.revealed)
    t.warrants.signed = t.warrants.targets[Math.floor(Math.random() * t.warrants.targets.length)];
  t.seed = (Math.random() * 2 ** 31) | 0;
  const others = t.players.filter(p => p.id !== pid);
  const peek = t.turn?.pid === pid ? t.turn.spyPeek : null;
  const known = new Set(peek?.cards.map(c => c.uid) || []);
  const hiddenStored = t.players.flatMap(p => p.city.flatMap(m => (m.stored || []).filter(c => p.id !== pid && !c.knownTo?.includes(pid))));
  const cards = shuffle([...t.deck, ...others.flatMap(p => p.hand), ...hiddenStored].filter(c => !known.has(c.uid)));
  for (const p of t.players) for (const m of p.city) if (m.stored) m.stored = m.stored.map(c =>
    p.id !== pid && !c.knownTo?.includes(pid) ? { ...cards.shift(), knownTo: c.knownTo } : c);
  for (const p of others) {
    const seen = peek?.target === p.id ? structuredClone(peek.cards) : [];
    p.hand = [...seen, ...cards.splice(0, p.hand.length - seen.length)];
  }
  t.deck = cards;
  const d = t.draft, picking = t.phase === 'draft' && d.order[d.idx] === pid;
  if (!picking) {
    const remembered = new Set(t.players[pid].theaterKnowledge?.map(k => k.charId) || []);
    const hid = p => p.chars.filter(c => !t.revealed.includes(c) && !remembered.has(c));
    const pool = shuffle([...d.faceDown, ...(t.phase === 'draft' ? d.avail : []), ...others.flatMap(hid)]);
    for (const p of others) { const k = hid(p).length; p.chars = [...p.chars.filter(c => t.revealed.includes(c) || remembered.has(c)), ...pool.splice(0, k)]; }
    if (t.phase === 'draft') d.avail = pool.splice(0, d.avail.length);
    d.faceDown = pool;
  }
  return t;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── legal moves (for the monkey) ─────────────────────────────────────────────
// Include invalid variants too: the monkey filters through act(), and verifies
// that evaluating rejected requests never changes the original state.
function constructionCandidates(s, p, card, wizard = false) {
  const base = wizard ? { t: 'wizTake', uid: card.uid, build: true } : { t: 'build', uid: card.uid };
  const out = [{ ...base }, ...constructionOptions(s, p, card, wizard)];
  const spare = p.hand.filter(c => c.uid !== card.uid), payment = shuffle(spare.map(c => c.uid)).slice(0, card.cost);
  out.push({ ...base, pay: payment }, { ...base, pay: 'invalid' }, { ...base, payment: 'invalid' });
  if (payment.length) out.push({ ...base, pay: [payment[0], payment[0]] });
  for (const payment of ['framework', 'necropolis']) {
    // Owned, foreign, missing, and mixed payment sources all reach validation.
    // Legal combinations are already included above; bound the invalid samples.
    const owned = p.city.find(c => payment === 'framework' ? c.id === 'framework' : card.id === 'necropolis');
    const wrong = p.city.find(c => payment === 'framework' ? c.id !== 'framework' : card.id !== 'necropolis');
    const foreign = s.players.find(q => q.id !== p.id && q.city.length)?.city[0];
    const sources = [...new Set([owned, wrong, foreign].filter(Boolean))];
    for (const c of sources) out.push({ ...base, payment, sacrifice: c.uid });
    out.push({ ...base, payment, sacrifice: '__missing__' });
    if (spare.length) out.push({ ...base, payment, sacrifice: spare[0].uid });
    const source = owned || sources[0];
    if (source && spare.length) out.push({ ...base, payment, sacrifice: source.uid, pay: [spare[0].uid] });
  }
  return out;
}

function districtCandidates(s, p) {
  const out = [];
  for (const q of s.players) for (const c of q.city) {
    if (c.id === 'armory') {
      for (const target of s.players) for (const card of target.city)
        out.push({ t: 'armory', armory: c.uid, target: target.id, uid: card.uid });
      out.push({ t: 'armory', armory: c.uid, target: p.id, uid: '__missing__' });
    }
    if (c.id === 'museum') {
      for (const card of p.hand) out.push({ t: 'museum', museum: c.uid, uid: card.uid });
      const foreign = s.players.find(target => target.id !== p.id && target.hand.length)?.hand[0];
      out.push({ t: 'museum', museum: c.uid, uid: foreign?.uid || '__missing__' });
    }
  }
  return out;
}

function candidates(s, pid) {
  const p = s.players[pid], out = [];
  if (s.interrupt?.k === 'theater') {
    const i = s.interrupt, base = { t: 'theater', id: i.id, round: i.round, pass: false };
    return [{ ...base, pass: true }, ...p.chars.flatMap(charId => s.players.map(q => ({ ...base, charId, target: q.id }))),
      { ...base, pass: true, id: i.id - 1 }, { ...base, pass: true, round: i.round - 1 },
      { ...base, charId: -1, target: (pid + 1) % s.players.length },
      { ...base, charId: p.chars[0], target: s.players.length },
      { ...base, charId: p.chars[0], target: (pid + 1) % s.players.length, incoming: -1 }];
  }
  if (s.interrupt?.k === 'warrant') return [true, false].map(take => ({
    t: 'warrantResponse', id: s.interrupt.id, round: s.interrupt.round, take,
  }));
  if (s.interrupt) return [{ t: 'graveyard', take: true }, { t: 'graveyard', take: false }];
  if (s.phase === 'draft') return s.cfg.chars.flatMap(c => [{ t: 'pick', charId: c }, { t: 'discard', charId: c }]);
  const T = s.turn, P = T.pending, districts = districtCandidates(s, p);
  out.push({ t: 'collectTax', round: s.round, charId: T.charId });
  for (const q of s.players) for (const c of q.city)
    out.push({ t: 'seize', target: q.id, uid: c.uid, round: s.round, charId: T.charId });
  if (T.charId === 18 && !T.used.ability && !P)
    for (const q of s.players) for (const color of ['yellow', 'blue', 'green', 'red', 'purple'])
      out.push({ t: 'spy', target: q.id, color, round: s.round });
  if (T.charId === 17 && !T.used.ability && !P) {
    const targets = shuffle([...s.cfg.chars]).slice(0, 3);
    out.push({ t: 'warrants', targets, signed: targets[0] });
  }
  if (P?.k === 'keep') return [...districts, ...P.cards.map(c => ({ t: 'keep', uids: [c.uid] }))];
  if (P?.k === 'wizard') return [...districts, ...P.cards.flatMap(c => [{ t: 'wizTake', uid: c.uid }, ...constructionCandidates(s, p, c, true)])];
  if (P?.k === 'seerGive') return [...districts, { t: 'seerGive', uids: shuffle(p.hand.map(c => c.uid)).slice(0, P.targets.length) }];
  out.push({ t: 'gold' }, { t: 'draw' }, { t: 'end' }, { t: 'seer' }, { t: 'scholar' }, { t: 'smithy' }, { t: 'nav', choice: 'gold' }, { t: 'nav', choice: 'cards' });
  for (let r = 1; r <= 9; r++) out.push({ t: 'kill', rank: r }, { t: 'rob', rank: r });
  for (const q of s.players) out.push({ t: 'swap', target: q.id }, { t: 'peek', target: q.id }, ...q.city.map(c => ({ t: 'destroy', target: q.id, uid: c.uid })));
  for (const c of p.hand) out.push(...constructionCandidates(s, p, c), { t: 'lab', uid: c.uid });
  out.push(...districts);
  if (p.hand.length) out.push({ t: 'redraw', uids: p.hand.slice(0, 1 + Math.floor(Math.random() * p.hand.length)).map(c => c.uid) });
  return out;
}
function monkey(s, pid) {
  const before = JSON.stringify(s);
  const legal = shuffle(candidates(s, pid)).map(a => [a, act(s, pid, a)]).filter(([, n]) => !n.error);
  assert.equal(JSON.stringify(s), before, 'candidate actions mutated the original state');
  // a monkey that never ends its turn would loop forever; prefer anything but 'end' half the time
  const pick = legal.find(([a]) => a.t !== 'end' && Math.random() < 0.5) || legal[0];
  assert.ok(pick, 'monkey has no legal move');
  return pick;
}

// ── behaviour bookkeeping ─────────────────────────────────────────────────────
const B = {};
const lvl = l => (B[l] ??= { kill: 0, killHit: 0, killOnLeader: 0, rob: 0, robHit: 0, robRichest: 0, stolen: 0, robSamePerson: 0, robPairs: 0,
  killSameRank: 0, killPairs: 0, destroy: 0, destroyOnLeader: 0, destroyOwn: 0, warTurns: 0, turns: 0, missed: 0, hoard: 0,
  firstPick: {}, killRank: {}, robRank: {}, picksRepeat: 0, picksPairs: 0, endGame: 0, endGameBehind: 0, swapWorse: 0, swaps: 0,
  targetSeat0: 0, targetOther: 0, seat0Lead: 0 });
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '—');
const standing = (s, p) => score(s, p).total + p.gold * 0.5;

function play({ n, chars, goal, levels, monkeySeat = -1, seedNo }) {
  let s = createGame({ players: levels.map((l, i) => ({ name: 'P' + i, ai: true })), chars, goal, seed: seedNo, level: 'hard' });
  const lastRob = {}, lastKill = {}, lastPicks = {};
  let steps = 0, twins = 0, monkeyMoves = 0;
  while (s.phase !== 'over') {
    assert.ok(++steps < 30000, 'stalled');
    const pid = currentActor(s);
    assert.ok(pid !== null, 'no actor');
    let a, n2;
    if (pid === monkeySeat) { [a, n2] = monkey(s, pid); monkeyMoves++; }
    else {
      const level = levels[pid];
      const v = viewFor(s, pid);
      v.cfg = { ...v.cfg, level };
      // fairness: same view in a re-dealt world
      if (steps % 3 === 0) { const w = viewFor(twin(s, pid), pid); w.cfg = v.cfg; assert.ok(same(v, w), `view depends on hidden info (pid ${pid}, phase ${s.phase})`); twins++; }
      a = aiAction(v, pid);
      n2 = act(s, pid, a);
      if (n2.error) throw new Error(`AI illegal move ${JSON.stringify(a)}: ${n2.error} (level ${level}, n ${n})`);
      const K = lvl(level), me = s.players[pid];
      const others = s.players.filter(q => q.id !== pid);
      const leader = others.reduce((b, q) => (standing(s, q) > standing(s, b) ? q : b));
      const holder = r => others.find(q => q.chars.some(c => rankOf(c) === r));
      const note = victim => { if (!victim) return; if (victim.id === 0 && monkeySeat < 0) { K.targetSeat0++; if (leader.id === 0) K.seat0Lead++; } else K.targetOther++; };
      if (a.t === 'pick' && s.draft.idx === 0) K.firstPick[CHAR[a.charId].key] = (K.firstPick[CHAR[a.charId].key] || 0) + 1;
      if (a.t === 'pick') { if (lastPicks[pid] !== undefined) { K.picksPairs++; if (lastPicks[pid] === a.charId) K.picksRepeat++; } lastPicks[pid] = a.charId; }
      if (a.t === 'kill') {
        K.kill++; K.killRank[a.rank] = (K.killRank[a.rank] || 0) + 1;
        const h = holder(a.rank);
        if (h) { K.killHit++; if (h.id === leader.id) K.killOnLeader++; note(h); }
        if (lastKill[pid] !== undefined) { K.killPairs++; if (lastKill[pid] === a.rank) K.killSameRank++; }
        lastKill[pid] = a.rank;
      }
      if (a.t === 'rob') {
        K.rob++; K.robRank[a.rank] = (K.robRank[a.rank] || 0) + 1;
        const h = s.killed !== a.rank && holder(a.rank);
        if (h) {
          K.robHit++; note(h);
          const richest = Math.max(...others.filter(q => q.chars.some(c => rankOf(c) > 2 && rankOf(c) !== s.killed)).map(q => q.gold));
          if (h.gold >= richest) K.robRichest++;
          if (lastRob[pid] !== undefined) { K.robPairs++; if (lastRob[pid] === h.id) K.robSamePerson++; }
          lastRob[pid] = h.id;
        }
      }
      if (a.t === 'destroy') { K.destroy++; if (a.target === pid) K.destroyOwn++; else note(s.players[a.target]); if (a.target === leader.id) K.destroyOnLeader++; }
      if (a.t === 'swap') { K.swaps++; if (s.players[a.target].hand.length < me.hand.length) K.swapWorse++; }
      if (a.t === 'end') {
        K.turns++;
        const T = s.turn;
        if (CHAR[T.charId].key === 'warlord') K.warTurns++;
        if (me.hand.some(c => constructionOptions(s, me, c).length)) K.missed++;
      }
      if (a.t === 'build' && n2.firstComplete === pid && s.firstComplete === null) {
        K.endGame++;
        const after = structuredClone(n2);
        if (others.some(q => score(after, after.players[q.id]).total > score(after, after.players[pid]).total + 4)) K.endGameBehind++;
      }
    }
    for (const e of n2.ev) if (e.id > s.evSeq && e.k === 'robbed' && levels[e.to]) lvl(levels[e.to]).stolen += e.n;
    s = n2;
    // invariants
    const cards = physicalCards(s), inPlay = cards.length;
    assert.equal(inPlay, TOTAL, 'cards conserved');
    assert.equal(new Set(cards.map(c => c.uid)).size, inPlay, 'duplicate card');
    s.players.forEach(p => assert.ok(p.gold >= 0 && Number.isInteger(p.gold), 'gold'));
    assert.ok(s.taxPool >= 0 && Number.isInteger(s.taxPool), 'tax pool');
    if (s.phase === 'turns') {
      const held = s.players.flatMap(p => p.chars);
      assert.equal(new Set(held).size, held.length, 'character held twice');
      s.players.forEach(p => assert.equal(p.chars.length, charsPerPlayer(n), 'wrong character count'));
    }
  }
  for (const p of s.players) if (levels[p.id] && p.id !== monkeySeat) lvl(levels[p.id]).hoard += p.gold;
  return { s, twins, monkeyMoves };
}

// ── run ──────────────────────────────────────────────────────────────────────
let games = 0, twins = 0, monkeyMoves = 0, roundsSum = 0, longGames = 0, seats = {};
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const [, chars] = SETS[g % SETS.length];
  const n = 2 + (g % 6);
  if (chars.length < n * charsPerPlayer(n) + 1) continue;
  const levels = Array.from({ length: n }, (_, i) => LEVELS[(g + i) % LEVELS.length]);
  const monkeySeat = g % 4 === 3 ? g % n : -1; // every 4th game has a random-move player
  const r = play({ n, chars, goal: g % 2 ? 7 : 8, levels, monkeySeat, seedNo: 9000 + g });
  games++; twins += r.twins; monkeyMoves += r.monkeyMoves; roundsSum += r.s.round;
  if (r.s.round > 15) longGames++;
  levels.forEach((l, i) => { if (i !== monkeySeat) seats[l] = (seats[l] || 0) + 1; });
}
console.log(`${games} games in ${((Date.now() - t0) / 1000).toFixed(0)}s · avg ${(roundsSum / games).toFixed(1)} rounds · ${longGames} games >15 rounds`);
console.log(`fairness: ${twins} re-dealt worlds, AI input identical in every one ✓`);
console.log(`robustness: ${monkeyMoves} random monkey moves, all invariants held ✓\n`);
for (const l of LEVELS) {
  const k = B[l];
  if (!k) continue;
  console.log(`[${l}]`);
  console.log(`  assassin: hit ${pct(k.killHit, k.kill)} · on leader ${pct(k.killOnLeader, k.killHit)} · same rank as last time ${pct(k.killSameRank, k.killPairs)} · ranks ${JSON.stringify(k.killRank)}`);
  console.log(`  thief:    hit ${pct(k.robHit, k.rob)} · richest ${pct(k.robRichest, k.robHit)} · same victim as last time ${pct(k.robSamePerson, k.robPairs)} · gold/rob ${(k.stolen / (k.rob || 1)).toFixed(1)} · ranks ${JSON.stringify(k.robRank)}`);
  console.log(`  warlord:  destroys ${pct(k.destroy, k.warTurns)} of turns · on leader ${pct(k.destroyOnLeader, k.destroy)} · own city ${k.destroyOwn}`);
  console.log(`  seat 0 targeted ${k.targetSeat0}/${k.targetSeat0 + k.targetOther} (of which while leading ${k.seat0Lead})`);
  console.log(`  draft: same character as last round ${pct(k.picksRepeat, k.picksPairs)} · first picks ${JSON.stringify(k.firstPick)}`);
  console.log(`  missed builds ${pct(k.missed, k.turns)} · gold left at end ${(k.hoard / seats[l]).toFixed(1)} · swaps for fewer cards ${k.swapWorse}/${k.swaps} · ended game while >4 behind ${k.endGameBehind}/${k.endGame}\n`);
}
