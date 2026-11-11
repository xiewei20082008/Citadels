// Regression coverage for spec/bugs/1.md. Run: node test/bugs.test.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame, act, viewFor, currentActor, threatTargets, VERSION } from '../js/engine.js';
import { AI_NAMES, AVATARS, PRESETS } from '../js/data.js';

const chars = [1, 21, 3, 4, 5, 6, 14, 8];
const state = () => createGame({ players: ['Host', 'Human', 'Bot'].map((name, id) => ({ name, ai: id === 2 })), chars, seed: 42 });
{
  const s = state();
  s.phase = 'turns'; s.call = 2; s.revealed = [21];
  s.players[0].chars = [21];
  s.turn = { pid: 0, charId: 21, rank: 2, income: false, built: 0, max: 1, used: {}, pending: null };
  assert.ok(!threatTargets(s).includes(21));
  assert.ok(!threatTargets(viewFor(s, 0)).includes(21));
  assert.ok(act(s, 0, { t: 'threats', targets: [21, 3], flower: 3, round: s.round, charId: 21 }).error);
  assert.ok(!act(s, 0, { t: 'threats', targets: [3, 4], flower: 3, round: s.round, charId: 21 }).error);
}

// Execute the real controller with inert rendering/network adapters.
const noop = () => {};
const storage = { getItem: () => null, setItem: noop, removeItem: noop };
const timers = [];
const surface = new Proxy({}, { get: () => noop });
const context = vm.createContext({
  console, structuredClone, URL, Date, Math, Promise, queueMicrotask,
  localStorage: storage, sessionStorage: storage,
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout: noop, setInterval: noop, addEventListener: noop,
  document: { hidden: false, getElementById: () => ({ classList: { add: noop } }), addEventListener: noop },
  createScene: () => surface, createUI: () => surface, createLobby: () => surface,
  initSettings: noop, openSettings: noop, closeSettings: noop, tutorialActive: () => false,
  createGame, act, currentActor, VERSION, AI_NAMES, AVATARS, PRESETS, DIST_IDS: [],
  viewFor: () => ({ evSeq: 0, ev: [], players: [] }),
  getLang: () => 'en', setLang: noop, t: key => key,
  net: { hostRoom: async () => ({}), send: noop },
});
const source = (await readFile(new URL('../js/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', "'http://localhost/js/main.js'");
vm.runInContext(source + '\nglobalThis.controller = { G, hostHandlers, resumeHost, again, updateDeadline };', context);
const { G, hostHandlers, resumeHost, again, updateDeadline } = context.controller;
function host() {
  G.mode = 'host'; G.me = 0; G.S = state(); G.view = null; G.playing = false; G.queue = [];
  G.S.draft.order = [1, 0, 2]; G.S.draft.idx = 0;
  G.room = { code: 'TEST', timer: 60, seats: [
    { host: true, name: 'Host', ai: false },
    { name: 'Human', ai: false, token: 'human', conn: {}, seen: Date.now() },
    { name: 'Bot', ai: true },
  ] };
  G.cfg = { players: G.S.players.map(({ name, ai }) => ({ name, ai })), chars, seed: 42 };
}
host();
const conn = G.room.seats[1].conn;
hostHandlers.onClose(conn);
assert.equal(G.S.players[1].ai, false);
assert.equal(currentActor(G.S), 1);
assert.equal(G.deadline, null);
assert.equal(timers.length, 0, 'disconnect must not schedule a bot move');
const returning = {};
hostHandlers.onData(returning, { t: 'hello', v: VERSION, token: 'human' });
assert.equal(G.room.seats[1].conn, returning);
assert.equal(G.S.players[1].ai, false);
updateDeadline();
assert.equal(G.deadline, null, 'connected human decisions must also wait indefinitely');
host();
G.room.seats[1].conn = null;
again();
assert.equal(G.S.players[1].ai, false, 'rematch must preserve human identity');
assert.equal(G.S.players[2].ai, true, 'rematch must preserve intentional bots');
host();
const saved = { code: 'TEST', timer: 60, S: structuredClone(G.S), cfg: G.cfg,
  seats: G.room.seats.map(({ conn, ...seat }) => seat) };
timers.length = 0;
saved.S.players[1].ai = true; // Also repairs a takeover stored by the old controller.
await resumeHost(saved);
assert.equal(G.S.players[1].ai, false);
assert.equal(G.S.players[2].ai, true);
assert.equal(timers.length, 0, 'resuming must wait for the human to reconnect');
console.log('Bug engine/controller regressions passed.');
