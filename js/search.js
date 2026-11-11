// Lookahead for the "cunning" AI: determinized Monte-Carlo search.
// For a decision, sample hidden information consistent with what this player knows (opponents'
// hands, unrevealed characters, the deck), play the rest of the round out with the Cunning heuristic policy for
// everyone, and keep the option that leaves us furthest ahead. Common random numbers: each
// sample is shared by all options, so they're compared on identical "worlds".

import { act, currentActor, draftOptions, score, viewFor, completionCount } from './engine.js?v=a3b36d07';
import { aiAction, safeAction, holdProbs } from './ai.js?v=a3b36d07';
import { makeDeck } from './data.js?v=a3b36d07';

const SOFT = 0.35; // softmax temperature (points): near-ties vary, clear wins don't. 0.6 cost ~4% win rate.

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedTake(items, weight) { // remove and return one item, chosen by weight
  const w = items.map(weight), total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total, i = 0;
  for (; i < items.length - 1; i++) if ((r -= w[i]) <= 0) break;
  return items.splice(i, 1)[0];
}

// A full, playable state consistent with player `me`'s view.
export function determinize(v, me) {
  const s = structuredClone(v);
  if (s.warrants && s.warrants.signed === null) {
    const targets = s.warrants.targets;
    s.warrants.signed = targets[Math.floor(Math.random() * targets.length)];
  }
  if (s.threats && s.threats.flower === null) {
    const b = s.threats;
    const revealed = b.targets.find(id => b.faces[id] === true);
    const possible = b.targets.filter(id => b.faces[id] !== false);
    b.flower = revealed ?? possible[Math.floor(Math.random() * possible.length)];
  }
  s.seed = (Math.random() * 2 ** 31) | 0;
  const known = new Set();
  const mark = cards => cards.forEach(c => !c.hidden && known.add(c.uid));
  s.players.forEach(p => { mark(p.city); p.city.forEach(c => mark(c.stored || [])); if (p.id === me) mark(p.hand); });
  if (s.interrupt?.card) { mark([s.interrupt.card]); mark(s.interrupt.card.stored || []); }
  const pending = s.turn?.pending;
  if (pending?.k === 'keep' && pending.cards) mark(pending.cards);
  // Inspections are knowledge copies. Never place a remembered card back in
  // an opponent's hand if its current physical location is already known.
  const inspected = new Map();
  for (const peek of [pending?.k === 'wizard' && pending.cards ? pending : null, s.turn?.spyPeek]) {
    if (!peek || peek.target === me) continue;
    const target = s.players[peek.target];
    const cards = peek.cards.filter(c => !known.has(c.uid)).slice(0, target.handCount);
    inspected.set(target.id, cards);
    mark(cards);
  }
  const pool = shuffle(makeDeck(v.cfg.uniqueDistricts).filter(c => !known.has(c.uid)));
  for (const p of s.players) for (const museum of p.city) if (museum.stored) {
    museum.stored = museum.stored.map(c => c.hidden ? { ...pool.shift(), knownTo: [p.id] } : { ...c, knownTo: [p.id, me] });
  }
  for (const p of s.players) if (p.id !== me) {
    // A Wizard peek is a copy of the target's hand, not a separate card zone.
    // Keep those known cards in that hand so wizTake remains playable.
    const seen = inspected.get(p.id) || [];
    p.hand = [...structuredClone(seen), ...pool.splice(0, Math.max(0, p.handCount - seen.length))];
  }
  if (pending?.k === 'keep' && !pending.cards) {
    pending.cards = pool.splice(0, pending.count);
    delete pending.count;
  } else if (pending?.k === 'wizard') {
    pending.cards = structuredClone(s.players[pending.target].hand);
  }
  s.deck = pool.slice(0, Math.max(0, v.deckCount));

  // characters
  const mine = s.players[me];
  const used = new Set([...s.draft.faceUp, ...mine.chars, ...s.revealed]);
  if (s.phase === 'draft') {
    // Players before us already picked from what we never saw; the rest is face down.
    const d = s.draft;
    const offered = new Set(d.options || d.avail);
    const missing = shuffle(v.cfg.chars.filter(c => !used.has(c) && !offered.has(c)));
    const done = d.order.slice(0, d.idx).filter(pid => pid !== me);
    for (const pid of done) {
      const p = s.players[pid];
      const need = (p.charCount ?? p.chars.length) - p.chars.length;
      for (let k = 0; k < need && missing.length; k++) p.chars.push(missing.pop());
    }
    // whatever's left is face down — including a face-down card we're allowed to take (7 players)
    d.faceDown = [...(d.options || []).filter(c => !d.avail.includes(c)), ...missing];
  } else if (s.phase === 'turns') {
    // The two participants remember the role they gave away. Reserve it before
    // sampling other hidden roles so a known exchange cannot be contradicted.
    for (const k of mine.theaterKnowledge || []) {
      const target = s.players[k.pid];
      if (!target.chars.includes(k.charId) && !s.revealed.includes(k.charId)) target.chars.push(k.charId);
    }
    const probs = holdProbs(v, mine);
    const assigned = new Set(s.players.flatMap(p => p.chars));
    const open = [...probs.keys()].filter(c => !assigned.has(c));
    for (const p of shuffle(s.players.filter(q => q.id !== me))) {
      const need = (p.charCount ?? p.chars.length) - p.chars.length;
      for (let k = 0; k < need && open.length; k++)
        p.chars.push(weightedTake(open, c => (probs.get(c)?.get(p.id) ?? 0) + 0.02));
    }
  }
  s.players.forEach(p => { delete p.handCount; delete p.charCount; if (p.id !== me) { p.saw = []; delete p.theaterKnowledge; } });
  delete s.deckCount; delete s.me;
  return s;
}

// Each policy receives its own permitted view. Rejected actions discard their
// transactional copy, so fallback never continues a half-mutated simulation.
function playOutRound(s) {
  const round = s.round;
  for (let k = 0; k < 400 && s.phase !== 'over' && s.round === round; k++) {
    const pid = currentActor(s);
    if (pid === null) break;
    s.deckCount = s.deck.length;
    if (s.phase === 'draft') s.draft.options = draftOptions(s);
    let a = null;
    const policyView = viewFor(s, pid);
    if (s.phase === 'draft') policyView.draft.options = draftOptions(s);
    try { a = aiAction(policyView, pid, { lookahead: false }); } catch { /* fall back below */ }
    let r = a ? act(s, pid, a) : { error: 1 };
    if (r.error) { r = act(s, pid, safeAction(policyView, pid)); if (r.error) break; }
    s = r;
  }
  return s;
}

// Position value: points banked, plus resources that turn into points soon.
function standing(s, p) {
  const left = Math.max(0, s.cfg.goal - completionCount(p));
  return score(s, p).total + p.gold * 0.5 + Math.min(p.hand.length, left) * 0.45 + (s.phase !== 'over' && s.firstComplete === null && s.round < 40 && s.crown === p.id ? 0.6 : 0);
}
function outcome(s, me) {
  const mine = standing(s, s.players[me]);
  const rivals = s.players.filter(p => p.id !== me).map(p => standing(s, p));
  const top = Math.max(...rivals), avg = rivals.reduce((a, b) => a + b, 0) / rivals.length;
  return mine - 0.6 * top - 0.4 * avg + (s.phase === 'over' && s.winner === me ? 8 : 0);
}

// Pick the best of `actions` for player `me`. Budget is in rollouts (options × samples).
export function search(v, me, actions, budget = 120, { actionBonus = null, stable = false } = {}) {
  if (actions.length <= 1) return actions[0];
  const samples = Math.max(4, Math.floor(budget / actions.length));
  const total = actions.map(() => 0);
  for (let i = 0; i < samples; i++) {
    const world = determinize(v, me);
    actions.forEach((a, k) => {
      const s1 = act(world, me, a);
      if (s1.error) { total[k] -= 99; return; }
      const result = playOutRound(s1);
      total[k] += outcome(result, me) + (actionBonus ? actionBonus(a, result) : 0);
    });
  }
  // Near-ties are a coin flip, not always the same pick: softmax over the mean outcome.
  const mean = total.map(t => t / samples), top = Math.max(...mean);
  // Mandatory Emperor choices use the first best action (seat/resource order).
  if (stable) return actions[mean.indexOf(top)];
  const w = mean.map(m => Math.exp((m - top) / SOFT));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < w.length; k++) if ((r -= w[k]) <= 0) return actions[k];
  return actions[mean.indexOf(top)];
}
