// Run: node test/spy.test.mjs
import assert from 'node:assert/strict';
import { createGame, act, actInPlace, viewFor, currentActor } from '../js/engine.js';
import { aiAction, safeAction, spyRewards, spyOptions } from '../js/ai.js';
import { determinize } from '../js/search.js';
import { makeDeck, COLORS } from '../js/data.js';

const chars = [17, 18, 11, 4, 5, 16, 7, 8];
const action = (s, color = 'green', target = 1) => ({ t: 'spy', target, color, round: s.round });
function fixture(matches = 3, gold = 1) {
  const s = createGame({ players: [0, 1, 2, 3].map(id => ({ name: `P${id}` })), chars, seed: 42 });
  s.deck.push(...s.players.flatMap(p => p.hand));
  s.players.forEach(p => { p.hand = []; p.chars = []; p.gold = 0; });
  s.players[0].chars = [18]; s.players[1].chars = [7];
  s.players[1].gold = gold;
  for (let i = 0; i < matches; i++) give(s, 1, 'tavern', 'green');
  s.phase = 'turns'; s.call = 2; s.revealed = [18];
  s.turn = { pid: 0, charId: 18, rank: 2, income: false, built: 0, paidBuild: false, max: 1, used: {}, pending: null };
  return s;
}
function give(s, pid, id, fallbackColor) {
  let index = s.deck.findIndex(c => c.id === id);
  if (index < 0 && fallbackColor) index = s.deck.findIndex(c => c.color === fallbackColor);
  assert.ok(index >= 0);
  const card = s.deck.splice(index, 1)[0]; s.players[pid].hand.push(card); return card;
}
function conserve(s) {
  const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.city]),
    ...(s.turn?.pending?.k === 'keep' ? s.turn.pending.cards : []), ...(s.interrupt ? [s.interrupt.card] : [])];
  assert.equal(cards.length, makeDeck().length);
  assert.equal(new Set(cards.map(c => c.uid)).size, cards.length);
}
function move(s, pid, a) {
  const next = act(s, pid, a); assert.ok(!next.error, `${JSON.stringify(a)}: ${next.error}`); conserve(next); return next;
}
function reject(s, pid, a) {
  for (const fn of [act, actInPlace]) {
    const input = structuredClone(s), before = structuredClone(input);
    assert.ok(fn(input, pid, a).error); assert.deepEqual(input, before);
  }
}

// Independent gold/card caps, duplicates, empty hands and exhausted decks.
for (const [matches, gold, deckSize] of [[0, 7, 50], [1, 7, 50], [3, 1, 50], [3, 0, 50], [5, 7, 50], [3, 5, 1], [3, 5, 0]]) {
  const s = fixture(matches, gold);
  // Move excess cards into a third hand to retain physical-card conservation.
  s.players[2].hand.push(...s.deck.splice(deckSize));
  const before = structuredClone(s), targetHand = structuredClone(s.players[1].hand);
  const n = move(s, 0, action(s));
  assert.deepEqual(s, before, 'act mutates its input');
  assert.equal(n.players[0].gold, Math.min(matches, gold));
  assert.equal(n.players[1].gold, gold - Math.min(matches, gold));
  assert.equal(n.players[0].hand.length, Math.min(matches, 2, deckSize));
  assert.deepEqual(n.players[1].hand, targetHand);
  assert.deepEqual(n.turn.spyPeek.cards, targetHand);
  assert.equal(n.turn.income, false);
  assert.equal(n.players[0].st.stole, Math.min(matches, gold));
  reject(n, 0, action(n));
  assert.ok(!move(n, 0, safeAction(viewFor(n, 0), 0)).error);
}

// Printed types only: School of Magic in hand is purple, city cards don't count.
for (const color of COLORS) {
  const s = fixture(0, 5);
  give(s, 1, 'school_of_magic'); give(s, 1, 'haunted_city');
  const city = give(s, 1, 'market'); s.players[1].city.push(s.players[1].hand.pop());
  assert.equal(city.color, 'green');
  const n = move(s, 0, action(s, color));
  assert.equal(n.players[0].gold, color === 'purple' ? 2 : 0);
}

// Full validation precedes mutations and private inspection.
{
  const s = fixture();
  for (const a of [action(s, 'orange'), action(s, 'green', 0), action(s, 'green', -1), action(s, 'green', 99),
    action(s, 'green', '1'), { ...action(s), round: s.round - 1 }, { t: 'spy', target: 1, color: 'green' }]) reject(s, 0, a);
  reject(s, 1, action(s));
  const other = structuredClone(s); other.turn.charId = 7; reject(other, 0, action(other));
  const pending = move(s, 0, { t: 'draw' }); reject(pending, 0, action(pending));
  const killed = structuredClone(s); killed.phase = 'draft'; reject(killed, 0, action(killed));
}

// Privacy survives serialization, spectators and network views. Snapshots expire with the turn.
{
  let s = move(fixture(), 0, action(fixture()));
  s = JSON.parse(JSON.stringify(s));
  assert.deepEqual(viewFor(s, 0).turn.spyPeek, s.turn.spyPeek);
  for (const pid of [-1, 1, 2, 3]) {
    const v = viewFor(s, pid); assert.equal(v.turn.spyPeek, undefined);
    assert.ok(v.players[0].hand.every(c => c.hidden));
    assert.ok(!v.ev.some(e => e.cards || e.hand || e.spyPeek));
  }
  // Determinized worlds preserve the observed hand, without duplicate physical cards.
  for (let i = 0; i < 10; i++) {
    const sampled = determinize(viewFor(s, 0), 0); conserve(sampled);
    assert.deepEqual(sampled.players[1].hand, s.turn.spyPeek.cards);
  }
  assert.notEqual(aiAction(viewFor(s, 0), 0, { lookahead: false }).t, 'spy');
  s = move(s, 0, { t: 'gold' }); s = move(s, 0, { t: 'end' });
  assert.ok(!s.turn?.spyPeek);
  const later = fixture(); later.round++; reject(later, 0, action(fixture()));
}

// Library/Observatory do not alter Spy draws; normal resources remain separate.
{
  let s = fixture(5, 7);
  for (const id of ['library', 'observatory']) { const c = give(s, 0, id); s.players[0].city.push(s.players[0].hand.pop()); assert.ok(c); }
  s = move(s, 0, action(s)); assert.equal(s.players[0].hand.length, 2); assert.equal(s.turn.pending, null);
  s = move(s, 0, { t: 'draw' }); assert.equal(s.players[0].hand.length, 5);
}

// Ability remains legal after resources/building and across a warrant interruption.
{
  let s = fixture(3, 4); s.players[0].gold = 10;
  const c = give(s, 0, 'temple');
  s.warrants = { pid: 2, targets: [18, 4, 7], signed: 18, revealed: false };
  s = move(s, 0, { t: 'gold' }); s = move(s, 0, { t: 'build', uid: c.uid });
  assert.equal(currentActor(s), 2); reject(s, 0, action(s));
  s = move(s, 2, { t: 'warrantResponse', id: s.interrupt.id, round: s.round, take: false });
  s = move(s, 0, action(s)); assert.equal(s.turn.built, 1); assert.equal(s.players[0].hand.length, 2);
}

// Private knowledge and once-per-turn usage also survive suspended construction.
{
  // An already-used Spy snapshot survives an interrupt without leaking to its actor.
  let s = fixture(3, 4); s.players[0].gold = 10;
  const card = give(s, 0, 'temple');
  s.warrants = { pid: 2, targets: [18, 4, 7], signed: 18, revealed: false };
  s = move(s, 0, action(s));
  const snapshot = structuredClone(s.turn.spyPeek);
  s = move(s, 0, { t: 'gold' }); s = move(s, 0, { t: 'build', uid: card.uid });
  assert.deepEqual(viewFor(s, 0).turn.spyPeek, snapshot);
  assert.equal(viewFor(s, 2).turn.spyPeek, undefined);
  s = move(s, 2, { t: 'warrantResponse', id: s.interrupt.id, round: s.round, take: true });
  assert.deepEqual(s.turn.spyPeek, snapshot); reject(s, 0, action(s));
}

// Exact capped expectation: drawing two from a pool of four with two matches.
{
  const r = spyRewards(4, 2, 2, 1, 1);
  assert.ok(Math.abs(r.gold - 5 / 6) < 1e-12);
  assert.ok(Math.abs(r.cards - 5 / 6) < 1e-12);
  assert.deepEqual(spyRewards(0, 0, 0, 0, 0), { gold: 0, cards: 0 });
}

// AI maximizes the documented utility using only its view, even with no payable gold.
for (const gold of [0, 5]) {
  const s = fixture(4, gold), v = viewFor(s, 0);
  const options = spyOptions(v, v.players[0]);
  const a = aiAction(v, 0, { lookahead: false });
  const chosen = options.find(o => JSON.stringify(o.action) === JSON.stringify(a));
  assert.equal(chosen.utility, Math.max(...options.map(o => o.utility)));
  assert.equal(a.target, 1); assert.ok(COLORS.includes(a.color)); move(s, 0, a);
  const twin = structuredClone(s);
  [twin.players[1].hand[0], twin.deck[0]] = [twin.deck[0], twin.players[1].hand[0]];
  assert.deepEqual(viewFor(twin, 0), v);
  assert.deepEqual(aiAction(viewFor(twin, 0), 0, { lookahead: false }), a);
}
assert.throws(() => createGame({ players: [{}, {}], chars: [...chars, 2] }), /one character per rank/);
console.log('Spy: capped rewards, timing, privacy, sampling, AI utility and validation passed.');
