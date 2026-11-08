// Lookahead for the "cunning" AI: determinized Monte-Carlo search.
// For a decision, sample hidden information consistent with what this player knows (opponents'
// hands, unrevealed characters, the deck), play the rest of the round out with the Cunning heuristic policy for
// everyone, and keep the option that leaves us furthest ahead. Common random numbers: each
// sample is shared by all options, so they're compared on identical "worlds".

import { act, actInPlace, currentActor, draftOptions, score, viewFor } from './engine.js?v=f9072509';
import { aiAction, safeAction, holdProbs } from './ai.js?v=f9072509';
import { makeDeck } from './data.js?v=f9072509';

const ALL = makeDeck();
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
  s.seed = (Math.random() * 2 ** 31) | 0;
  const known = new Set();
  const mark = cards => cards.forEach(c => !c.hidden && known.add(c.uid));
  s.players.forEach(p => { mark(p.city); if (p.id === me) mark(p.hand); });
  if (s.turn?.pending?.cards) mark(s.turn.pending.cards);
  if (s.turn?.spyPeek?.cards) mark(s.turn.spyPeek.cards);
  if (s.interrupt) known.add(s.interrupt.card.uid);
  const pool = shuffle(ALL.filter(c => !known.has(c.uid)).map(c => ({ ...c })));
  for (const p of s.players) if (p.id !== me) {
    // A Wizard peek is a copy of the target's hand, not a separate card zone.
    // Keep those known cards in that hand so wizTake remains playable.
    const seen = s.turn?.pending?.k === 'wizard' && s.turn.pending.target === p.id
      ? s.turn.pending.cards || [] : s.turn?.spyPeek?.target === p.id ? s.turn.spyPeek.cards : [];
    p.hand = [...structuredClone(seen), ...pool.splice(0, Math.max(0, p.handCount - seen.length))];
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
    const probs = holdProbs(v, mine);
    const open = [...probs.keys()];
    for (const p of shuffle(s.players.filter(q => q.id !== me))) {
      const need = (p.charCount ?? p.chars.length) - p.chars.length;
      for (let k = 0; k < need && open.length; k++)
        p.chars.push(weightedTake(open, c => (probs.get(c)?.get(p.id) ?? 0) + 0.02));
    }
  }
  s.players.forEach(p => { delete p.handCount; delete p.charCount; if (p.id !== me) p.saw = []; });
  delete s.deckCount; delete s.me;
  return s;
}

// Mutate the sampled world in place, but give each policy its own permitted view.
// In particular, simulated opponents cannot see the signed warrant.
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
    let r = a ? actInPlace(s, pid, a) : { error: 1 };
    if (r.error) { r = actInPlace(s, pid, safeAction(policyView, pid)); if (r.error) break; }
  }
  return s;
}

// Position value: points banked, plus resources that turn into points soon.
function standing(s, p) {
  const left = s.cfg.goal - p.city.length;
  return score(s, p).total + p.gold * 0.5 + Math.min(p.hand.length, left) * 0.45 + (s.crown === p.id ? 0.6 : 0);
}
function outcome(s, me) {
  const mine = standing(s, s.players[me]);
  const rivals = s.players.filter(p => p.id !== me).map(p => standing(s, p));
  const top = Math.max(...rivals), avg = rivals.reduce((a, b) => a + b, 0) / rivals.length;
  return mine - 0.6 * top - 0.4 * avg + (s.phase === 'over' && s.winner === me ? 8 : 0);
}

// Pick the best of `actions` for player `me`. Budget is in rollouts (options × samples).
export function search(v, me, actions, budget = 120) {
  if (actions.length <= 1) return actions[0];
  const samples = Math.max(4, Math.floor(budget / actions.length));
  const total = actions.map(() => 0);
  for (let i = 0; i < samples; i++) {
    const world = determinize(v, me);
    actions.forEach((a, k) => {
      const s1 = act(world, me, a);
      if (s1.error) { total[k] -= 99; return; }
      total[k] += outcome(playOutRound(s1), me);
    });
  }
  // Near-ties are a coin flip, not always the same pick: softmax over the mean outcome.
  const mean = total.map(t => t / samples), top = Math.max(...mean);
  const w = mean.map(m => Math.exp((m - top) / SOFT));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < w.length; k++) if ((r -= w[k]) <= 0) return actions[k];
  return actions[mean.indexOf(top)];
}
