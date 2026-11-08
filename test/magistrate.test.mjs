// Run explicitly with: node test/magistrate.test.mjs
import assert from 'node:assert/strict';
import { createGame, act, actInPlace, viewFor, currentActor, canConfiscate } from '../js/engine.js';
import { aiAction, safeAction, WARRANT_RANDOM } from '../js/ai.js';
import { determinize } from '../js/search.js';
import { makeDeck } from '../js/data.js';

function fixture(charId = 7, builder = 1) {
  const chars = [17, 2, 11, 4, 5, 16, 7, 8];
  let s = createGame({ players: [0, 1, 2, 3].map(id => ({ name: `P${id}` })), chars, seed: 42 });
  s.deck.push(...s.players.flatMap(p => p.hand));
  s.players.forEach(p => { p.hand = []; p.chars = []; p.gold = 20; });
  s.players[0].chars = [17];
  if (charId !== 17) s.players[builder].chars.push(charId);
  s.phase = 'turns'; s.call = charId === 11 ? 3 : charId === 16 ? 6 : 7;
  s.revealed = [17, charId];
  s.turn = { pid: builder, charId, rank: s.call, income: true, built: 0,
    paidBuild: false, max: charId === 7 ? 3 : 1, used: {}, pending: null };
  s.warrants = { pid: 0, targets: [4, 7, charId === 7 ? 16 : charId].sort((a, b) => a - b), signed: charId, revealed: false };
  return s;
}
function card(s, pid, id, zone = 'hand') {
  const idx = s.deck.findIndex(c => c.id === id);
  assert.ok(idx >= 0, `missing fixture card ${id}`);
  const c = s.deck.splice(idx, 1)[0];
  s.players[pid][zone].push(c);
  return c;
}
function move(s, pid, action) {
  const n = act(s, pid, action);
  assert.ok(!n.error, `${JSON.stringify(action)}: ${n.error}`);
  conserve(n);
  return n;
}
function conserve(s) {
  const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.city]),
    ...(s.turn?.pending?.k === 'keep' ? s.turn.pending.cards : []),
    ...(s.interrupt ? [s.interrupt.card] : [])];
  assert.equal(cards.length, makeDeck().length);
  assert.equal(new Set(cards.map(c => c.uid)).size, cards.length);
}
const reply = (s, take) => ({ t: 'warrantResponse', id: s.interrupt.id, round: s.interrupt.round, take });
function rejected(s, pid, a) {
  for (const fn of [act, actInPlace]) {
    const input = structuredClone(s), before = structuredClone(input);
    assert.ok(fn(input, pid, a).error);
    assert.deepEqual(input, before, 'invalid action mutated state');
  }
}

// Payment is resolved once; only the actual recipient gets placement effects.
{
  let s = fixture();
  const c = card(s, 1, 'castle'), gold = s.players[1].gold;
  s = move(s, 1, { t: 'build', uid: c.uid });
  assert.equal(currentActor(s), 0);
  assert.equal(s.turn.pid, 1);
  assert.equal(s.turn.built, 1);
  assert.equal(s.players[1].city.length, 0);
  assert.equal(s.players[1].gold, gold - c.cost);
  const response = reply(s, true);
  rejected(s, 1, response);
  rejected(s, 0, { ...response, id: response.id + 1 });
  rejected(s, 0, { ...response, round: response.round - 1 });
  rejected(s, 0, { ...response, take: 'yes' });
  for (const a of [{ t: 'end' }, { t: 'gold' }, { t: 'build', uid: c.uid }, { t: 'peek', target: 2 }]) rejected(s, 1, a);
  // Save/reconnect and AI takeover must use the suspended construction.
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(aiAction(viewFor(restored, 0), 0, { lookahead: false }), response);
  assert.equal(safeAction(viewFor(restored, 0), 0).t, 'warrantResponse');
  s = move(restored, 0, response);
  assert.equal(s.players[1].gold, gold);
  assert.equal(s.players[0].city[0].uid, c.uid);
  assert.equal(s.players[0].st.built, 1);
  assert.equal(s.players[1].st?.built || 0, 0);
  assert.equal(currentActor(s), 1);
  rejected(s, 0, response);
}

// Declines, decoys, and duplicate blocks all spend the first paid opportunity.
for (const kind of ['decline', 'decoy', 'duplicate', 'quarry', 'recipientQuarry']) {
  let s = fixture();
  const first = card(s, 1, 'manor'), second = card(s, 1, 'palace');
  if (kind === 'decoy') s.warrants.signed = 4;
  if (['duplicate', 'quarry', 'recipientQuarry'].includes(kind)) card(s, 0, 'manor', 'city');
  if (kind === 'quarry') {
    card(s, 1, 'manor', 'city'); card(s, 1, 'quarry', 'city');
  }
  if (kind === 'recipientQuarry') card(s, 0, 'quarry', 'city');
  s = move(s, 1, { t: 'build', uid: first.uid });
  if (kind !== 'decline') {
    assert.equal(canConfiscate(s), false);
    rejected(s, 0, reply(s, true));
  }
  s = move(s, 0, reply(s, false));
  s = move(s, 1, { t: 'build', uid: second.uid });
  assert.equal(s.interrupt, null);
  assert.equal(s.players[1].city.at(-1).uid, second.uid);
}

// Invalid construction leaves payment, allowance, and first-paid status intact.
{
  const s = fixture(), c = card(s, 1, 'castle');
  s.players[1].gold = 0;
  rejected(s, 1, { t: 'build', uid: c.uid });
  rejected(s, 1, { t: 'build', uid: c.uid, pay: [c.uid] });
}

// Factory discount, mixed/card-only Den payment, and own-character refunds.
for (const own of [false, true]) for (const payment of ['discount', 'mixed', 'cards']) {
  const builder = own ? 0 : 1;
  let s = fixture(7, builder);
  card(s, builder, 'factory', 'city');
  const c = card(s, builder, payment === 'discount' ? 'keep' : 'thieves_den');
  const pay = payment === 'discount' ? [] : ['temple', 'church', 'tavern', 'market', 'watchtower']
    .slice(0, payment === 'mixed' ? 3 : 5).map(id => card(s, builder, id).uid);
  const due = c.cost - 1 - pay.length;
  s.players[builder].gold = due;
  s.players[0].gold = own ? due : 0;
  s = move(s, builder, { t: 'build', uid: c.uid, pay });
  assert.equal(s.interrupt.goldPaid, due);
  assert.equal(s.players[builder].gold, 0);
  s = move(s, 0, reply(s, true));
  assert.equal(s.players[builder].gold, due);
  assert.ok(pay.every(uid => s.deck.some(c => c.uid === uid)));
  assert.equal(s.players[0].city.at(-1).uid, c.uid);
}

// Trader and Wizard retain their building-limit exemptions.
{
  let s = fixture(16);
  const c = card(s, 1, 'market');
  s = move(s, 1, { t: 'build', uid: c.uid });
  assert.equal(s.turn.built, 0);
  s = move(s, 0, reply(s, true));
  const next = card(s, 1, 'castle');
  s = move(s, 1, { t: 'build', uid: next.uid });
  assert.equal(s.interrupt, null);
  assert.equal(s.turn.built, 1);
}
for (const recipientDuplicate of [false, true]) {
  let s = fixture(11);
  card(s, 1, 'castle', 'city');
  if (recipientDuplicate) card(s, 0, 'castle', 'city');
  const c = card(s, 2, 'castle');
  s = move(s, 1, { t: 'peek', target: 2 });
  const v = viewFor(s, 1), world = determinize(v, 1);
  conserve(world);
  assert.deepEqual(world.players[2].hand, s.players[2].hand, 'Wizard known hand lost in search');
  assert.equal(aiAction(v, 1, { lookahead: false }).build, true);
  // Determinization samples the warrant hidden from the Wizard. Restore this
  // fixture's signed target before testing that particular confiscation branch.
  world.warrants.signed = s.warrants.signed;
  s = move(world, 1, { t: 'wizTake', uid: c.uid, build: true });
  assert.equal(s.turn.pending, null);
  assert.equal(s.turn.built, 0);
  assert.equal(canConfiscate(s), !recipientDuplicate);
  s = move(s, 0, reply(s, !recipientDuplicate));
  assert.equal(s.turn.charId, 11);
  assert.equal(s.turn.built, 0);
}

// Completion belongs to the recipient, with normal end-of-round finishing.
{
  let s = fixture();
  s.cfg.goal = 3;
  for (const pid of [0, 1]) { card(s, pid, 'temple', 'city'); card(s, pid, 'market', 'city'); }
  const c = card(s, 1, 'castle');
  s = move(s, 1, { t: 'build', uid: c.uid });
  assert.equal(s.firstComplete, null);
  s = move(s, 0, reply(s, true));
  assert.equal(s.firstComplete, 0);
  assert.equal(s.phase, 'turns');
  assert.equal(s.ev.filter(e => e.k === 'complete').length, 1);
  s = move(s, 1, { t: 'end' });
  assert.equal(s.phase, 'over');
}

// No private signature in public views, including during a decoy response.
{
  let s = fixture();
  const c = card(s, 1, 'castle');
  s = move(s, 1, { t: 'build', uid: c.uid });
  const twin = structuredClone(s); twin.warrants.signed = 4;
  for (const pid of [-1, 1, 2, 3]) assert.deepEqual(viewFor(s, pid), viewFor(twin, pid));
  assert.equal(viewFor(s, 0).warrants.signed, 7);
  for (let n = 0; n < 8; n++) {
    const world = determinize(viewFor(s, 1), 1);
    conserve(world);
    assert.ok(world.warrants.targets.includes(world.warrants.signed));
    const resumed = move(world, 0, safeAction(viewFor(world, 0), 0));
    assert.equal(currentActor(resumed), 1);
    let rollout = resumed, steps = 0;
    while (rollout.phase === 'turns' && rollout.round === s.round) {
      assert.ok(++steps < 400, 'pending construction rollout stalled');
      const pid = currentActor(rollout);
      rollout = move(rollout, pid, aiAction(viewFor(rollout, pid), pid, { lookahead: false }));
    }
    assert.equal(rollout.warrants, null);
  }
}

// Optional assignment, exact target validation, canonical ordering, and reset.
{
  let s = fixture(17, 0);
  s.warrants = null; s.call = 1; s.revealed = [17];
  for (const a of [
    { targets: [4, 4, 7], signed: 4 }, { targets: [4, 7], signed: 4 },
    { targets: [4, 7, 99], signed: 4 }, { targets: [4, 7, 16], signed: 2 },
  ]) rejected(s, 0, { t: 'warrants', ...a });
  const assigned = move(s, 0, { t: 'warrants', targets: [16, 17, 4], signed: 17 });
  assert.deepEqual(assigned.warrants.targets, [4, 16, 17]);
  assert.deepEqual(assigned.ev.at(-1).targets, [4, 16, 17]);
  const c = card(assigned, 0, 'castle');
  const pending = move(assigned, 0, { t: 'build', uid: c.uid });
  assert.equal(currentActor(pending), 0);
  assert.equal(move(pending, 0, reply(pending, true)).interrupt, null);
  s.players.forEach(p => { p.chars = []; }); // no later selected characters
  s = move(s, 0, { t: 'end' });
  assert.equal(s.phase, 'draft');
  assert.equal(s.warrants, null);
  assert.equal(s.turn, null);
  const unused = fixture();
  unused.players.forEach(p => { p.chars = []; });
  const reset = move(unused, 1, { t: 'end' });
  assert.equal(reset.warrants, null, 'unused signed warrant survived the round');
}

// Controlled assignment noise: one draw per legal character, finite fallback.
{
  const previous = WARRANT_RANDOM.next;
  try {
    const s = fixture(17, 0); s.warrants = null; s.call = 1;
    s.players.forEach(p => { p.chars = p.id === 0 ? [17] : []; });
    s.draft.faceUp = s.cfg.chars.filter(c => c !== 17);
    let draws = 0;
    WARRANT_RANDOM.next = () => { draws++; return 0.5; };
    const a = aiAction(viewFor(s, 0), 0, { lookahead: false });
    assert.equal(draws, s.cfg.chars.length);
    assert.equal(new Set(a.targets).size, 3);
    assert.ok(a.targets.includes(a.signed));
    move(s, 0, a);
  } finally { WARRANT_RANDOM.next = previous; }
}

console.log('ok — Magistrate corner cases');
