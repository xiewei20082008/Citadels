// Guided first game: a spotlight on the control that matters right now and a short bubble saying what to
// do. Steps advance when the player does the thing (or taps "Got it" for explanations). Steps that don't
// apply this time (nothing affordable, no active power) are skipped as soon as a later step applies.
import { t } from './i18n.js?v=ec8020af';
import { CHAR } from './data.js?v=ec8020af';
import { canPlace, buildCost, countsTowardLimit } from './engine.js?v=ec8020af';

const KEY = 'c3d.tut';
const ACTIVE_POWER = ['assassin', 'thief', 'magician', 'warlord', 'wizard', 'seer', 'navigator', 'scholar'];

const myTurn = v => v.phase === 'turns' && v.turn?.pid === v.me && !v.interrupt;
const drafting = v => v.phase === 'draft' && v.draft.order[v.draft.idx] === v.me;
const canBuild = v => {
  const me = v.players[v.me], T = v.turn;
  return me.hand.some(c => canPlace(me, c) && buildCost(me, c) <= me.gold && (!countsTowardLimit(T.charId, c) || T.built < T.max));
};

// target: what to spotlight (null = centred explanation); done: the action that completes the step
const STEPS = [
  { id: 'welcome', when: v => v.phase === 'draft' && v.round === 1, target: null },
  { id: 'draft', when: drafting, target: '.sheet .ccards.draft', done: v => !drafting(v), at: 'top' }, // keep the confirm button visible
  { id: 'track', when: v => v.phase === 'turns' && !myTurn(v), target: '.calltrack' },
  { id: 'income', when: v => myTurn(v) && !v.turn.income && !v.turn.pending, target: '.actions', done: v => !myTurn(v) || v.turn.income },
  { id: 'build', when: v => myTurn(v) && v.turn.income && !v.turn.pending && canBuild(v), target: '.dock-row', done: v => !myTurn(v) || v.turn.built > 0 },
  { id: 'ability', when: v => myTurn(v) && v.turn.income && !v.turn.used.ability && ACTIVE_POWER.includes(CHAR[v.turn.charId].key), target: '.actions .btn.ability' },
  { id: 'end', when: v => myTurn(v) && v.turn.income && !v.turn.pending && !canBuild(v), target: '.actions [data-a="end"]', done: v => !myTurn(v) },
  // after my first turn: others are acting — point at the round feed
  { id: 'feed', when: v => v.phase === 'turns' && !myTurn(v) && state.hadTurn, target: '.round-chip' },
  { id: 'score', when: v => v.round >= 2 && state.hadTurn && v.phase === 'turns' && !myTurn(v), target: '.me-panel' }, // while watching, not over a dialog
  { id: 'finish', when: () => state.done.includes('score'), target: null },
];

let state = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
let el = null, ring = null, current = null, lastView = null, raf = 0;

export const tutorialActive = () => !!state.active;
export const tutorialSeen = () => !!state.seen;
export function startTutorial() { state = { active: true, seen: true, done: [] }; save(); }
export function stopTutorial() { state.active = false; save(); hide(); }

function mount() {
  if (el) return;
  ring = document.createElement('div'); ring.className = 'tut-ring';
  el = document.createElement('div'); el.className = 'tut-bubble'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite');
  document.body.append(ring, el);
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-tut]')?.dataset.tut;
    if (a === 'next' && current) { state.done.push(current.id); save(); if (current.id === 'finish') return stopTutorial(); update(lastView); }
    if (a === 'skip') stopTutorial();
  });
}
function hide() {
  current = null;
  cancelAnimationFrame(raf);
  el?.classList.remove('on'); ring?.classList.remove('on');
}

// Called by the HUD after every render (and when sheets open/close).
export function update(v) {
  lastView = v;
  if (!state.active || !v || v.phase === 'over') return hide();
  if (myTurn(v)) state.hadTurn = true;
  if (current?.done?.(v) && !state.done.includes(current.id)) { state.done.push(current.id); save(); }
  const i = STEPS.findIndex(s => !state.done.includes(s.id) && s.when(v));
  if (i < 0) return hide();
  // anything earlier that never applied is skipped, so the tour keeps moving
  STEPS.slice(0, i).forEach(s => { if (!state.done.includes(s.id)) state.done.push(s.id); });
  save();
  const step = STEPS[i];
  if (step !== current) {
    current = step;
    mount();
    const info = !step.done;
    el.innerHTML = `<p>${t('tut.' + step.id)}</p><div class="tut-foot">
      <button class="btn small ghost" data-tut="skip">${t('tut.skip')}</button>
      ${info ? `<button class="btn small primary" data-tut="next">${t(step.id === 'finish' ? 'tut.done' : 'tut.next')}</button>` : `<span class="tut-do">${t('tut.yourMove')}</span>`}</div>`;
    el.classList.add('on');
  }
  cancelAnimationFrame(raf);
  place();
}

// Follow the target every frame (cards deal in, sheets slide, the dock resizes).
function place() {
  if (!current || !el) return;
  const target = current.target && document.querySelector(current.target);
  const r = target?.getBoundingClientRect();
  const W = innerWidth, H = innerHeight, bw = Math.min(360, W - 24), bh = el.offsetHeight;
  if (r && r.width) {
    const pad = 6;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    ring.classList.add('on');
    const below = r.bottom + 14 + bh < H - 8, above = r.top - 14 - bh > 8;
    const y = current.at === 'top' ? 12 : below && r.top < H / 2 ? r.bottom + 14 : above ? r.top - 14 - bh : below ? r.bottom + 14 : Math.max(8, (H - bh) / 2);
    const x = Math.max(12, Math.min(W - bw - 12, r.left + r.width / 2 - bw / 2));
    Object.assign(el.style, { width: bw + 'px', left: x + 'px', top: y + 'px' });
  } else {
    ring.classList.remove('on');
    Object.assign(el.style, { width: bw + 'px', left: (W - bw) / 2 + 'px', top: Math.max(12, (H - bh) / 2) + 'px' });
  }
  raf = requestAnimationFrame(place);
}
