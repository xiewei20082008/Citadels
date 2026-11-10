// Rules engine. Pure and serializable: every function takes a plain-object state.
// act(state, pid, action) returns a NEW state, or {error} when the move is illegal.
// Humans, AI and network peers all go through act(), so they play by identical rules.

import { CHAR, COLORS, makeDeck } from './data.js?v=a295c9dc';

const MAX_EV = 120;
export const VERSION = 5; // Persistent construction taxes and Marshal acquisitions
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
export const maxRank = s => Math.max(...s.cfg.chars.map(rankOf));
export const holderOf = (s, rank) => s.players.find(p => p.chars.some(c => rankOf(c) === rank));

export function colorCount(p, color) {
  return p.city.filter(d => d.color === color || d.id === 'school_of_magic').length;
}
export function buildCost(p, card) {
  return card.color === 'purple' && card.id !== 'factory' && has(p, 'factory') ? Math.max(0, card.cost - 1) : card.cost;
}
export function canPlace(p, card) {
  return !has(p, card.id) || has(p, 'quarry');
}
export function destroyCost(target, card) {
  return Math.max(0, card.cost - 1) + (has(target, 'great_wall') && card.id !== 'great_wall' ? 1 : 0);
}
// Construction tax is paid from the stash left AFTER payment, never borrowed.
export const taxDue = (s, gold, charId) => s.cfg.chars.includes(19) && charId !== 19 && gold > 0 ? 1 : 0;
// Separate from construction discounts and Warlord destruction modifiers.
export const seizureCost = card => card.cost;
export function seizeError(s, marshal, target, card) {
  if (!target || target.id === marshal.id || !card || !target.city.some(c => c.uid === card.uid)) return 'bad target';
  return shielded(s, target) || (has(marshal, card.id) ? 'duplicate' : null) ||
    (seizureCost(card) > 3 ? 'expensive' : null) || (seizureCost(card) > marshal.gold ? 'poor' : null);
}
// Can the current Warlord touch this player's city at all?
export function shielded(s, target) {
  if (target.city.length >= s.cfg.goal) return 'complete';
  if (target.chars.includes(5) && s.killed !== 5) return 'bishop'; // the Bishop only, not the Abbot
  return null;
}
export function buildLimit(charId) {
  return { 7: 3, 14: 2, 15: 2, 10: 0 }[charId] ?? 1;
}
export function countsTowardLimit(charId, card) {
  return !(charId === 16 && card.color === 'green');
}

// ── setup ──────────────────────────────────────────────────────────────────
// cfg: { players:[{name, ai, avatar}], chars:[charIds], goal:7|8, seed? }
export function createGame(cfg) {
  const n = cfg.players.length;
  if (n < 2 || n > 7) throw new Error('2–7 players');
  const ranks = cfg.chars.map(rankOf);
  if (new Set(ranks).size !== ranks.length) throw new Error('one character per rank');
  if (!ranks.includes(4)) throw new Error('rank 4 (crown) required');
  if (cfg.chars.length < n * charsPerPlayer(n) + 1) throw new Error('not enough characters');

  const s = {
    v: VERSION, seed: cfg.seed ?? (Math.random() * 2 ** 31) | 0,
    cfg: { chars: [...cfg.chars], goal: cfg.goal || 8, level: 'hard' },
    players: cfg.players.map((p, i) => ({
      id: i, name: p.name, ai: !!p.ai, avatar: p.avatar || '',
      gold: 2, hand: [], city: [], chars: [], lastRank: 0, saw: [],
    })),
    deck: [], round: 0, phase: 'draft', crown: 0,
    draft: null, call: 0, turn: null, killed: null, robbed: null, robber: null, revealed: [], interrupt: null,
    firstComplete: null, scores: null, winner: null, ev: [], evSeq: 0,
    warrants: null, constructionSeq: 0, taxPool: 0,
  };
  s.deck = shuffle(s, makeDeck());
  s.players.forEach(p => { p.hand = draw(s, 4); });
  s.crown = Math.floor(rand(s) * n);
  emit(s, 'start', {});
  startRound(s);
  return s;
}

function startRound(s) {
  s.round++;
  s.warrants = null;
  s.phase = 'draft';
  s.turn = null; s.call = 0; s.killed = null; s.robbed = null; s.robber = null; s.revealed = [];
  s.players.forEach(p => { p.chars = []; p.saw = []; p.lastRank = 0; });
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
    if (king && king.id !== p.id && [1, n - 1].includes(Math.abs(king.id - p.id))) gain(s, p, 3, 'queen');
  }
}

function checkComplete(s, p) {
  if (p.city.length >= s.cfg.goal && s.firstComplete === null) {
    s.firstComplete = p.id;
    emit(s, 'complete', { pid: p.id });
  }
}

function place(s, p, card) {
  card.round = s.round;
  bump(p, 'built');
  p.city.push(card);
  emit(s, 'build', { pid: p.id, card });
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

function endRound(s) {
  s.turn = null;
  if (s.killed === 4) { // an assassinated King still inherits the crown at round end
    const heir = holderOf(s, 4);
    if (heir) { s.crown = heir.id; emit(s, 'crown', { pid: heir.id, heir: true }); }
  }
  if (s.firstComplete !== null || s.round >= MAX_ROUNDS) return finish(s);
  startRound(s);
}

// ── scoring ────────────────────────────────────────────────────────────────
export function score(s, p) {
  const city = p.city, purple = city.filter(d => d.color === 'purple');
  const parts = { base: city.reduce((t, d) => t + d.cost, 0), first: 0, complete: 0, colors: 0, extra: 0 };
  if (s.firstComplete === p.id) parts.first = 4;
  else if (city.length >= s.cfg.goal) parts.complete = 2;
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
  if (d.idx >= d.order.length) { s.phase = 'turns'; d.faceDown.push(...d.avail); d.avail = []; nextCall(s); }
}

function actInner(state, pid, a, inPlace = false) {
  const s = inPlace ? state : structuredClone(state);
  const p = s.players[pid];
  if (!p) return fail('no player');

  if (s.interrupt) { // someone else's decision pauses the active character
    const I = s.interrupt;
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
  const needFree = () => (pend ? 'finish the current choice first' : null);
  const takeFromHand = uid => { const i = p.hand.findIndex(c => c.uid === uid); return i < 0 ? null : p.hand.splice(i, 1)[0]; };
  const ability = (charId, extra) => {
    if (cid !== charId) return 'not your ability';
    if (T.used.ability) return 'ability already used';
    return needFree() || extra || null;
  };
  let err;

  switch (a.t) {
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
      const cost = seizureCost(card);
      T.used.ability = true;
      p.gold -= cost; target.gold += cost;
      target.city.splice(target.city.findIndex(c => c.uid === card.uid), 1);
      p.city.push(card);
      bump(p, 'seized'); bump(target, 'seizedFrom');
      emit(s, 'seize', { pid, target: target.id, card, cost });
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
      gain(s, p, 2, 'take');
      return s;

    case 'draw': {
      if ((err = needFree()) || (T.income && (err = 'income taken'))) return fail(err);
      if (!s.deck.length) return fail('deck empty');
      T.income = true;
      const cards = draw(s, has(p, 'observatory') ? 3 : 2);
      emit(s, 'draw', { pid, n: cards.length });
      if (has(p, 'library')) p.hand.push(...cards);
      else T.pending = { k: 'keep', cards, n: 1 };
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
      return s;
    }

    case 'build': {
      if ((err = needFree())) return fail(err);
      if (!T.income) return fail('take income first');
      const card = p.hand.find(c => c.uid === a.uid);
      if (!card) return fail('not in hand');
      const counts = countsTowardLimit(cid, card);
      if (counts && T.built >= T.max) return fail('build limit');
      if (!canPlace(p, card)) return fail('duplicate');
      const cost = buildCost(p, card);
      const pay = [...new Set(a.pay || [])];
      if (pay.length && card.id !== 'thieves_den') return fail('only Thieves\' Den takes cards');
      if (pay.includes(card.uid) || !pay.every(u => p.hand.some(c => c.uid === u))) return fail('bad payment');
      const goldDue = cost - pay.length;
      if (goldDue < 0 || goldDue > p.gold) return fail('cannot afford');
      takeFromHand(card.uid);
      s.deck.push(...pay.map(takeFromHand));
      p.gold -= goldDue;
      if (counts) T.built++;
      construct(s, p, card, goldDue);
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
      o.city = o.city.filter(c => c.uid !== card.uid);
      if (o.id !== pid) { bump(p, 'razed'); bump(o, 'lost'); }
      emit(s, 'destroy', { pid, target: o.id, card, cost });
      if (o.id !== pid && card.id !== 'graveyard' && has(o, 'graveyard') && o.gold >= 1)
        s.interrupt = { k: 'graveyard', pid: o.id, card }; // the owner decides whether to pay 1
      else s.deck.push(card);
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
      if (a.build && buildCost(p, card) > p.gold) return fail('cannot build');
      o.hand = o.hand.filter(c => c.uid !== card.uid);
      T.pending = null;
      emit(s, 'wizTake', { pid, target: o.id });
      if (a.build) { const cost = buildCost(p, card); p.gold -= cost; construct(s, p, card, cost); } // paid bonus build, exempt from limit
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
      if (!T.income) return fail('take income first');
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
    q.handCount = q.hand.length;
    q.charCount = q.chars.length;
    if (q.id !== pid && !over) {
      q.saw = [];
      q.hand = q.hand.map((_, i) => ({ uid: 'h' + q.id + '_' + i, hidden: true }));
      q.chars = q.chars.filter(c => s.revealed.includes(c));
    }
  }
  if (v.draft) {
    v.draft.availCount = s.draft.avail.length;
    v.draft.faceDown = s.draft.faceDown.map(() => 0);
    if (s.phase !== 'draft' || s.draft.order[s.draft.idx] !== pid) v.draft.avail = [];
    else v.draft.options = draftOptions(s);
  }
  if (v.turn?.pending && v.turn.pid !== pid) v.turn.pending = { k: v.turn.pending.k };
  if (v.turn && v.turn.pid !== pid) delete v.turn.spyPeek;
  if (v.warrants && v.warrants.pid !== pid && !v.warrants.revealed && !over) v.warrants.signed = null;
  return v;
}
