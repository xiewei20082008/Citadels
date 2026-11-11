// Run: node test/engine.test.mjs
// Plays hundreds of all-AI games across player counts, character sets with Cunning AI, fuzzes the
// action API with garbage, and checks rules + hidden-information invariants.
import assert from 'node:assert/strict';
import { physicalCards, createGame, act, viewFor, currentActor, score, charsPerPlayer, shielded } from '../js/engine.js';
import { aiAction, safeAction } from '../js/ai.js';
import { PRESETS, makeDeck } from '../js/data.js';
import { KEYS, t, RULES, EXTRA, pickLang } from '../js/i18n.js';

const TOTAL = makeDeck().length;
const cardsInPlay = s => physicalCards(s).length;

function step(s) {
  const pid = currentActor(s);
  assert.ok(pid !== null && pid !== undefined, 'no actor in phase ' + s.phase);
  const v = viewFor(s, pid);
  for (const q of v.players) if (q.id !== pid) {
    q.hand.forEach(c => assert.ok(c.hidden, 'hand leak'));
    assert.equal(q.saw.length, 0, 'draft memory leak');
    q.chars.forEach(c => assert.ok(s.revealed.includes(c), 'character leak'));
  }
  assert.equal(v.deck.length, 0);
  if (v.turn?.pending && v.turn.pid !== pid) assert.ok(!v.turn.pending.cards, 'pending leak');
  if (v.turn && v.turn.pid !== pid) assert.ok(!v.turn.spyPeek, 'spy inspection leak');
  let n = act(s, pid, aiAction(v, pid)), fb = 0;
  if (n.error) { fb = 1; n = act(s, pid, safeAction(v, pid)); }
  assert.ok(!n.error, 'safe action failed: ' + n.error);
  return [n, fb];
}

function play(n, chars, seed, goal) {
  let s = createGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, ai: true })), chars, goal, seed });
  let steps = 0, fallbacks = 0, interrupts = 0;
  while (s.phase !== 'over') {
    assert.ok(++steps < 20000, 'game stalled');
    let fb;
    [s, fb] = step(s);
    fallbacks += fb;
    if (s.interrupt) interrupts++;
    assert.equal(cardsInPlay(s), TOTAL, 'cards conserved');
    s.players.forEach(p => assert.ok(p.gold >= 0, 'gold >= 0'));
  }
  assert.ok(s.scores.length === n && s.winner !== null);
  return { rounds: s.round, fallbacks, interrupts };
}

let games = 0, rounds = 0, fallbacks = 0, interrupts = 0;
for (const [name, chars] of [...Object.entries(PRESETS),
  ['spy', [1, 18, 3, 4, 5, 6, 7, 8, 9]],
  ['spy-magistrate', [17, 18, 11, 12, 13, 16, 14, 8, 9]]])
  for (let n = 2; n <= 7; n++)
    for (let seed = 1; seed <= 9; seed++) {
      if (chars.length < n * charsPerPlayer(n) + 1) continue;
      const r = play(n, chars, seed * 7919 + n, seed % 2 ? 8 : 7);
      games++; rounds += r.rounds; fallbacks += r.fallbacks; interrupts += r.interrupts;
      assert.ok(r.rounds < 40, `${name} n=${n} hit round cap`);
    }

// Old saved difficulty preferences must always resolve to Cunning.
{
  const random = Math.random;
  try {
    for (const level of [undefined, 'easy', 'normal', 'hard']) {
      const s = createGame({ players: [0, 1, 2, 3].map(i => ({ name: 'P' + i, ai: true })), chars: PRESETS.classic, seed: 42, level });
      assert.equal(s.cfg.level, 'hard');
      const pid = currentActor(s), v = viewFor(s, pid);
      Math.random = () => 0.5;
      const expected = aiAction(v, pid);
      v.cfg.level = level; // Existing saves may still contain the retired value.
      assert.deepEqual(aiAction(v, pid), expected);
    }
  } finally { Math.random = random; }
}

// Fuzz: garbage and random actions must never throw or corrupt state.
{
  const junk = [null, 1, 'x', {}, { t: 5 }, { t: 'build', uid: { a: 1 } }, { t: 'keep', uids: 'abc' }, { t: 'kill', rank: '4' },
    { t: 'destroy', target: 99, uid: 'c1' }, { t: 'swap', target: -1 }, { t: 'pick', charId: 'king' }, { t: 'redraw', uids: [null] },
    { t: 'seerGive', uids: [1, 2] }, { t: 'graveyard', take: true }, { t: 'discard', charId: 4 }, { t: '__proto__' }];
  let s = createGame({ players: [0, 1, 2, 3].map(i => ({ name: 'P' + i, ai: true })), chars: PRESETS.mixed, seed: 42 });
  for (let i = 0; i < 4000 && s.phase !== 'over'; i++) {
    const pid = Math.floor(Math.random() * 5) - (i % 7 === 0 ? 1 : 0);
    const r = act(s, pid, junk[i % junk.length]);
    assert.ok(r.error, 'junk accepted: ' + JSON.stringify(junk[i % junk.length]));
    [s] = step(s);
    assert.equal(cardsInPlay(s), TOTAL);
  }
}

// Targeted rule checks
{
  const s = createGame({ players: [0, 1, 2, 3].map(i => ({ name: 'P' + i })), chars: PRESETS.classic, seed: 5 });
  assert.equal(s.draft.faceUp.length, 2, '4p: two face-up');
  assert.ok(!s.draft.faceUp.includes(4), 'king never face-up');
  const s3 = createGame({ players: [0, 1, 2].map(i => ({ name: 'P' + i })), chars: PRESETS.classic, seed: 5 });
  assert.equal(s3.draft.order.length, 6, '3p: two characters each');
  assert.ok(act(s, s.draft.order[1], { t: 'pick', charId: s.draft.avail[0] }).error, 'out-of-turn pick rejected');
}
{
  // two players: pick, then pick+discard ×3 → two characters each, nothing face up
  let s = createGame({ players: [0, 1].map(i => ({ name: 'P' + i })), chars: PRESETS.classic, seed: 9 });
  assert.equal(s.draft.faceUp.length, 0);
  const first = s.draft.order[0], second = s.draft.order[1];
  s = act(s, first, { t: 'pick', charId: s.draft.avail[0] });
  assert.ok(!s.draft.mustDiscard);
  s = act(s, second, { t: 'pick', charId: s.draft.avail[0] });
  assert.ok(s.draft.mustDiscard, 'second pick is followed by a discard');
  assert.ok(act(s, second, { t: 'pick', charId: s.draft.avail[0] }).error, 'must discard before picking again');
  s = act(s, second, { t: 'discard', charId: s.draft.avail[0] });
  assert.equal(s.draft.faceDown.length, 2);
}
{
  // scoring: five colours via Haunted Quarter (built earlier), first completer
  const mk = (id, color, round = 1) => ({ uid: id, id, cost: 1, color, round });
  const city = [mk('manor', 'yellow'), mk('temple', 'blue'), mk('tavern', 'green'), mk('watchtower', 'red'),
    mk('haunted_city', 'purple'), mk('castle', 'yellow'), mk('church', 'blue'), mk('market', 'green')];
  const s = { firstComplete: 0, cfg: { goal: 8 }, round: 5 };
  const r = score(s, { id: 0, city, hand: [] });
  assert.equal(r.parts.colors, 3);
  assert.equal(r.parts.first, 4);
  assert.equal(r.total, 8 + 3 + 4);
  // ...but a Haunted Quarter built in the final round only counts as purple
  const city2 = city.map(d => (d.id === 'haunted_city' ? { ...d, round: 5 } : d.id === 'manor' ? { ...d, color: 'blue' } : d))
    .filter(d => d.id !== 'castle');
  assert.equal(score(s, { id: 0, city: city2, hand: [] }).parts.colors, 0);
}

{
  // only the Bishop shields a city — the Abbot shares rank 5 but not the protection
  const city = [{ uid: 'x', id: 'temple', cost: 1, color: 'blue' }];
  const st = { cfg: { goal: 8 }, killed: null };
  assert.equal(shielded(st, { city, chars: [5] }), 'bishop');
  assert.equal(shielded(st, { city, chars: [13] }), null, 'abbot does not shield');
  assert.equal(shielded({ ...st, killed: 5 }, { city, chars: [5] }), null, 'slain bishop does not shield');
}

{
  // every language file covers every key, with the same {placeholders} as English
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const [name, L] of Object.entries(EXTRA)) {
    for (const k of KEYS()) {
      assert.ok(k in L, `${name}: missing ${k}`);
      assert.equal(ph(L[k]), ph(t(k)), `${name}: placeholders differ in ${k}`);
    }
    assert.ok(RULES[name], `${name}: no rules text`);
  }
  const nav = { 'zh-TW': 'zh-TW', 'zh-HK': 'zh-TW', 'zh-Hant-MO': 'zh-TW', 'zh-CN': 'zh', zh: 'zh', 'pt-BR': 'pt', 'de-AT': 'de', 'ru': 'ru', 'nl-NL': 'en' };
  for (const [k, v] of Object.entries(nav)) assert.equal(pickLang(k), v, 'browser language ' + k);
}

console.log(`ok — ${games} games, avg ${(rounds / games).toFixed(1)} rounds, ${fallbacks} AI fallbacks, ${interrupts} graveyard decisions`);
