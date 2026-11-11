// App controller: owns the authoritative state (solo/host), the AI driver, event playback,
// persistence, emotes, stats and the host/peer plumbing. UI, lobby and scene are views.

import { createScene } from './scene.js?v=b067d2f4';
import { createUI, EMOTES } from './ui.js?v=b067d2f4';
import { createLobby } from './lobby.js?v=b067d2f4';
import { createGame, act, viewFor, currentActor, VERSION } from './engine.js?v=b067d2f4';
import { aiAction, safeAction } from './ai.js?v=b067d2f4';
import { DIST_IDS, AI_NAMES, AVATARS, PRESETS } from './data.js?v=b067d2f4';
import { t, getLang, setLang } from './i18n.js?v=b067d2f4';
import * as net from './net.js?v=b067d2f4';
import { initSettings, openSettings, closeSettings } from './settings.js?v=b067d2f4';
import { startTutorial, stopTutorial, tutorialActive } from './tutorial.js?v=b067d2f4';

const SPEED = { slow: 1.45, normal: 1, fast: 0.5 };
const store = {
  get: (k, s = localStorage) => { try { return JSON.parse(s.getItem(k)); } catch { return null; } },
  set: (k, v, s = localStorage) => { try { s.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  del: (k, s = localStorage) => { try { s.removeItem(k); } catch { /* blocked */ } },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOST_TTL = 30 * 60 * 1000;
const SILENT_MS = 12000;

const G = {
  mode: null, S: null, view: null, me: 0, lastEv: 0, queue: [], playing: false, aiTimer: null,
  speed: store.get('c3d.speed') || 'normal', cfg: null, room: null, link: null,
  deadline: null, recorded: null,
};
const thumbs = Object.fromEntries(DIST_IDS.map(id => [id, new URL(`../assets/districts/${id}.webp`, import.meta.url).href]));
setLang(getLang());

const scene = createScene(document.getElementById('board'), {
  onPick: h => G.mode && ui.onPick(h),
  onHover: (h, x, y) => G.mode && ui.onHover(h, x, y),
});

const ui = createUI({
  scene, thumbs,
  dispatch, leave, again, relang, setSpeed, openSettings,
  mode: () => G.mode,
  getSpeed: () => G.speed,
  hint,
  emote: sendEmote,
  deadline: () => G.deadline,
  stats: () => store.get('c3d.stats'),
});

const lobby = createLobby({
  getSpeed: () => G.speed, setSpeed, relang, openSettings,
  canContinue, cont, stats: () => store.get('c3d.stats'),
  startSolo, createRoom, addAI, removeSeat, startHost, joinRoom,
  // the guided first game: Cunning opponents, the classic eight, a fixed deal that teaches well
  startTutorial: o => { startTutorial(); startSolo({ ...o, opp: 3, chars: PRESETS.classic, goal: 8, level: 'hard', seed: 2026 }); },
  cancelNet: () => { closeRoom(); closeLink(); },
});

function setSpeed(v) { G.speed = v; store.set('c3d.speed', v); }
initSettings({
  scene, relang, setSpeed, getSpeed: () => G.speed, mode: () => G.mode,
  leave: () => { if (G.mode === 'solo' || confirm(t('ui.leaveConfirm'))) leave(); },
  stats: () => store.get('c3d.stats'), resetStats: () => { store.del('c3d.stats'); lobby.render(); },
});
function relang() {
  document.title = t('lb.title');
  scene.relang();
  ui.relang();
  lobby.render();
}

// ── state flow ─────────────────────────────────────────────────────────────
function setState(S) { G.S = S; publish(); }

function publish() {
  const S = G.S;
  updateDeadline();
  if (G.mode === 'host') {
    G.room.seats.forEach((s, i) => s.conn && net.send(s.conn, { t: 'view', v: viewFor(S, i), dl: G.deadline }));
    store.set('c3d.hostsave', { v: VERSION, code: G.room.code, S, seats: G.room.seats.map(({ conn, ...s }) => s), cfg: G.cfg, timer: G.room.timer, at: Date.now() });
  }
  saveNow();
  applyView(viewFor(S, G.me));
  scheduleAI();
}
function saveNow() {
  if (G.mode !== 'solo' || !G.S) return;
  if (G.S.phase === 'over') store.del('c3d.save');
  else store.set('c3d.save', { v: VERSION, S: G.S, cfg: G.cfg, at: Date.now() });
}

function applyView(v) {
  if (v.evSeq < G.lastEv) G.lastEv = 0; // a new game started
  const first = !G.view;
  G.view = v;
  scene.sync(v, !first && !document.hidden);
  ui.render(v);
  let fresh = v.ev.filter(e => e.id > G.lastEv);
  if (first && fresh.length > 6) fresh = fresh.slice(-3); // joining mid-game: don't replay history
  if (fresh.length) { G.lastEv = fresh.at(-1).id; G.queue.push(...fresh); pump(); }
  if (v.phase === 'over') recordResult(v);
}

async function pump() {
  if (G.playing) return;
  G.playing = true;
  while (G.queue.length && G.mode) {
    const e = G.queue.shift();
    const ms = ui.event(e, G.view);
    scene.fx(e);
    aiReact(e);
    // A hidden tab can't animate anyway — don't let it stall the table.
    if (!document.hidden) await sleep(ms * SPEED[G.speed]);
  }
  G.playing = false;
  scheduleAI();
}

const isBot = (S, pid) => S.players[pid].ai;
function scheduleAI() {
  clearTimeout(G.aiTimer);
  const S = G.S;
  if (!S || (G.mode !== 'solo' && G.mode !== 'host') || S.phase === 'over' || G.playing || G.queue.length) return;
  const pid = currentActor(S);
  if (pid === null || !isBot(S, pid)) return;
  const move = () => {
    if (G.S !== S) return;
    const v = viewFor(S, pid);
    let n = act(S, pid, aiAction(v, pid));
    if (n.error) n = act(S, pid, safeAction(v, pid));
    if (!n.error) setState(n);
  };
  // Background tabs get their timers throttled (down to once a minute) — a hidden host would stall
  // the whole table, so there the AI moves straight away.
  if (document.hidden) return void queueMicrotask(move);
  G.aiTimer = setTimeout(move, (S.interrupt ? 500 : S.phase === 'draft' ? 420 : 620) * SPEED[G.speed]);
}

function dispatch(a) {
  if (G.mode === 'peer') return net.send(G.link?.conn, { t: 'act', a });
  if (!G.S) return;
  const n = act(G.S, G.me, a);
  if (n.error) return ui.toast(n.error, 'danger');
  setState(n);
}

// The advisor uses the Cunning AI, from my own view only.
function hint() {
  const v = G.view;
  if (!v || v.phase === 'over' || currentActor(v) !== G.me) return null;
  try { return aiAction(v, G.me); } catch { return null; }
}

// Human decisions have no deadline, including while a seat is disconnected.
function updateDeadline() { G.deadline = null; }

// ── emotes ─────────────────────────────────────────────────────────────────
function sendEmote(e) {
  if (!EMOTES.includes(e) || !G.view) return;
  if (G.mode === 'peer') return net.send(G.link?.conn, { t: 'emote', e });
  broadcastEmote(G.me, e);
}
function broadcastEmote(pid, e) {
  ui.showEmote(pid, e);
  if (G.mode === 'host') for (const s of G.room.seats) if (s.conn) net.send(s.conn, { t: 'emote', pid, e });
}
let lastAIEmote = 0;
function aiReact(e) { // AIs occasionally react, so the table feels inhabited
  if ((G.mode !== 'solo' && G.mode !== 'host') || Date.now() - lastAIEmote < 4000) return;
  const S = G.S, ai = pid => pid !== null && pid !== undefined && S.players[pid]?.ai;
  const r = Math.random();
  let pick = null;
  if (['destroy', 'seize'].includes(e.k) && ai(e.target) && r < 0.6) pick = [e.target, '😡'];
  else if (['robbed', 'bribe', 'threatRevealed'].includes(e.k) && e.n > 0 && e.from !== e.to && ai(e.from) && r < 0.5) pick = [e.from, '😮'];
  else if (e.k === 'destroy' && ai(e.pid) && r < 0.35) pick = [e.pid, '😈'];
  else if (e.k === 'complete' && ai(e.pid)) pick = [e.pid, '👑'];
  else if (e.k === 'over' && ai(e.winner)) pick = [e.winner, '🎉'];
  else if (e.k === 'build' && ai(e.pid) && e.card.cost >= 6 && r < 0.3) pick = [e.pid, '😂'];
  if (!pick) return;
  lastAIEmote = Date.now();
  setTimeout(() => G.mode && broadcastEmote(...pick), 500);
}

// ── stats ──────────────────────────────────────────────────────────────────
function recordResult(v) {
  const key = v.seed === 0 ? `${v.evSeq}:${v.round}:${v.winner}` : v.seed;
  if (G.recorded === key || v.me < 0) return;
  G.recorded = key;
  const st = store.get('c3d.stats') || { w: 0, g: 0 };
  st.g++;
  if (v.winner === v.me) st.w++;
  store.set('c3d.stats', st);
}

// ── mode switching ─────────────────────────────────────────────────────────
function enterGame(mode) {
  clearTimeout(G.aiTimer);
  G.mode = mode; G.view = null; G.lastEv = 0; G.queue = []; G.deadline = null; G.recorded = null;
  lobby.hide();
  ui.resetLog();
  ui.show();
  scene.reset();
  scene.resetView();
}

function leave() {
  clearTimeout(G.aiTimer);
  closeSettings();
  if (tutorialActive()) stopTutorial();
  if (G.mode === 'host') { store.del('c3d.hostsave'); closeRoom(); }
  if (G.mode === 'peer') { store.del('c3d.peer', sessionStorage); closeLink(); }
  G.mode = null; G.S = null; G.view = null; G.queue = []; G.deadline = null;
  ui.hide();
  showcase();
  lobby.show('home', { error: null });
}

function again() {
  if (G.mode === 'host') G.cfg.players = G.room.seats.map(s => ({ name: s.name, avatar: s.avatar, ai: !!s.ai }));
  const mode = G.mode;
  enterGame(mode);
  setState(createGame({ ...G.cfg, seed: undefined }));
}

function aiPlayers(n, taken) {
  const names = AI_NAMES[getLang()];
  const pool = AVATARS.filter(a => !taken.includes(a));
  return Array.from({ length: n }, (_, i) => ({ name: names[i % names.length], avatar: pool[i % pool.length], ai: true }));
}

function startSolo(o) {
  G.cfg = { players: [{ name: o.name, avatar: o.avatar, ai: false }, ...aiPlayers(o.opp, [o.avatar])], chars: o.chars, goal: o.goal, level: o.level, seed: o.seed };
  G.me = 0;
  enterGame('solo');
  setState(createGame(G.cfg));
}

// ── continue ───────────────────────────────────────────────────────────────
function saves() {
  const peer = store.get('c3d.peer', sessionStorage);
  const host = store.get('c3d.hostsave');
  const solo = store.get('c3d.save');
  return {
    peer,
    host: host?.v === VERSION && Date.now() - host.at < HOST_TTL ? host : null,
    solo: solo?.v === VERSION ? solo : null, // older saves can't be trusted against new rules
  };
}
function canContinue() {
  const s = saves();
  if (s.peer) return `${t('lb.code')} ${s.peer.code}`;
  if (s.host) return `${t('lb.host')} · ${s.host.code} · ${t('ui.round', { n: s.host.S.round })}`;
  if (s.solo) return `${t('lb.solo')} · ${t('ui.round', { n: s.solo.S.round })}`;
  return null;
}
async function cont() {
  const s = saves();
  if (s.peer) return joinRoom(s.peer);
  if (s.host) return resumeHost(s.host);
  if (s.solo) { G.cfg = s.solo.cfg; G.me = 0; enterGame('solo'); setState(s.solo.S); }
}

// ── hosting ────────────────────────────────────────────────────────────────
const seatsPublic = () => G.room.seats.map(s => ({ name: s.name, avatar: s.avatar, ai: s.ai }));
function broadcastLobby() {
  for (const s of G.room.seats) if (s.conn) net.send(s.conn, { t: 'lobby', seats: seatsPublic(), code: G.room.code });
  lobby.update({ seats: seatsPublic() });
}
const hostHandlers = {
  onOpen() { /* wait for hello */ },
  onData(conn, m) {
    const R = G.room;
    if (!R || !m || typeof m !== 'object') return;
    const from = R.seats.find(s => s.conn === conn);
    if (from) from.seen = Date.now();
    if (m.t === 'hb') return void (m.r || net.send(conn, { t: 'hb', r: 1 })); // answer at once: our own timer may be throttled
    if (m.t === 'hello') {
      if (m.v !== VERSION) return net.send(conn, { t: 'old' });
      const idx = R.seats.findIndex(s => s.token && s.token === m.token);
      if (idx > 0) { // returning player reclaims their human seat
        R.seats[idx].conn = conn;
        R.seats[idx].seen = Date.now();
        if (G.S) {
          G.S = structuredClone(G.S);
          G.S.players[idx].ai = false;
          ui.toast(t('ui.rejoined', { name: R.seats[idx].name }), 'gold');
          publish();
        } else broadcastLobby();
        return;
      }
      if (G.S || R.seats.length >= 7) return net.send(conn, { t: 'full' });
      R.seats.push({ name: String(m.name || 'Guest').slice(0, 16), avatar: String(m.avatar || '◆').slice(0, 4), ai: false, token: String(m.token).slice(0, 40), conn, seen: Date.now() });
      broadcastLobby();
      return;
    }
    const idx = R.seats.findIndex(s => s.conn === conn);
    if (idx < 1) return;
    if (m.t === 'act' && G.S) {
      const n = act(G.S, idx, m.a);
      if (n.error) return net.send(conn, { t: 'err', e: n.error });
      setState(n);
    }
    if (m.t === 'emote' && G.S) broadcastEmote(idx, m.e);
  },
  onClose(conn) {
    const R = G.room;
    if (!R) return;
    const idx = R.seats.findIndex(s => s.conn === conn);
    if (idx < 1) return;
    R.seats[idx].conn = null;
    if (G.S) {
      G.S = structuredClone(G.S);
      G.S.players[idx].ai = false;
      publish();
    } else { R.seats.splice(idx, 1); broadcastLobby(); }
  },
};

async function createRoom(o) {
  lobby.show('connecting', { error: null, info: t('lb.connecting') });
  const code = net.makeCode();
  try {
    const peer = await net.hostRoom(code, hostHandlers);
    G.room = { code, peer, seats: [{ name: o.name, avatar: o.avatar, ai: false, host: true }], chars: o.chars, goal: o.goal, level: o.level, timer: o.timer };
    lobby.show('room', { roomCode: code, seats: seatsPublic() });
  } catch {
    lobby.show('host', { error: t('lb.netFail') });
  }
}
function addAI() {
  const R = G.room;
  if (!R || R.seats.length >= 7) return;
  const [p] = aiPlayers(1, R.seats.map(s => s.avatar));
  p.name = AI_NAMES[getLang()][R.seats.filter(s => s.ai).length % 6];
  R.seats.push(p);
  broadcastLobby();
}
function removeSeat(i) {
  const R = G.room;
  if (!R || i < 1) return;
  const [s] = R.seats.splice(i, 1);
  if (s.conn) { net.send(s.conn, { t: 'full' }); setTimeout(() => s.conn.close(), 200); }
  broadcastLobby();
}
function startHost() {
  const R = G.room;
  if (!R || R.seats.length < 2) return;
  if (R.seats.length === 2 && R.chars.includes(22)) { ui.toast(t('ui.emperorPlayers'), 'danger'); return; }
  G.cfg = { players: R.seats.map(s => ({ name: s.name, avatar: s.avatar, ai: s.ai })), chars: R.chars, goal: R.goal, level: R.level };
  G.me = 0;
  enterGame('host');
  setState(createGame(G.cfg));
}
async function resumeHost(save) {
  lobby.show('connecting', { error: null, info: t('lb.connecting') });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const peer = await net.hostRoom(save.code, hostHandlers);
      G.room = { code: save.code, peer, seats: save.seats.map(s => ({ ...s, conn: null })), chars: save.cfg.chars, goal: save.cfg.goal, level: save.cfg.level, timer: save.timer };
      G.cfg = save.cfg; G.me = 0;
      const S = structuredClone(save.S);
      S.players.forEach((p, i) => { p.ai = !!save.seats[i].ai; }); // wait for human reconnection
      enterGame('host');
      return setState(S);
    } catch (e) {
      if (e?.type !== 'unavailable-id') break;
      await sleep(3000 * (attempt + 1)); // the signalling server still holds our old id
    }
  }
  store.del('c3d.hostsave');
  lobby.show('home', { error: t('lb.netFail') });
}
function closeRoom() {
  if (!G.room) return;
  try { G.room.peer.destroy(); } catch { /* gone */ }
  G.room = null;
}

// ── joining ────────────────────────────────────────────────────────────────
async function joinRoom(o) {
  lobby.show('connecting', { error: null, info: t('lb.connecting') });
  const prev = store.get('c3d.peer', sessionStorage);
  const token = prev?.code === o.code && prev.token ? prev.token : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const sess = { code: o.code, token, name: o.name, avatar: o.avatar };
  try {
    await connectPeer(sess);
    store.set('c3d.peer', sess, sessionStorage);
    if (!G.mode) lobby.show('wait', { roomCode: o.code, seats: [] });
  } catch (e) {
    store.del('c3d.peer', sessionStorage);
    lobby.show('join', { error: e?.type === 'peer-unavailable' || e?.type === 'timeout' ? t('lb.noRoom', { code: o.code }) : t('lb.netFail') });
  }
}
async function connectPeer(sess) {
  const link = await net.joinRoom(sess.code, { onData: peerData, onClose: peerClosed });
  G.link = { ...link, sess, seen: Date.now() };
  net.send(link.conn, { t: 'hello', v: VERSION, name: sess.name, avatar: sess.avatar, token: sess.token });
}
function peerData(m) {
  if (!m || typeof m !== 'object') return;
  if (G.link) G.link.seen = Date.now();
  if (m.t === 'hb') return void (m.r || net.send(G.link?.conn, { t: 'hb', r: 1 }));
  if (m.t === 'lobby' && !G.mode) lobby.show('wait', { seats: m.seats, roomCode: m.code, error: null });
  if (m.t === 'view' && m.v?.players) {
    if (G.mode !== 'peer') { G.me = m.v.me; enterGame('peer'); }
    G.me = m.v.me;
    G.deadline = m.dl || null;
    applyView(m.v);
  }
  if (m.t === 'emote') ui.showEmote(m.pid, m.e);
  if (m.t === 'note' && m.k === 'timeout') ui.toast(t('ui.timeout', { name: String(m.name).slice(0, 16) }), 'danger');
  if (m.t === 'full' || m.t === 'old') { closeLink(); store.del('c3d.peer', sessionStorage); lobby.show('join', { error: t(m.t === 'old' ? 'lb.version' : 'lb.full') }); }
  if (m.t === 'err') ui.toast(String(m.e).slice(0, 80), 'danger');
}
async function peerClosed() {
  const L = G.link;
  if (!L || L.closing) return;
  L.closing = true;
  try { L.peer.destroy(); } catch { /* gone */ }
  for (let i = 0; i < 6 && G.link === L; i++) {
    await sleep(2000 + i * 1500);
    if (G.link !== L) return;
    try { await connectPeer(L.sess); return; } catch { /* retry */ }
  }
  if (G.link !== L) return;
  G.link = null;
  if (G.mode) { G.mode = null; ui.hide(); showcase(); }
  lobby.show('home', { error: t('ui.hostLeft') });
}
function closeLink() {
  const L = G.link;
  G.link = null;
  try { L?.peer.destroy(); } catch { /* gone */ }
}

// WebRTC doesn't reliably report a vanished tab, so both sides heartbeat and drop silent links.
setInterval(() => {
  const now = Date.now();
  for (const s of G.room?.seats || []) {
    if (!s.conn) continue;
    net.send(s.conn, { t: 'hb' });
    if (now - (s.seen || now) > SILENT_MS) { const c = s.conn; try { c.close(); } catch { /* gone */ } hostHandlers.onClose(c); }
  }
  const L = G.link;
  if (L?.conn && !L.closing) {
    net.send(L.conn, { t: 'hb' });
    if (now - (L.seen ||= now) > SILENT_MS) peerClosed();
  }
}, 3000);

// ── showcase behind the lobby ──────────────────────────────────────────────
function showcase() {
  const s = createGame({ players: AI_NAMES.en.slice(0, 5).map((name, i) => ({ name, ai: true, avatar: AVATARS[i] })), chars: PRESETS.queen, goal: 8 });
  // Decorative cities: don't run hundreds of synchronous AI moves to open the lobby.
  s.players.forEach((p, i) => { p.city = s.deck.splice(0, 3 + i % 3); p.gold = 3 + i * 2; });
  const v = viewFor(s, -1);
  v.phase = 'idle';
  v.interrupt = null;
  v.players.forEach(p => { p.chars = []; p.charCount = 0; });
  scene.reset();
  scene.sync(v, false);
  scene.resetView();
}

// ── safety nets ────────────────────────────────────────────────────────────
let lastErr = 0;
function onCrash(err) {
  console.error(err);
  saveNow();
  if (G.mode && Date.now() - lastErr > 5000) { lastErr = Date.now(); ui.toast(t('ui.error'), 'danger'); }
  G.playing = false;
  scheduleAI(); // never leave the table frozen
}
addEventListener('error', e => onCrash(e.error || e.message));
addEventListener('unhandledrejection', e => onCrash(e.reason));
addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (!document.hidden && G.view) { scene.sync(G.view, false); ui.render(G.view); } scheduleAI(); });

// ── boot ───────────────────────────────────────────────────────────────────
showcase();
lobby.show('home');
if (saves().peer) cont(); // this tab was in an online game and got refreshed: rejoin straight away
document.title = t('lb.title');
document.getElementById('boot')?.classList.add('done');
// Only the optional turn countdown ticks while idle; the board updates on state changes.
setInterval(() => { if (G.mode && !document.hidden) ui.frame(); }, 1000);
