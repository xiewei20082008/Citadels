// Run: node test/tax-marshal.test.mjs
// Acceptance coverage: spec/tax-collector-and-marshal/corner-cases.md.
// Future-only characters/cards are deliberately outside this suite's scope.
import assert from 'node:assert/strict';
import { createGame, act, actInPlace, viewFor, currentActor, rankOf, score, buildLimit, seizureCost, seizeError, VERSION } from '../js/engine.js';
import { aiAction, safeAction, marshalOptions, SEARCH } from '../js/ai.js';
import { determinize, search } from '../js/search.js';
import { CHAR, PRESETS, makeDeck } from '../js/data.js';

const cast = [17, 18, 11, 4, 5, 16, 7, 20, 19];
function fixture(cid = 7, { chars = cast, n = 4, goal = 8 } = {}) {
  const s = createGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), chars, goal, seed: 42 });
  s.deck.push(...s.players.flatMap(p => p.hand));
  s.players.forEach(p => { p.hand = []; p.chars = []; p.gold = 0; });
  setTurn(s, cid); s.players[0].gold = 10;
  return s;
}
function setTurn(s, cid, pid = 0) {
  s.players[pid].chars = [...new Set([...s.players[pid].chars, cid])];
  s.phase = 'turns'; s.call = rankOf(cid); s.revealed = [...new Set([...s.revealed, cid])];
  s.turn = { pid, charId: cid, rank: rankOf(cid), income: true, built: 0, paidBuild: false, max: buildLimit(cid), used: {}, pending: null };
}
function give(s, pid, id, zone = 'hand', extra = {}) {
  const i = s.deck.findIndex(c => c.id === id); assert.ok(i >= 0, 'missing ' + id);
  const card = Object.assign(s.deck.splice(i, 1)[0], extra);
  s.players[pid][zone].push(card); return card;
}
function conserve(s) {
  const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.city]),
    ...(s.turn?.pending?.k === 'keep' ? s.turn.pending.cards : []), ...(s.interrupt ? [s.interrupt.card] : [])];
  assert.equal(cards.length, makeDeck().length);
  assert.equal(new Set(cards.map(c => c.uid)).size, cards.length);
  for (const p of s.players) assert.ok(Number.isInteger(p.gold) && p.gold >= 0);
  assert.ok(Number.isInteger(s.taxPool) && s.taxPool >= 0);
}
function move(s, pid, a) {
  const before = structuredClone(s), next = act(s, pid, a);
  assert.ok(!next.error, `${JSON.stringify(a)}: ${next.error}`); assert.deepEqual(s, before);
  const fast = structuredClone(s); assert.deepEqual(actInPlace(fast, pid, a), next);
  conserve(next); return next;
}
function reject(s, pid, a) {
  for (const fn of [act, actInPlace]) {
    const input = structuredClone(s), before = structuredClone(input);
    assert.ok(fn(input, pid, a).error, JSON.stringify(a)); assert.deepEqual(input, before);
  }
}
const collect = s => ({ t: 'collectTax', round: s.round, charId: 19 });
const seize = (s, c, target = 1) => ({ t: 'seize', target, uid: c.uid, round: s.round, charId: 20 });
const build = c => ({ t: 'build', uid: c.uid });
const totalGold = s => s.taxPool + s.players.reduce((n, p) => n + p.gold, 0);

// Unique IDs, rank validation, unchanged presets, and incompatible save version.
assert.equal(CHAR[8].key, 'warlord'); assert.equal(CHAR[9].key, 'queen');
assert.equal(rankOf(19), 9); assert.equal(rankOf(20), 8); assert.ok(VERSION > 4);
assert.deepEqual(PRESETS.classic, [1, 2, 3, 4, 5, 6, 7, 8]);
for (const duplicate of [8, 9]) assert.throws(() => fixture(7, { chars: [...cast, duplicate] }), /one character per rank/);

// T01-T10, T19: assess after payment, once per construction, no up-front surcharge.
for (const [gold, paidTax] of [[3, 0], [4, 1], [5, 1]]) {
  const s = fixture(); s.players[0].gold = gold;
  const c = give(s, 0, 'manor'), next = move(s, 0, build(c));
  assert.equal(next.players[0].gold, gold - 3 - paidTax); assert.equal(next.taxPool, paidTax);
  assert.equal(next.players[0].st.built, 1);
}
for (const state of ['absent', 'faceUp', 'faceDown', 'unchosen', 'killed']) {
  const s = fixture(7, { chars: state === 'absent' ? cast.filter(c => c !== 19) : cast });
  if (state === 'faceUp') s.draft.faceUp = [19];
  if (state === 'faceDown') s.draft.faceDown = [19];
  if (state === 'killed') s.killed = 9;
  const n = move(s, 0, build(give(s, 0, 'temple')));
  assert.equal(n.taxPool, state === 'absent' ? 0 : 1);
  reject(s, 0, collect(s));
}
{
  let s = fixture(); s.players[0].gold = 5;
  const a = give(s, 0, 'market'), b = give(s, 0, 'church');
  s = move(s, 0, build(a)); assert.equal(s.players[0].gold, 2);
  s = move(s, 0, build(b)); assert.equal(s.players[0].gold, 0); assert.equal(s.taxPool, 1);
}
{
  const s = fixture(16); give(s, 0, 'factory', 'city');
  const free = give(s, 0, 'graveyard');
  let n = move(s, 0, build(free)); assert.equal(n.players[0].gold, 9); assert.equal(n.taxPool, 1);
  // Trader green construction does not use the ordinary limit but still pays tax.
  n.turn.built = n.turn.max;
  n = move(n, 0, build(give(n, 0, 'tavern'))); assert.equal(n.taxPool, 2); assert.equal(n.turn.built, n.turn.max);
}
{
  const s = fixture(); s.players[0].gold = 1;
  const den = give(s, 0, 'thieves_den');
  const pay = ['temple', 'tavern', 'watchtower', 'market', 'church', 'prison'].map(id => give(s, 0, id).uid);
  const n = move(s, 0, { ...build(den), pay }); assert.equal(n.taxPool, 1); assert.equal(n.players[0].gold, 0);
}
for (const n of [2, 3]) {
  const s = fixture(19, { n }); s.players[0].chars = [19, 7];
  let next = move(s, 0, build(give(s, 0, 'temple'))); assert.equal(next.taxPool, 0);
  setTurn(next, 7); next = move(next, 0, build(give(next, 0, 'tavern'))); assert.equal(next.taxPool, 1);
}

// T11-T16: optional timing, empty collection, repeat/stale/malformed requests,
// pending decisions, JSON save/reconnect, and round carry-over.
for (const timing of ['before', 'afterIncome', 'afterBuild']) {
  let s = fixture(19); s.taxPool = 7; s.turn.income = false;
  if (timing !== 'before') s = move(s, 0, { t: 'gold' });
  if (timing === 'afterBuild') s = move(s, 0, build(give(s, 0, 'manor')));
  const before = totalGold(s), gold = s.players[0].gold;
  s = move(s, 0, { ...collect(s), amount: 999, pool: 999 });
  assert.equal(s.taxPool, 0); assert.equal(s.players[0].gold, gold + 7); assert.equal(totalGold(s), before);
  assert.equal(s.turn.income, timing !== 'before'); reject(JSON.parse(JSON.stringify(s)), 0, collect(s));
}
{
  let s = fixture(19); s.turn.income = false;
  s = move(s, 0, collect(s)); assert.equal(s.turn.used.ability, true); reject(s, 0, collect(s));
  s = move(s, 0, { t: 'gold' }); s = move(s, 0, { t: 'end' }); assert.equal(s.taxPool, 0);
}
{
  let s = fixture(19); s.taxPool = 7;
  for (const a of [{ t: 'collectTax' }, { ...collect(s), round: 0 }, { ...collect(s), charId: 9 }]) reject(s, 0, a);
  reject(s, 1, collect(s)); s.turn.income = false;
  reject(s, '0', collect(s));
  const pending = move(s, 0, { t: 'draw' }); reject(pending, 0, collect(pending));
  s = move(s, 0, { t: 'gold' }); s = move(s, 0, { t: 'end' });
  assert.equal(s.phase, 'draft'); assert.equal(s.taxPool, 7);
  setTurn(s, 19); s = move(s, 0, collect(s)); assert.equal(s.players[0].gold, 19);
}

// C01-C10: defer taxes until the warrant's final ownership, including self
// aliases, duplicate refusal, zero-gold recipient, Wizard and pending reload.
for (const cid of [7, 19, 11]) for (const take of [false, true]) for (const same of [false, true]) {
  let s = fixture(cid), recipient = same ? 0 : 2;
  s.players[recipient].chars.push(17);
  s.warrants = { pid: recipient, targets: [cid, 4, 16], signed: cid, revealed: false };
  const card = give(s, cid === 11 ? 1 : 0, 'manor');
  if (cid === 11) {
    s = move(s, 0, { t: 'peek', target: 1 }); s = move(s, 0, { t: 'wizTake', uid: card.uid, build: true });
  } else s = move(s, 0, build(card));
  assert.equal(s.taxPool, 0); assert.equal(s.players[0].gold, 7); assert.equal(currentActor(s), recipient);
  s = JSON.parse(JSON.stringify(s));
  reject(s, 0, collect(s));
  const a = { t: 'warrantResponse', id: s.interrupt.id, round: s.round, take };
  reject(s, recipient, { ...a, id: a.id + 1 });
  const goldBefore = s.players[recipient].gold;
  s = move(s, recipient, a);
  const owner = take ? recipient : 0, tax = take ? (goldBefore + (same ? 3 : 0) > 0 ? 1 : 0) : cid === 19 ? 0 : 1;
  assert.equal(s.taxPool, tax); assert.equal(s.players[owner].city.at(-1).uid, card.uid);
  assert.equal(s.players[0].gold, 7 + (take ? 3 : 0) - (owner === 0 ? tax : 0));
  assert.equal(s.turn.built, cid === 11 ? 0 : 1); reject(s, recipient, a);
}
for (const reason of ['unsigned', 'duplicate']) {
  let s = fixture(7); s.players[2].gold = 5;
  s.warrants = { pid: 2, targets: [7, 4, 16], signed: reason === 'unsigned' ? 4 : 7, revealed: false };
  if (reason === 'duplicate') give(s, 2, 'manor', 'city');
  s = move(s, 0, build(give(s, 0, 'manor')));
  const a = { t: 'warrantResponse', id: s.interrupt.id, round: s.round, take: true };
  reject(s, 2, a); s = move(s, 2, { ...a, take: false });
  assert.equal(s.taxPool, 1); assert.equal(s.players[2].gold, 5);
}
{
  let s = fixture(19); s.players[2].gold = 4;
  s.warrants = { pid: 2, targets: [19, 4, 16], signed: 19, revealed: false };
  s = move(s, 0, build(give(s, 0, 'temple')));
  s = move(s, 2, { t: 'warrantResponse', id: s.interrupt.id, round: s.round, take: true });
  assert.equal(s.taxPool, 1); assert.equal(s.players[2].gold, 3); assert.equal(s.players[0].gold, 10);
}

// M01-M18, O01-O08,O11: independent payment and transfer, metadata and stats.
for (const id of ['temple', 'church', 'manor', 'keep', 'secret_vault']) {
  const s = fixture(20), card = give(s, 1, id, 'city', { round: -3, attached: { marker: 'retained' } });
  s.players[0].gold = card.cost; s.players[1].gold = 4;
  give(s, 0, 'factory', 'city'); give(s, 1, 'great_wall', 'city'); give(s, 1, 'graveyard', 'city');
  s.warrants = { pid: 2, targets: [20, 4, 19], signed: 20, revealed: false };
  const original = structuredClone(card), gold = totalGold(s), beforeScore = score(s, s.players[1]).total;
  const n = move(s, 0, { ...seize(s, card), cost: -999, exemption: true });
  assert.deepEqual(n.players[0].city.at(-1), original); assert.equal(n.players[0].gold, 0);
  assert.equal(n.players[1].gold, 4 + card.cost); assert.equal(n.taxPool, 0); assert.equal(totalGold(n), gold);
  assert.equal(n.turn.built, 0); assert.equal(n.turn.paidBuild, false); assert.equal(n.interrupt, null);
  assert.equal(n.players[0].st.seized, 1); assert.ok(!n.players[0].st.built); assert.ok(!n.players[0].st.razed);
  assert.ok(score(n, n.players[1]).total < beforeScore);
  assert.equal(n.ev.filter(e => e.k === 'seize').length, 1); reject(n, 0, seize(n, card));
  reject(JSON.parse(JSON.stringify(n)), 0, seize(n, card));
}
for (const reason of ['cost', 'poor', 'self', 'hand', 'otherCity', 'duplicate', 'quarry', 'bishop', 'wrongSeat', 'staleRound', 'staleChar', 'missingIdentity', 'used', 'pending', 'killed']) {
  const s = fixture(20); const card = give(s, reason === 'otherCity' ? 2 : 1, reason === 'cost' ? 'castle' : 'manor', reason === 'hand' ? 'hand' : 'city');
  let a = seize(s, card), pid = 0;
  if (reason === 'poor') s.players[0].gold = 2;
  if (reason === 'self') a.target = 0;
  if (reason === 'duplicate' || reason === 'quarry') give(s, 0, 'manor', 'city');
  if (reason === 'quarry') give(s, 0, 'quarry', 'city');
  if (reason === 'bishop') s.players[1].chars = [5];
  if (reason === 'wrongSeat') pid = 1;
  if (reason === 'staleRound') a.round--;
  if (reason === 'staleChar') a.charId = 8;
  if (reason === 'missingIdentity') a = { t: 'seize', target: 1, uid: card.uid };
  if (reason === 'used') s.turn.used.ability = true;
  if (reason === 'pending') s.turn.pending = { k: 'keep', cards: [], n: 1 };
  if (reason === 'killed') s.killed = 8;
  reject(s, pid, a);
}
for (const target of [-1, 99, '1', null, {}, 1.1]) {
  const s = fixture(20), card = give(s, 1, 'manor', 'city'); reject(s, 0, seize(s, card, target));
}
for (const cid of [19, 20]) for (const interruption of ['graveyard', 'warrant']) {
  const s = fixture(cid), card = give(s, 1, 'manor', 'city');
  // Interrupt snapshots are observations here; rejection must not touch them.
  s.interrupt = { k: interruption, pid: 2, card, builder: 0, goldPaid: 3, id: 1, round: s.round };
  const a = cid === 19 ? collect(s) : seize(s, card);
  reject(s, 0, a); reject(s, 2, a);
  s.interrupt = null;
  for (const phase of ['draft', 'over']) { s.phase = phase; reject(s, 0, a); }
}
for (const bishop of ['dead', 'abbot']) {
  const s = fixture(20); s.players[1].chars = [bishop === 'abbot' ? 13 : 5];
  if (bishop === 'dead') s.killed = 5;
  move(s, 0, seize(s, give(s, 1, 'manor', 'city')));
}
for (const goal of [7, 8]) {
  const s = fixture(20, { goal });
  for (const id of ['temple', 'church', 'manor', 'tavern', 'market', 'prison', 'watchtower', 'docks'].slice(0, goal)) give(s, 1, id, 'city');
  reject(s, 0, seize(s, s.players[1].city[0]));
  // A completed receiving city is allowed to grow further.
  [s.players[0].city, s.players[1].city] = [s.players[1].city, s.players[0].city];
  move(s, 0, seize(s, give(s, 1, 'monastery', 'city')));
}
for (const order of ['buildFirst', 'seizeFirst']) {
  let s = fixture(20); const card = give(s, 1, 'prison', 'city'), own = give(s, 0, 'temple');
  const a = order === 'buildFirst' ? build(own) : seize(s, card), b = order === 'buildFirst' ? seize(s, card) : build(own);
  s = move(s, 0, a); s = move(s, 0, b);
  assert.equal(s.players[0].city.length, 2); assert.equal(s.taxPool, 1); assert.equal(s.turn.built, 1);
  assert.equal(s.players[0].gold, 6); assert.equal(s.players[0].st.built, 1); assert.equal(s.players[0].st.seized, 1);
}

// O02-O04, T17-T20: income at reveal once, theft before collection, final
// round runs through rank 9, and leftover pool never changes scores.
{
  let s = fixture(7); s.players[0].chars = [7, 20]; s.players[1].chars = [19];
  give(s, 0, 'school_of_magic', 'city'); give(s, 0, 'watchtower', 'city');
  const card = give(s, 2, 'prison', 'city'); s.players[0].gold = 0;
  s = move(s, 0, { t: 'end' }); assert.equal(s.turn.charId, 20); assert.equal(s.players[0].gold, 2);
  s = move(s, 0, seize(s, card, 2)); assert.equal(s.players[0].gold, 0);
  s = move(s, 0, { t: 'gold' }); assert.equal(s.players[0].gold, 2);
}
for (const completing of ['build', 'seize']) {
  let s = fixture(20, { goal: 7 }); s.players[1].chars = [19]; s.players[1].gold = 4;
  for (const id of ['temple', 'church', 'manor', 'tavern', 'market', 'watchtower']) give(s, 0, id, 'city');
  const card = give(s, completing === 'build' ? 0 : 2, 'prison', completing === 'build' ? 'hand' : 'city');
  s.taxPool = 5; s.robbed = 9; s.robber = 3;
  s = move(s, 0, completing === 'build' ? build(card) : seize(s, card, 2));
  assert.equal(s.firstComplete, 0); assert.equal(s.phase, 'turns');
  s = move(s, 0, { t: 'end' }); assert.equal(s.turn.charId, 19);
  assert.equal(s.players[1].gold, 0); assert.equal(s.players[3].gold, 4); assert.equal(s.taxPool, completing === 'build' ? 6 : 5);
  const pool = s.taxPool; s = move(s, 1, collect(s)); assert.equal(s.players[1].gold, pool);
  s = move(s, 1, { t: 'gold' }); s = move(s, 1, { t: 'end' }); assert.equal(s.phase, 'over');
}
for (const killed of [false, true]) {
  let s = fixture(20); s.taxPool = 13; s.firstComplete = 0; s.players[1].chars = [19];
  if (killed) s.killed = 9;
  s = move(s, 0, { t: 'end' });
  if (!killed) { s = move(s, 1, { t: 'gold' }); s = move(s, 1, { t: 'end' }); }
  assert.equal(s.phase, 'over'); assert.equal(s.taxPool, 13);
  const without = { ...s, taxPool: 0 }; assert.deepEqual(s.players.map(p => score(s, p)), s.players.map(p => score(without, p)));
}
{
  const s = fixture(18); s.taxPool = 8; s.players[1].chars = [19]; s.players[1].gold = 0;
  give(s, 1, 'market');
  const n = move(s, 0, { t: 'spy', target: 1, color: 'green', round: s.round }); assert.equal(n.taxPool, 8);
}

// A01-A12: privacy, determinization, refresh planning, no empty-action loops,
// shared gold budgets, losing completion, and lookahead actions.
{
  let s = fixture(19); s.players[0].gold = 0; s.taxPool = 7; s.turn.income = false;
  give(s, 0, 'manor');
  const a = aiAction(viewFor(s, 0), 0, { lookahead: false }); assert.equal(a.t, 'collectTax');
  s = move(s, 0, a); assert.notEqual(aiAction(viewFor(s, 0), 0, { lookahead: false }).t, 'end');
  assert.notEqual(aiAction(viewFor(s, 0), 0, { lookahead: false }).t, 'collectTax');
  const empty = fixture(19); assert.notEqual(aiAction(viewFor(empty, 0), 0, { lookahead: false }).t, 'collectTax');
}
{
  const s = fixture(20); s.taxPool = 6; s.players[0].gold = 3;
  s.players[1].chars = [4];
  give(s, 1, 'manor', 'city'); give(s, 0, 'monastery');
  const v = viewFor(s, 0), sampled = determinize(v, 0); conserve(sampled); assert.equal(sampled.taxPool, 6);
  const choices = marshalOptions(v, v.players[0]); assert.equal(choices.length, 1);
  assert.equal(seizureCost(s.players[1].city[0]), 3); assert.equal(seizeError(v, v.players[0], v.players[1], v.players[1].city[0]), null);
  const a = aiAction(v, 0, { lookahead: false }); assert.ok(['build', 'seize'].includes(a.t));
  const n = move(s, 0, a), next = aiAction(viewFor(n, 0), 0, { lookahead: false });
  assert.equal(next.t, 'end'); move(n, 0, safeAction(viewFor(n, 0), 0));
  move(s, 0, search(v, 0, [...choices.map(o => o.action), build(s.players[0].hand[0])], 8));
  const twin = structuredClone(s); twin.deck.reverse(); twin.players[1].chars = [19];
  assert.deepEqual(viewFor(twin, 0), v);
  const random = Math.random; Math.random = () => 0.5;
  try { assert.deepEqual(aiAction(viewFor(twin, 0), 0), aiAction(v, 0)); } finally { Math.random = random; }
  for (const pid of [-1, 1, 2, 3]) {
    const other = viewFor(s, pid); assert.equal(other.taxPool, 6);
    assert.ok(!other.ev.some(e => e.poolOwner)); assert.ok(other.players[0].hand.every(c => c.hidden));
  }
}
{
  const s = fixture(20, { goal: 7 }); s.players[0].gold = 3;
  for (const id of ['temple', 'church', 'tavern', 'market', 'watchtower', 'prison']) give(s, 0, id, 'city');
  const c = give(s, 1, 'manor', 'city');
  for (const id of ['dragon_gate', 'university', 'library', 'school_of_magic', 'basilica']) give(s, 2, id, 'city');
  assert.ok(marshalOptions(viewFor(s, 0), s.players[0]).every(o => o.utility <= 0));
  assert.equal(aiAction(viewFor(s, 0), 0, { lookahead: false }).t, 'end'); move(s, 0, seize(s, c));
}
{
  // Only seizure THEN building fits: building first pays an intervening tax.
  let s = fixture(20); s.players[0].gold = 3;
  give(s, 1, 'tavern', 'city'); give(s, 0, 'church');
  const a = aiAction(viewFor(s, 0), 0, { lookahead: false }); assert.equal(a.t, 'seize');
  s = move(s, 0, a);
  const b = aiAction(viewFor(s, 0), 0, { lookahead: false }); assert.equal(b.t, 'build');
  s = move(s, 0, b); assert.equal(s.players[0].city.length, 2); assert.equal(s.taxPool, 0);
}

// A13-A14: seeded all-AI games, both goals, 2-7 seats, varied casts. Every
// action is legal without fallback; card and gold invariants run at every step.
const random = Math.random; let seed = 900;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
let games = 0, carried = 0, collected = 0, seized = 0;
try {
  for (const chars of [cast, [1, 2, 3, 4, 5, 6, 7, 20, 19], [17, 18, 15, 12, 13, 16, 14, 20, 19]])
    for (let n = 2; n <= 7; n++) for (const goal of [7, 8]) for (const gameSeed of [13, 71]) {
      let s = createGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), chars, goal, seed: gameSeed });
      let steps = 0;
      while (s.phase !== 'over') {
        assert.ok(++steps < 3000, 'action loop'); const pid = currentActor(s), v = viewFor(s, pid);
        const a = aiAction(v, pid, { lookahead: false }), next = act(s, pid, a);
        assert.ok(!next.error, `${JSON.stringify(a)}: ${next.error}`); conserve(next);
        if (next.round !== s.round && s.taxPool > 0) { assert.equal(next.taxPool, s.taxPool); carried++; }
        if (a.t === 'collectTax') collected++; if (a.t === 'seize') seized++;
        s = next;
      }
      assert.ok(s.round < 40, 'round cap'); games++;
    }
  // Full lookahead smoke with every decision using the production search path.
  SEARCH.budget = 8;
  let s = createGame({ players: [0, 1, 2].map(i => ({ name: 'P' + i })), chars: cast, goal: 7, seed: 411 });
  let steps = 0;
  while (s.phase !== 'over') {
    assert.ok(++steps < 3000); const pid = currentActor(s), a = aiAction(viewFor(s, pid), pid);
    const next = act(s, pid, a); assert.ok(!next.error, JSON.stringify(a) + ': ' + next.error); conserve(next); s = next;
  }
} finally { Math.random = random; SEARCH.budget = 120; }
assert.ok(carried > 0 && collected > 0 && seized > 0);
console.log(`Tax Collector / Marshal: corner-case checks + ${games} games + full-lookahead smoke passed (${carried} pool carryovers, ${collected} collections, ${seized} seizures).`);
