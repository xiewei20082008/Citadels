// Rules engine. Pure and serializable: every function takes a plain-object state.
// act(state, pid, action) returns a NEW state, or {error} when the move is illegal.
// Humans, AI and network peers all go through act(), so they play by identical rules.

import { CHAR, COLORS, makeDeck } from './data.js?v=a3b36d07';

const MAX_EV = 120;
export const VERSION = 8; // Revised catalogue UIDs, Museum storage and Theater decisions
const MAX_ROUNDS = 40; // ponytail: hard stop for degenerate games (empty deck + empty hands)

// ── helpers ────────────────────────────────────────────────────────────────
function rand(s) { // mulberry32, seed lives in state so games are replayable
  let t = (s.seed = (s.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function emit(s, k, o) {
  s.ev.push({ id: ++s.evSeq, k, ...o });
  if (s.ev.length > MAX_EV) s.ev.splice(0, s.ev.length - MAX_EV);
}
const draw = (s, n) => s.deck.splice(0, n);
// Public per-player tallies for the end-of-game recap (older saves start without them).
const bump = (p, k, n = 1) => { p.st ||= {}; p.st[k] = (p.st[k] || 0) + n; };

export const rankOf = id => CHAR[id].rank;
export const charsPerPlayer = n => (n <= 3 ? 2 : 1);
export const has = (p, id) => p.city.some(d => d.id === id);
export const completionCount = p => p.city.reduce((n, d) => n + (d.id === 'monument' ? 2 : 1), 0);
// Physical zones only: Wizard/Spy inspections are knowledge copies.
export const physicalCards = s => [...s.deck,
  ...s.players.flatMap(p => [...p.hand, ...p.city.flatMap(c => [c, ...(c.stored || [])])]),
  ...(s.turn?.pending?.k === 'keep' ? s.turn.pending.cards : []),
  ...(s.interrupt?.card ? [s.interrupt.card, ...(s.interrupt.card.stored || [])] : [])];
export const maxRank = s => Math.max(...s.cfg.chars.map(rankOf));
export const holderOf = (s, rank) => s.players.find(p => p.chars.some(c => rankOf(c) === rank));

export function colorCount(p, color) {
  return p.city.filter(d => d.color === color || d.id === 'school_of_magic').length;
}
export function buildCost(p, card) {
  return card.color === 'purple' && card.id !== 'factory' && has(p, 'factory') ? Math.max(0, card.cost - 1) : card.cost;
}
export function canPlace(p, card, charId = null) {
  return charId === 11 || !has(p, card.id) || has(p, 'quarry');
}
const greatWallSurcharge = (target, card) => has(target, 'great_wall') && card.id !== 'great_wall' ? 1 : 0;
export function destroyCost(target, card) {
  return Math.max(0, card.cost - 1) + greatWallSurcharge(target, card);
}
// Construction tax is paid from the stash left AFTER payment, never borrowed.
export const taxDue = (s, gold, charId) => s.cfg.chars.includes(19) && charId !== 19 && gold > 0 ? 1 : 0;
// Great Wall increases payment, not the building cost used for Marshal's ceiling.
export const seizureCost = (target, card) => card.cost + greatWallSurcharge(target, card);
export function seizeError(s, marshal, target, card) {
  if (!target || target.id === marshal.id || !card || !target.city.some(c => c.uid === card.uid)) return 'bad target';
  return shielded(s, target) || (card.id === 'keep' ? 'keep' : null) ||
    (has(marshal, card.id) ? 'duplicate' : null) ||
    (card.cost > 3 ? 'expensive' : null) || (seizureCost(target, card) > marshal.gold ? 'poor' : null);
}
// Can a rank-8 character target this player's city at all?
export function shielded(s, target) {
  if (completionCount(target) >= s.cfg.goal) return 'complete';
  if (target.chars.includes(5) && s.killed !== 5) return 'bishop'; // the Bishop only, not the Abbot
  return null;
}
export function buildLimit(charId) {
  return { 7: 3, 14: 2, 15: 2, 10: 0 }[charId] ?? 1;
}
export function countsTowardLimit(charId, card) {
  return card.id !== 'stables' && !(charId === 16 && card.color === 'green');
}

// A single construction validator for humans, policies and the Wizard's bonus build.
// Eligibility is evaluated after an optional sacrifice; Monument's placement
// restriction uses the city before construction, including the sacrificed card.
export function constructionPlan(s, p, card, a = {}, wizard = false) {
  const T = s.turn;
  if (!card || !T || T.charId === 10) return { error: 'cannot build' };
  if (card.id === 'monument' && p.city.length >= 5) return { error: 'monument limit' };
  if (!wizard && countsTowardLimit(T.charId, card) && T.built >= T.max) return { error: 'build limit' };
  if (a.payment !== undefined && !['gold', 'framework', 'necropolis'].includes(a.payment)) return { error: 'bad payment mode' };
  if (a.pay !== undefined && (!Array.isArray(a.pay) || new Set(a.pay).size !== a.pay.length)) return { error: 'bad payment' };
  const pay = a.pay || [], alternative = a.payment === 'framework' || a.payment === 'necropolis';
  if ((!alternative && a.sacrifice !== undefined) || (alternative && pay.length)) return { error: 'mixed payment' };
  let sacrifice = null;
  if (alternative) {
    sacrifice = p.city.find(c => c.uid === a.sacrifice);
    if (!sacrifice || (a.payment === 'framework' ? sacrifice.id !== 'framework' : card.id !== 'necropolis'))
      return { error: 'bad sacrifice' };
  }
  const after = sacrifice ? { ...p, city: p.city.filter(c => c.uid !== sacrifice.uid) } : p;
  // Wizard's duplicate permission lasts the whole character turn, including
  // ordinary construction from hand. It never applies to confiscation/seizure.
  if (!canPlace(after, card, T.charId)) return { error: 'duplicate' };
  const cost = buildCost(after, card);
  if (pay.length && card.id !== 'thieves_den') return { error: 'only Thieves\' Den takes cards' };
  if (pay.includes(card.uid) || !pay.every(u => p.hand.some(c => c.uid === u))) return { error: 'bad payment' };
  const goldDue = alternative ? 0 : cost - pay.length;
  if (goldDue < 0 || goldDue > p.gold) return { error: 'cannot afford' };
  return { sacrifice, pay, goldDue, paid: !alternative };
}

export function constructionOptions(s, p, card, wizard = false) {
  const base = wizard ? { t: 'wizTake', uid: card.uid, build: true } : { t: 'build', uid: card.uid };
  const actions = [{ ...base, payment: 'gold' }];
  if (card.id === 'thieves_den') {
    const need = Math.max(0, buildCost(p, card) - p.gold);
    if (need) actions.push({ ...base, pay: p.hand.filter(c => c.uid !== card.uid).slice(0, need).map(c => c.uid) });
  }
  for (const c of p.city) {
    if (c.id === 'framework') actions.push({ ...base, payment: 'framework', sacrifice: c.uid });
    if (card.id === 'necropolis') actions.push({ ...base, payment: 'necropolis', sacrifice: c.uid });
  }
  return actions.filter(a => !constructionPlan(s, p, card, a, wizard).error);
}

export function armoryError(s, p, armory, target, card) {
  if (!armory || armory.id !== 'armory' || !p.city.some(c => c.uid === armory.uid) ||
      !target || !card || !target.city.some(c => c.uid === card.uid) || card.uid === armory.uid) return 'bad target';
  // This is not a rank-8 ability: Bishop, Keep and Great Wall do not apply.
  return completionCount(p) >= s.cfg.goal || completionCount(target) >= s.cfg.goal ? 'complete' : null;
}

function discardDistrict(s, p, card) {
  p.city.splice(p.city.findIndex(c => c.uid === card.uid), 1);
  const stored = card.stored || [];
  delete card.stored;
  for (const c of stored) delete c.knownTo;
  s.deck.push(card, ...stored);
}

// Public events must never contain facedown Museum cards.
const publicCard = card => { const c = { ...card }; if (c.stored) c.stored = c.stored.map(() => ({ hidden: true })); return c; };

// ── setup ──────────────────────────────────────────────────────────────────
// cfg: { players:[{name, ai, avatar}], chars:[charIds], goal:7|8, seed? }
export function createGame(cfg) {
  const n = cfg.players.length;
  if (n < 2 || n > 7) throw new Error('2–7 players');
  if (n === 2 && cfg.chars.includes(22)) throw new Error('Emperor requires at least 3 players');
  const ranks = cfg.chars.map(rankOf);
  if (new Set(ranks).size !== ranks.length) throw new Error('one character per rank');
  if (!ranks.includes(4)) throw new Error('rank 4 (crown) required');
  if (cfg.chars.length < n * charsPerPlayer(n) + 1) throw new Error('not enough characters');

  const s = {
    v: VERSION, seed: cfg.seed ?? (Math.random() * 2 ** 31) | 0,
    cfg: { chars: [...cfg.chars], goal: cfg.goal || 8, level: 'hard',
      uniqueDistricts: cfg.uniqueDistricts ? [...cfg.uniqueDistricts] : null },
    players: cfg.players.map((p, i) => ({
      id: i, name: p.name, ai: !!p.ai, avatar: p.avatar || '',
      gold: 2, hand: [], city: [], chars: [], lastRank: 0, saw: [],
    })),
    deck: [], round: 0, phase: 'draft', crown: 0,
    draft: null, call: 0, turn: null, killed: null, robbed: null, robber: null, revealed: [], interrupt: null,
    firstComplete: null, scores: null, winner: null, ev: [], evSeq: 0,
    warrants: null, constructionSeq: 0, taxPool: 0, threats: null, threatSeq: 0,
  };
  s.deck = shuffle(s, makeDeck(s.cfg.uniqueDistricts));
  s.players.forEach(p => { p.hand = draw(s, 4); });
  s.crown = Math.floor(rand(s) * n);
  emit(s, 'start', {});
  startRound(s);
  return s;
}

function startRound(s) {
  s.round++;
  s.warrants = null;
  s.threats = null;
  s.interrupt = null;
  s.phase = 'draft';
  s.turn = null; s.call = 0; s.killed = null; s.robbed = null; s.robber = null; s.revealed = [];
  s.players.forEach(p => { p.chars = []; p.saw = []; p.lastRank = 0; delete p.draftChanged; delete p.theaterKnowledge; });
  const n = s.players.length, per = charsPerPlayer(n);
  const pool = shuffle(s, [...s.cfg.chars]);
  const faceDown = [pool.pop()];
  const nUp = n === 2 ? 0 : Math.max(0, pool.length - n * per - 1);
  const faceUp = [];
  for (let i = 0; i < pool.length && faceUp.length < nUp; i++) {
    if (rankOf(pool[i]) === 4) continue; // the crown may never be revealed face-up
    faceUp.push(...pool.splice(i--, 1));
  }
  const order = [];
  for (let k = 0; k < per; k++) for (let i = 0; i < n; i++) order.push((s.crown + i) % n);
  // Two players (official): after the first pick, every pick is followed by a face-down discard.
  const discard = order.map((_, i) => n === 2 && i > 0);
  s.draft = { order, idx: 0, avail: pool, faceUp, faceDown, discard, mustDiscard: false };
  emit(s, 'round', { n: s.round, crown: s.crown });
}

// The last picker may also take the face-down card if only one remains (official 7-player rule).
export function draftOptions(s) {
  const d = s.draft;
  if (!d) return [];
  if (d.mustDiscard) return [...d.avail];
  const last = d.idx === d.order.length - 1;
  return last && d.avail.length < 2 && s.players.length > 2 ? [...d.avail, ...d.faceDown] : [...d.avail];
}
export const currentActor = s =>
  s.interrupt ? s.interrupt.pid
    : s.phase === 'draft' ? s.draft.order[s.draft.idx] : s.phase === 'turns' && s.turn ? s.turn.pid : null;

function nextCall(s) {
  while (true) {
    s.call++;
    if (s.call > maxRank(s)) return endRound(s);
    const charId = s.cfg.chars.find(c => rankOf(c) === s.call);
    if (!charId) continue;
    const holder = holderOf(s, s.call);
    if (!holder) { emit(s, 'call', { rank: s.call, charId, pid: null }); continue; }
    const cid = holder.chars.find(c => rankOf(c) === s.call);
    if (s.killed === 4 && s.call === 4) {
      // The advisor/heir is revealed only after every ordinary character call.
      emit(s, 'call', { rank: 4, charId: cid, pid: null });
      continue;
    }
    s.revealed.push(cid);
    (holder.played ||= []).push(cid); // public once called
    holder.lastRank = Math.max(holder.lastRank, s.call);
    if (s.killed === s.call) { bump(holder, 'slain'); emit(s, 'call', { rank: s.call, charId: cid, pid: holder.id, killed: true }); continue; }
    return beginTurn(s, holder, cid);
  }
}

function gain(s, p, n, why) {
  if (n <= 0) return;
  p.gold += n;
  bump(p, 'earned', n);
  emit(s, 'gold', { pid: p.id, n, why });
}

function beginTurn(s, p, charId) {
  const rank = rankOf(charId);
  s.turn = { pid: p.id, charId, rank, income: false, built: 0, paidBuild: false, max: buildLimit(charId), used: {}, pending: null };
  emit(s, 'call', { rank, charId, pid: p.id });

  if (s.robbed === rank && s.robber !== p.id && p.gold > 0) {
    const thief = s.players[s.robber], n = p.gold;
    p.gold = 0; thief.gold += n;
    bump(thief, 'stole', n); bump(p, 'robbed', n);
    emit(s, 'robbed', { from: p.id, to: thief.id, n });
  }
  if (s.threats?.targets.includes(charId) && s.threats.status[charId] === 'assigned') {
    s.turn.threat = 'gather';
    s.turn.threatId = ++s.threatSeq;
  } else applyCharacterEffects(s);
}

// Threatened characters receive these only after their resource action and threat.
function applyCharacterEffects(s) {
  const T = s.turn;
  if (T.effectsApplied) return;
  T.effectsApplied = true;
  const p = s.players[T.pid], charId = T.charId;
  const c = CHAR[charId];
  if (c.crown) {
    s.crown = p.id;
    emit(s, 'crown', { pid: p.id });
  }
  if (c.income) gain(s, p, colorCount(p, c.income) + (charId === 6 ? 1 : 0), 'income');
  if (charId === 12) {
    const cards = draw(s, colorCount(p, 'yellow'));
    p.hand.push(...cards);
    if (cards.length) emit(s, 'cards', { pid: p.id, n: cards.length, why: 'income' });
  }
  if (charId === 13) {
    const rich = s.players.filter(q => q.id !== p.id && q.gold > 0).sort((a, b) => b.gold - a.gold)[0];
    if (rich && rich.gold > p.gold) { rich.gold--; p.gold++; bump(p, 'earned'); emit(s, 'tithe', { from: rich.id, to: p.id }); }
  }
  if (charId === 7) {
    const cards = draw(s, 2);
    p.hand.push(...cards);
    if (cards.length) emit(s, 'cards', { pid: p.id, n: cards.length, why: 'architect' });
  }
  if (charId === 9) {
    const n = s.players.length, king = holderOf(s, 4);
    if (s.killed !== 4 && king && king.id !== p.id && [1, n - 1].includes(Math.abs(king.id - p.id))) gain(s, p, 3, 'queen');
  }
}

export function threatTargets(s) {
  return s.cfg.chars.filter(id => rankOf(id) !== 1 && rankOf(id) !== s.killed && rankOf(id) !== s.bewitched);
}

function advanceThreat(s) {
  const T = s.turn;
  if (T.threat !== 'gather' || !T.income || T.pending) return;
  T.threat = 'bribe';
  s.interrupt = { k: 'threatResponse', pid: T.pid, target: T.pid,
    charId: T.charId, id: T.threatId, round: s.round };
}

function closeThreat(s, status) {
  s.threats.status[s.turn.charId] = status;
  s.interrupt = null;
  s.turn.threat = 'done';
  applyCharacterEffects(s);
}

// Transfers may alias in two-character games; never create gold or tax them.
function threatTransfer(s, from, to, n, bribe) {
  if (from !== to && n > 0) {
    s.players[from].gold -= n;
    s.players[to].gold += n;
    bump(s.players[to], bribe ? 'bribesReceived' : 'stole', n);
    bump(s.players[from], bribe ? 'bribesPaid' : 'robbed', n);
  }
}

function checkComplete(s, p) {
  if (completionCount(p) >= s.cfg.goal && s.firstComplete === null) {
    s.firstComplete = p.id;
    emit(s, 'complete', { pid: p.id });
  }
}

function place(s, p, card) {
  card.round = s.round;
  bump(p, 'built');
  p.city.push(card);
  emit(s, 'build', { pid: p.id, card: publicCard(card) });
  checkComplete(s, p);
}

// Only finalized CONSTRUCTION enters here. Seizure must preserve card metadata
// and must never trigger tax, a warrant, or construction statistics.
function settleConstruction(s, p, card, charId) {
  place(s, p, card);
  const n = taxDue(s, p.gold, charId);
  if (n) {
    p.gold -= n; s.taxPool += n;
    bump(p, 'taxPaid', n);
    emit(s, 'tax', { pid: p.id, n, pool: s.taxPool });
  }
}

// All supported construction actions pay a cost, including card-only Thieves' Den.
// A future explicit cost-waiver must pass paid=false, independently of goldPaid.
function construct(s, builder, card, goldPaid, paid = true) {
  const first = paid && !s.turn.paidBuild;
  if (paid) s.turn.paidBuild = true;
  const w = s.warrants;
  if (first && w?.targets.includes(s.turn.charId)) {
    // Ask for every marked first build, including decoys and duplicates. The
    // existence of a response must not identify the signed warrant to peers.
    s.interrupt = { k: 'warrant', pid: w.pid, builder: builder.id, card,
      goldPaid, id: ++s.constructionSeq, round: s.round };
  } else settleConstruction(s, builder, card, s.turn.charId);
}

export function canConfiscate(s) {
  const i = s.interrupt, w = s.warrants;
  return !!(i?.k === 'warrant' && w && w.pid === i.pid &&
    w.signed === s.turn?.charId && !has(s.players[i.pid], i.card.id));
}

export const emperorRecipients = (s, pid) => s.players.filter(p => p.id !== pid && p.id !== s.crown);
function deferredQueen(s) {
  const queen = holderOf(s, 9), noble = holderOf(s, 4), n = s.players.length;
  if (s.killed === 4 && queen?.chars.includes(9) && s.revealed.includes(9) &&
      noble && queen.id !== noble.id && [1, n - 1].includes(Math.abs(queen.id - noble.id))) gain(s, queen, 3, 'queen');
}
function finishRound(s) {
  if (s.firstComplete !== null || s.round >= MAX_ROUNDS) return finish(s);
  startRound(s);
}
function endRound(s) {
  s.turn = null;
  if (s.killed === 4) {
    const heir = holderOf(s, 4);
    if (heir) {
      const cid = heir.chars.find(c => rankOf(c) === 4);
      s.revealed.push(cid);
      (heir.played ||= []).push(cid);
      heir.lastRank = Math.max(heir.lastRank, 4);
      bump(heir, 'slain');
      emit(s, 'call', { rank: 4, charId: cid, pid: heir.id, killed: true });
    }
    if (heir?.chars.includes(22)) {
      s.interrupt = { k: 'emperorAdvisor', pid: heir.id, charId: 22, round: s.round, id: s.evSeq + 1 };
      emit(s, 'emperorAdvisor', { pid: heir.id });
      return;
    }
    if (heir) { s.crown = heir.id; emit(s, 'crown', { pid: heir.id, heir: true }); }
    deferredQueen(s);
  }
  finishRound(s);
}

// ── scoring ────────────────────────────────────────────────────────────────
export function score(s, p) {
  const city = p.city, purple = city.filter(d => d.color === 'purple');
  const parts = { base: city.reduce((t, d) => t + d.cost, 0), first: 0, complete: 0, colors: 0, extra: 0 };
  if (s.firstComplete === p.id) parts.first = 4;
  else if (completionCount(p) >= s.cfg.goal) parts.complete = 2;
  // School of Magic is always wild; the Haunted Quarter only if it wasn't built in the final round.
  const wild = d => d.id === 'school_of_magic' || (d.id === 'haunted_city' && d.round !== s.round);
  const flex = city.filter(wild).length;
  const present = new Set(city.filter(d => !wild(d)).map(d => d.color));
  if (COLORS.length - present.size <= flex) parts.colors = 3;
  const counts = {};
  city.forEach(d => { counts[d.color] = (counts[d.color] || 0) + 1; });
  for (const d of city) {
    if (d.id === 'dragon_gate' || d.id === 'university') parts.extra += 2;
    if (d.id === 'wishing_well') parts.extra += purple.length - 1;
    if (d.id === 'map_room') parts.extra += p.hand.length;
    if (d.id === 'basilica') parts.extra += city.filter(x => x.cost % 2).length;
    if (d.id === 'capitol' && Object.values(counts).some(v => v >= 3)) parts.extra += 3;
    if (d.id === 'ivory_tower' && purple.length === 1) parts.extra += 5;
    if (d.id === 'secret_vault') parts.extra += 3;
    if (d.id === 'imperial_treasury') parts.extra += p.gold;
    if (d.id === 'statue' && s.crown === p.id) parts.extra += 5;
    if (d.id === 'museum') parts.extra += (d.stored || []).length;
  }
  return { pid: p.id, parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

function finish(s) {
  s.phase = 'over';
  s.turn = null;
  s.scores = s.players.map(p => score(s, p));
  // Tie-break: highest character rank revealed in the final round, then gold.
  const order = [...s.scores].sort((a, b) =>
    b.total - a.total || s.players[b.pid].lastRank - s.players[a.pid].lastRank || s.players[b.pid].gold - s.players[a.pid].gold);
  s.winner = order[0].pid;
  emit(s, 'over', { winner: s.winner });
}

// ── actions ────────────────────────────────────────────────────────────────
const fail = error => ({ error });

// Never throws: anything unexpected (malformed peer input, a rules bug) becomes an {error}.
export function act(state, pid, a) {
  if (!a || typeof a !== 'object' || typeof a.t !== 'string') return fail('bad action');
  if (!Number.isInteger(pid)) return fail('no player');
  try { return actInner(state, pid, a); } catch (e) { return fail('internal: ' + (e?.message || e)); }
}
// For AI lookahead only: mutates `s` (skips the defensive copy). May leave `s` half-updated on error.
export function actInPlace(s, pid, a) {
  if (!a || typeof a !== 'object' || typeof a.t !== 'string') return fail('bad action');
  if (!Number.isInteger(pid)) return fail('no player');
  try { return actInner(s, pid, a, true); } catch (e) { return fail('internal: ' + (e?.message || e)); }
}

function endDraftStep(s, d) {
  d.idx++;
  if (d.idx >= d.order.length) {
    s.phase = 'turns'; d.faceDown.push(...d.avail); d.avail = [];
    const owner = s.players.find(p => has(p, 'theater'));
    if (owner) s.interrupt = { k: 'theater', pid: owner.id, round: s.round, id: ++s.constructionSeq };
    else nextCall(s);
  }
}

function actInner(state, pid, a, inPlace = false) {
  const s = inPlace ? state : structuredClone(state);
  const p = s.players[pid];
  if (!p) return fail('no player');

  if (s.interrupt) { // someone else's decision pauses the active character
    const I = s.interrupt;
    if (I.k === 'theater') {
      if (pid !== I.pid || a.t !== 'theater' || a.id !== I.id || a.round !== I.round ||
          s.phase !== 'turns' || s.turn || s.call !== 0 || typeof a.pass !== 'boolean') return fail('invalid theater response');
      if (!a.pass) {
        const target = Number.isInteger(a.target) && s.players[a.target];
        if (!target || target.id === pid || !target.chars.length || !p.chars.includes(a.charId) || 'incoming' in a)
          return fail('bad theater exchange');
        const idx = Math.floor(rand(s) * target.chars.length), outgoing = p.chars.indexOf(a.charId);
        const incoming = target.chars[idx];
        [p.chars[outgoing], target.chars[idx]] = [target.chars[idx], p.chars[outgoing]];
        p.theaterKnowledge = [{ pid: target.id, charId: a.charId }];
        target.theaterKnowledge = [{ pid, charId: incoming }];
        // Draft observations no longer imply ownership after an exchange.
        s.players.forEach(q => { q.draftChanged = true; });
        emit(s, 'theater', { pid, target: target.id });
      }
      s.interrupt = null;
      nextCall(s);
      return s;
    }
    if (I.k === 'emperorAdvisor') {
      if (pid !== I.pid || a.t !== I.k || a.id !== I.id || a.round !== I.round ||
          a.charId !== I.charId || s.round !== I.round || s.phase !== 'turns' || s.turn ||
          !emperorRecipients(s, pid).some(q => q.id === a.target) || 'resource' in a)
        return fail('invalid advisor response');
      s.crown = a.target;
      emit(s, 'crown', { pid: a.target, advisor: pid });
      s.interrupt = null;
      deferredQueen(s);
      finishRound(s);
      return s;
    }
    if (I.k === 'threatResponse' || I.k === 'threatReveal') {
      if (I.pid !== pid || a.t !== I.k) return fail('waiting for threat response');
      if (a.id !== I.id || a.round !== I.round || a.charId !== I.charId ||
        s.phase !== 'turns' || s.round !== I.round || s.turn?.charId !== I.charId ||
        s.turn.pid !== I.target || s.turn.threatId !== I.id || !s.threats ||
        s.turn.threat !== (I.k === 'threatResponse' ? 'bribe' : 'reveal') ||
        (I.k === 'threatResponse' ? typeof a.bribe !== 'boolean' : typeof a.reveal !== 'boolean'))
        return fail('stale or invalid threat response');
      const from = I.target, to = s.threats.pid;
      if (I.k === 'threatResponse') {
        if (a.bribe) {
          const n = Math.floor(s.players[from].gold / 2);
          threatTransfer(s, from, to, n, true);
          emit(s, 'bribe', { from, to, n, charId: I.charId });
          closeThreat(s, 'bribed');
        } else {
          s.turn.threat = 'reveal';
          s.interrupt = { ...I, k: 'threatReveal', pid: to };
          emit(s, 'threatRefused', { pid: from, charId: I.charId });
        }
      } else if (a.reveal) {
        const flower = s.threats.flower === I.charId;
        const n = flower ? s.players[from].gold : 0;
        threatTransfer(s, from, to, n, false);
        s.threats.faces[I.charId] = flower;
        emit(s, 'threatRevealed', { from, to, n, charId: I.charId, flower });
        closeThreat(s, 'revealed');
      } else {
        emit(s, 'threatPassed', { pid: to, charId: I.charId });
        closeThreat(s, 'passed');
      }
      return s;
    }
    if (I.k === 'warrant') {
      if (I.pid !== pid || a.t !== 'warrantResponse') return fail('waiting for warrant response');
      if (a.id !== I.id || a.round !== I.round || typeof a.take !== 'boolean') return fail('stale or invalid warrant response');
      if (a.take && !canConfiscate(s)) return fail('cannot confiscate');
      s.interrupt = null;
      const builder = s.players[I.builder];
      if (a.take) {
        builder.gold += I.goldPaid;
        s.warrants.revealed = true;
        emit(s, 'confiscate', { pid, target: builder.id, card: I.card, refund: I.goldPaid });
        settleConstruction(s, p, I.card, 17);
      } else settleConstruction(s, builder, I.card, s.turn.charId);
      return s;
    }
    if (I.pid !== pid || a.t !== 'graveyard') return fail('waiting for ' + s.players[I.pid].name);
    s.interrupt = null;
    if (a.take && p.gold >= 1) { p.gold--; p.hand.push(I.card); emit(s, 'graveyard', { pid, card: I.card }); }
    else s.deck.push(I.card);
    return s;
  }

  if (s.phase === 'draft') {
    const d = s.draft;
    if (d.order[d.idx] !== pid) return fail('not your pick');
    if (a.t === 'discard') {
      if (!d.mustDiscard || !d.avail.includes(a.charId)) return fail('cannot discard');
      d.avail = d.avail.filter(c => c !== a.charId);
      d.faceDown.push(a.charId);
      d.mustDiscard = false;
      emit(s, 'discard', { pid });
      endDraftStep(s, d);
      return s;
    }
    if (a.t !== 'pick' || d.mustDiscard) return fail('drafting');
    const opts = draftOptions(s);
    if (!opts.includes(a.charId)) return fail('unavailable');
    p.saw.push(opts);
    d.avail = d.avail.filter(c => c !== a.charId);
    d.faceDown = d.faceDown.filter(c => c !== a.charId);
    p.chars.push(a.charId);
    emit(s, 'pick', { pid });
    if (d.discard?.[d.idx] && d.avail.length) { d.mustDiscard = true; return s; }
    endDraftStep(s, d);
    return s;
  }
  if (s.phase !== 'turns' || !s.turn || s.turn.pid !== pid) return fail('not your turn');

  const T = s.turn, pend = T.pending, cid = T.charId;
  if (T.threat === 'gather' && !['gold', 'draw', 'keep'].includes(a.t)) return fail('gather resources and resolve the threat first');
  const needFree = () => (pend ? 'finish the current choice first' : null);
  const takeFromHand = uid => { const i = p.hand.findIndex(c => c.uid === uid); return i < 0 ? null : p.hand.splice(i, 1)[0]; };
  const ability = (charId, extra) => {
    if (cid !== charId) return 'not your ability';
    if (T.used.ability) return 'ability already used';
    return needFree() || extra || null;
  };
  let err;

  switch (a.t) {
    case 'emperorCrown': {
      if ((err = ability(22))) return fail(err);
      const target = emperorRecipients(s, pid).find(q => q.id === a.target);
      if (!target || a.round !== s.round || a.charId !== cid) return fail('bad crown recipient');
      const choices = [...(target.gold > 0 ? ['gold'] : []), ...(target.hand.length ? ['card'] : [])];
      if (!(choices.length ? choices : ['none']).includes(a.resource)) return fail('bad tribute');
      T.used.ability = true;
      s.crown = target.id;
      emit(s, 'crown', { pid: target.id });
      if (a.resource === 'gold') {
        target.gold--; p.gold++;
        bump(p, 'stole'); bump(target, 'robbed');
      } else if (a.resource === 'card') {
        const index = Math.floor(rand(s) * target.hand.length);
        p.hand.push(...target.hand.splice(index, 1));
        bump(p, 'tributeCardsReceived'); bump(target, 'tributeCardsPaid');
      }
      // Never include the transferred card or random index in public events.
      emit(s, 'emperorTribute', { from: target.id, to: pid, resource: a.resource });
      return s;
    }
    case 'threats': {
      if ((err = ability(21))) return fail(err);
      const targets = a.targets, legal = threatTargets(s);
      if (a.round !== s.round || a.charId !== cid || !Array.isArray(targets) || targets.length !== 2 ||
        new Set(targets).size !== 2 || ![...targets].every(id => Number.isInteger(id) && legal.includes(id)) ||
        !targets.includes(a.flower)) return fail('bad threats');
      T.used.ability = true;
      s.threats = { pid, targets: [...targets].sort((a, b) => a - b), flower: a.flower,
        status: Object.fromEntries(targets.map(id => [id, 'assigned'])), faces: {} };
      emit(s, 'threats', { pid, targets: s.threats.targets });
      return s;
    }
    case 'collectTax': {
      if ((err = ability(19))) return fail(err);
      if (a.round !== s.round || a.charId !== cid || !s.cfg.chars.includes(19) || s.killed === T.rank)
        return fail('stale or invalid collection');
      const n = s.taxPool;
      T.used.ability = true;
      p.gold += n; s.taxPool = 0;
      bump(p, 'taxCollected', n);
      emit(s, 'collectTax', { pid, n });
      return s;
    }
    case 'seize': {
      if ((err = ability(20))) return fail(err);
      if (a.round !== s.round || a.charId !== cid || !s.cfg.chars.includes(20) || s.killed === T.rank)
        return fail('stale or invalid seizure');
      const target = Number.isInteger(a.target) && s.players[a.target];
      const card = target && target.city.find(c => c.uid === a.uid);
      if ((err = seizeError(s, p, target, card))) return fail(err);
      const cost = seizureCost(target, card);
      T.used.ability = true;
      p.gold -= cost; target.gold += cost;
      target.city.splice(target.city.findIndex(c => c.uid === card.uid), 1);
      p.city.push(card);
      for (const c of card.stored || []) c.knownTo = [...new Set([...(c.knownTo || []), pid])];
      bump(p, 'seized'); bump(target, 'seizedFrom');
      emit(s, 'seize', { pid, target: target.id, card: publicCard(card), cost });
      checkComplete(s, p);
      return s;
    }
    case 'spy': {
      const target = Number.isInteger(a.target) && s.players[a.target];
      if ((err = ability(18, !target || target.id === pid || !COLORS.includes(a.color) || a.round !== s.round
        ? 'bad spy target, type or round' : null))) return fail(err);
      // Commit target and type atomically before exposing the private snapshot.
      // This is knowledge, not another physical card zone. It expires with this turn.
      T.used.ability = true;
      T.spyPeek = { target: target.id, cards: structuredClone(target.hand) };
      const matches = target.hand.filter(c => c.color === a.color).length;
      const gold = Math.min(matches, target.gold);
      target.gold -= gold; p.gold += gold;
      bump(p, 'stole', gold); bump(target, 'robbed', gold);
      const cards = draw(s, Math.min(matches, 2));
      p.hand.push(...cards);
      emit(s, 'spy', { pid, target: target.id, color: a.color, gold, n: cards.length });
      return s;
    }
    case 'warrants': {
      if ((err = ability(17))) return fail(err);
      const targets = a.targets;
      if (!Array.isArray(targets) || targets.length !== 3 || new Set(targets).size !== 3 ||
        ![...targets].every(c => Number.isInteger(c) && s.cfg.chars.includes(c)) || !targets.includes(a.signed)) return fail('bad warrants');
      T.used.ability = true;
      s.warrants = { pid, targets: [...targets].sort((a, b) => a - b), signed: a.signed, revealed: false };
      emit(s, 'warrants', { pid, targets: s.warrants.targets });
      return s;
    }
    case 'gold':
      if ((err = needFree()) || (T.income && (err = 'income taken'))) return fail(err);
      T.income = true;
      gain(s, p, 2 + Number(has(p, 'gold_mine')), 'take');
      advanceThreat(s);
      return s;

    case 'draw': {
      if ((err = needFree()) || (T.income && (err = 'income taken'))) return fail(err);
      if (!s.deck.length) return fail('deck empty');
      T.income = true;
      const cards = draw(s, has(p, 'observatory') ? 3 : 2);
      emit(s, 'draw', { pid, n: cards.length });
      if (has(p, 'library')) p.hand.push(...cards);
      else T.pending = { k: 'keep', cards, n: 1 };
      advanceThreat(s);
      return s;
    }

    case 'keep': {
      if (!pend || pend.k !== 'keep') return fail('nothing to keep');
      const uids = [...new Set(a.uids || [])];
      if (uids.length !== Math.min(pend.n, pend.cards.length) || !uids.every(u => pend.cards.some(c => c.uid === u)))
        return fail('pick ' + pend.n);
      const kept = pend.cards.filter(c => uids.includes(c.uid)), rest = pend.cards.filter(c => !uids.includes(c.uid));
      p.hand.push(...kept);
      s.deck.push(...rest);
      if (pend.shuffle) shuffle(s, s.deck); // Scholar: shuffled back into the whole deck
      T.pending = null;
      advanceThreat(s);
      return s;
    }

    case 'build': {
      if ((err = needFree())) return fail(err);
      if (!T.income) return fail('take income first');
      const card = p.hand.find(c => c.uid === a.uid);
      if (!card) return fail('not in hand');
      const plan = constructionPlan(s, p, card, a);
      if (plan.error) return fail(plan.error);
      const { pay, goldDue, sacrifice, paid } = plan;
      if (sacrifice) {
        discardDistrict(s, p, sacrifice);
        emit(s, 'sacrifice', { pid, card: publicCard(sacrifice) });
      }
      takeFromHand(card.uid);
      s.deck.push(...pay.map(takeFromHand));
      p.gold -= goldDue;
      if (countsTowardLimit(cid, card)) T.built++;
      construct(s, p, card, goldDue, paid);
      return s;
    }

    case 'kill': {
      if ((err = ability(1, targetRankError(s, a.rank, [1])))) return fail(err);
      T.used.ability = true;
      s.killed = a.rank;
      emit(s, 'kill', { pid, rank: a.rank });
      return s;
    }

    case 'rob': {
      if ((err = ability(2, targetRankError(s, a.rank, [1, 2, s.killed])))) return fail(err);
      T.used.ability = true;
      s.robbed = a.rank; s.robber = pid;
      emit(s, 'rob', { pid, rank: a.rank });
      return s;
    }

    case 'swap': {
      const o = s.players[a.target];
      if ((err = ability(3, !o || o.id === pid ? 'bad target' : null))) return fail(err);
      T.used.ability = true;
      [p.hand, o.hand] = [o.hand, p.hand];
      emit(s, 'swap', { pid, target: o.id, a: o.hand.length, b: p.hand.length });
      return s;
    }

    case 'redraw': {
      const uids = [...new Set(a.uids || [])];
      if ((err = ability(3, !uids.length || !uids.every(u => p.hand.some(c => c.uid === u)) ? 'bad cards' : null))) return fail(err);
      T.used.ability = true;
      s.deck.push(...uids.map(takeFromHand));
      p.hand.push(...draw(s, uids.length));
      emit(s, 'redraw', { pid, n: uids.length });
      return s;
    }

    case 'destroy': {
      const o = s.players[a.target], card = o && o.city.find(c => c.uid === a.uid);
      const why = !card ? 'bad target' : shielded(s, o) || (card.id === 'keep' ? 'keep' : null) ||
        (destroyCost(o, card) > p.gold ? 'cannot afford' : null);
      if ((err = ability(8, why))) return fail(err);
      T.used.ability = true;
      const cost = destroyCost(o, card);
      p.gold -= cost;
      if (o.id !== pid) { bump(p, 'razed'); bump(o, 'lost'); }
      emit(s, 'destroy', { pid, target: o.id, card: publicCard(card), cost });
      if (o.id !== pid && card.id !== 'graveyard' && has(o, 'graveyard') && o.gold >= 1)
        { o.city = o.city.filter(c => c.uid !== card.uid); s.interrupt = { k: 'graveyard', pid: o.id, card }; }
      else discardDistrict(s, o, card);
      return s;
    }

    case 'peek': {
      const o = s.players[a.target];
      if ((err = ability(11, !o || o.id === pid || !o.hand.length ? 'bad target' : null))) return fail(err);
      T.used.ability = true;
      T.pending = { k: 'wizard', target: o.id, cards: structuredClone(o.hand) };
      emit(s, 'peek', { pid, target: o.id });
      return s;
    }

    case 'wizTake': {
      if (!pend || pend.k !== 'wizard') return fail('not peeking');
      const o = s.players[pend.target], card = o.hand.find(c => c.uid === a.uid);
      if (!card) return fail('bad card');
      // The Wizard's direct build permits duplicates; that permission belongs
      // to the builder, never to a Magistrate who confiscates the district.
      const plan = a.build ? constructionPlan(s, p, card, a, true) : null;
      if (plan?.error) return fail(plan.error);
      o.hand = o.hand.filter(c => c.uid !== card.uid);
      T.pending = null;
      emit(s, 'wizTake', { pid, target: o.id });
      if (a.build) {
        if (plan.sacrifice) { discardDistrict(s, p, plan.sacrifice); emit(s, 'sacrifice', { pid, card: publicCard(plan.sacrifice) }); }
        s.deck.push(...plan.pay.map(takeFromHand));
        p.gold -= plan.goldDue;
        construct(s, p, card, plan.goldDue, plan.paid);
      } // bonus build, exempt from limit
      else p.hand.push(card);
      return s;
    }

    case 'seer': {
      if ((err = ability(15))) return fail(err);
      T.used.ability = true;
      const from = s.players.filter(q => q.id !== pid && q.hand.length);
      for (const q of from) p.hand.push(q.hand.splice(Math.floor(rand(s) * q.hand.length), 1)[0]);
      emit(s, 'seer', { pid, n: from.length });
      if (from.length) T.pending = { k: 'seerGive', targets: from.map(q => q.id) };
      return s;
    }

    case 'seerGive': {
      if (!pend || pend.k !== 'seerGive') return fail('nothing to give');
      const uids = [...new Set(a.uids || [])];
      if (uids.length !== pend.targets.length || !uids.every(u => p.hand.some(c => c.uid === u))) return fail('give one card to each');
      uids.forEach((u, i) => s.players[pend.targets[i]].hand.push(takeFromHand(u)));
      T.pending = null;
      emit(s, 'seerGive', { pid, n: uids.length });
      return s;
    }

    case 'nav': {
      if ((err = ability(10, ['gold', 'cards'].includes(a.choice) ? null : 'bad choice'))) return fail(err);
      T.used.ability = true;
      if (a.choice === 'gold') gain(s, p, 4, 'navigator');
      else { const c = draw(s, 4); p.hand.push(...c); emit(s, 'cards', { pid, n: c.length, why: 'navigator' }); }
      return s;
    }

    case 'scholar': {
      if ((err = ability(14, s.deck.length ? null : 'deck empty'))) return fail(err);
      T.used.ability = true;
      T.pending = { k: 'keep', cards: draw(s, 7), n: 1, shuffle: true };
      emit(s, 'draw', { pid, n: T.pending.cards.length, why: 'scholar' });
      return s;
    }

    case 'armory': {
      if ((err = needFree())) return fail(err);
      const armory = p.city.find(c => c.uid === a.armory), target = Number.isInteger(a.target) && s.players[a.target];
      const card = target && target.city.find(c => c.uid === a.uid);
      if ((err = armoryError(s, p, armory, target, card))) return fail(err);
      emit(s, 'destroy', { pid, target: target.id, card: publicCard(card), cost: 0 });
      emit(s, 'sacrifice', { pid, card: publicCard(armory) });
      discardDistrict(s, target, card);
      discardDistrict(s, p, armory);
      if (target.id !== pid) { bump(p, 'razed'); bump(target, 'lost'); }
      return s;
    }
    case 'museum': {
      if ((err = needFree())) return fail(err);
      const museum = p.city.find(c => c.uid === a.museum && c.id === 'museum');
      const card = p.hand.find(c => c.uid === a.uid);
      if (!museum || !card || T.used['museum:' + museum.uid]) return fail('invalid museum storage');
      T.used['museum:' + museum.uid] = true;
      takeFromHand(card.uid);
      card.knownTo = [pid];
      (museum.stored ||= []).push(card);
      emit(s, 'museum', { pid });
      return s;
    }
    case 'smithy':
      if ((err = needFree()) || (!has(p, 'smithy') && (err = 'no smithy')) || (T.used.smithy && (err = 'used')) ||
        (p.gold < 2 && (err = 'cannot afford'))) return fail(err);
      T.used.smithy = true;
      p.gold -= 2;
      { const c = draw(s, 3); p.hand.push(...c); emit(s, 'cards', { pid, n: c.length, why: 'smithy', cost: 2 }); }
      return s;

    case 'lab': {
      if ((err = needFree()) || (!has(p, 'laboratory') && (err = 'no lab')) || (T.used.lab && (err = 'used'))) return fail(err);
      const card = takeFromHand(a.uid);
      if (!card) return fail('bad card');
      T.used.lab = true;
      s.deck.push(card);
      gain(s, p, 2, 'lab');
      return s;
    }

    case 'end':
      if ((err = needFree())) return fail(err);
      if (cid === 22 && !T.used.ability) return fail('assign the crown first');
      if (!T.income) return fail('take income first');
      if (has(p, 'park') && !p.hand.length) {
        const cards = draw(s, 2); p.hand.push(...cards);
        if (cards.length) emit(s, 'cards', { pid, n: cards.length, why: 'park' });
      }
      if (has(p, 'poor_house') && p.gold === 0) gain(s, p, 1, 'poor_house');
      emit(s, 'end', { pid });
      s.turn = null;
      nextCall(s);
      return s;
  }
  return fail('unknown action');
}

// Ranks a targeted ability may name: in this game's pool, not face-up, not excluded.
export function targetRanks(s, exclude) {
  const up = (s.draft?.faceUp || []).map(rankOf);
  return [...new Set(s.cfg.chars.map(rankOf))]
    .filter(r => !exclude.includes(r) && !up.includes(r)).sort((a, b) => a - b);
}
function targetRankError(s, rank, exclude) {
  return targetRanks(s, exclude).includes(rank) ? null : 'bad target';
}

// ── hidden information ─────────────────────────────────────────────────────
// What player `pid` is allowed to know. Sent to peers and fed to the AI, so nobody cheats.
// pid = -1 → spectator view.
export function viewFor(s, pid) {
  const v = structuredClone(s);
  const over = s.phase === 'over';
  v.seed = 0;
  v.deckCount = s.deck.length;
  v.deck = [];
  v.me = pid;
  for (const q of v.players) {
    for (const card of q.city) if (card.stored) card.stored = card.stored.map((c, i) => {
      if (over || q.id === pid || c.knownTo?.includes(pid)) { const copy = { ...c }; delete copy.knownTo; return copy; }
      return { uid: 'stored:' + card.uid + ':' + i, hidden: true };
    });
    q.handCount = q.hand.length;
    q.charCount = q.chars.length;
    if (q.id !== pid && !over) {
      q.saw = [];
      delete q.theaterKnowledge;
      q.hand = q.hand.map((_, i) => ({ uid: 'h' + q.id + '_' + i, hidden: true }));
      q.chars = q.chars.filter(c => s.revealed.includes(c));
    }
  }
  if (v.draft) {
    delete v.draft.options;
    v.draft.availCount = s.draft.avail.length;
    v.draft.faceDown = s.draft.faceDown.map(() => 0);
    if (s.phase !== 'draft' || s.draft.order[s.draft.idx] !== pid) v.draft.avail = [];
    else v.draft.options = draftOptions(s);
  }
  if (v.turn?.pending && v.turn.pid !== pid) {
    const pending = v.turn.pending;
    // Keep public decision context so sampled worlds can resume the choice,
    // without exposing card identities or treating Wizard's snapshot as a zone.
    v.turn.pending = pending.k === 'keep'
      ? { k: pending.k, count: pending.cards.length, n: pending.n, shuffle: !!pending.shuffle }
      : pending.k === 'wizard' ? { k: pending.k, target: pending.target }
      : pending.k === 'seerGive' ? { k: pending.k, targets: [...pending.targets] }
      : { k: pending.k };
  }
  if (v.turn && v.turn.pid !== pid) delete v.turn.spyPeek;
  if (v.warrants && v.warrants.pid !== pid && !v.warrants.revealed && !over) v.warrants.signed = null;
  // Even paid-off/finished markers retain their private original identity.
  if (v.threats && v.threats.pid !== pid) v.threats.flower = null;
  return v;
}
