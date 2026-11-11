// Event-driven 2D miniature board. Art is baked from the original models into
// assets/districts; no WebGL, camera, post-processing or animation loop.
// This module only receives each player's permitted view.
import { HUE, SEAT_HUES } from './data.js';
import { t, dname } from './i18n.js';

export function createScene(root, hooks = {}) {
  const seats = new Map(), timers = new Set();
  let view = null, focusPid = null, calm = false;
  let targetUids = [], targetColor = '#ff5a4a';
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  function layout() {
    const n = focusPid === null ? seats.size : 1;
    const w = root.clientWidth, h = root.clientHeight;
    const cols = n <= 1 ? 1 : w < 600 ? 2 : w / Math.max(1, h) > 1.7 ? Math.min(4, n) : Math.min(3, n);
    root.style.setProperty('--board-cols', cols);
    root.style.setProperty('--board-rows', Math.ceil(n / cols) || 1);
    root.classList.toggle('focused', focusPid !== null);
    for (const [pid, s] of seats) s.el.hidden = focusPid !== null && pid !== focusPid;
  }

  function makeSeat(pid) {
    const el = document.createElement('section');
    el.className = 'board-city'; el.dataset.pid = pid;
    el.style.setProperty('--seat', SEAT_HUES[pid % SEAT_HUES.length]);
    const head = document.createElement('div'); head.className = 'board-head';
    const plots = document.createElement('div'); plots.className = 'board-plots';
    el.append(head, plots); root.append(el);
    const seat = { el, head, plots, buildings: new Map() };
    seats.set(pid, seat);
    return seat;
  }

  function sync(v, animate = true) {
    view = v;
    const wanted = new Set(v.players.map(p => p.id));
    for (const [pid, s] of seats) if (!wanted.has(pid)) { s.el.remove(); seats.delete(pid); }
    if (!wanted.has(focusPid)) focusPid = null;
    const actor = v.interrupt?.pid ?? (v.phase === 'turns' ? v.turn?.pid : v.phase === 'draft' ? v.draft.order[v.draft.idx] : null);
    const players = [...v.players].sort((a, b) => (a.id !== v.me) - (b.id !== v.me) || a.id - b.id);
    for (const p of players) {
      const s = seats.get(p.id) || makeSeat(p.id);
      root.append(s.el);
      s.el.classList.toggle('active', actor === p.id);
      s.el.classList.toggle('own', p.id === v.me);
      s.el.classList.toggle('winner', v.phase === 'over' && v.winner === p.id);
      s.el.setAttribute('aria-label', `${p.name} · ${t('ui.city')}`);
      const want = new Set(p.city.map(c => c.uid));
      for (const [uid, el] of s.buildings) if (!want.has(uid)) { el.remove(); s.buildings.delete(uid); }
      s.plots.querySelectorAll('.board-empty').forEach(el => el.remove());
      for (const card of p.city) {
        let el = s.buildings.get(card.uid);
        if (!el) {
          el = document.createElement('button');
          el.type = 'button'; el.className = 'board-building'; el.dataset.uid = card.uid; el.dataset.id = card.id;
          el.style.setProperty('--district', HUE[card.color]);
          const img = document.createElement('img');
          img.src = new URL(`../assets/districts/${card.id}.webp`, import.meta.url).href;
          img.alt = ''; img.draggable = false; img.decoding = 'async';
          const name = document.createElement('span'); name.className = 'board-building-name';
          el.append(img, name); s.buildings.set(card.uid, el);
          if (animate && !calm) {
            el.classList.add('built'); later(() => el.classList.remove('built'), 450);
          }
        }
        el.title = dname(card); el.setAttribute('aria-label', `${dname(card)} · ${card.cost}`);
        el.querySelector('span').textContent = dname(card);
        s.plots.append(el);
      }
      const capacity = Math.max(v.cfg.goal, p.city.length);
      s.plots.style.setProperty('--plot-cols', Math.ceil(capacity / 2));
      for (let i = p.city.length; i < capacity; i++) {
        const el = document.createElement('span'); el.className = 'board-empty';
        el.setAttribute('aria-hidden', 'true'); s.plots.append(el);
      }
    }
    root.classList.toggle('showcase', v.phase === 'idle');
    highlight(targetUids, targetColor);
    layout();
  }

  function highlight(uids, color = '#ff5a4a') {
    targetUids = uids;
    targetColor = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
    const targets = new Set(uids);
    for (const s of seats.values()) for (const [uid, el] of s.buildings) {
      el.classList.toggle('target', targets.has(uid));
      el.style.setProperty('--target', targetColor);
    }
  }

  function pick(el) {
    const city = el?.closest('.board-city');
    if (!city || !view) return null;
    const pid = +city.dataset.pid, building = el.closest('.board-building');
    const card = building ? view.players.find(p => p.id === pid)?.city.find(c => c.uid === building.dataset.uid) : null;
    const charId = +el.closest('[data-char]')?.dataset.char || null;
    return { pid, card: card || null, charId };
  }
  root.addEventListener('click', e => hooks.onPick?.(pick(e.target)));
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const h = pick(e.target);
    hooks.onHover?.(h?.card || h?.charId ? h : null, e.clientX, e.clientY);
  });
  root.addEventListener('pointerout', e => {
    if (!e.target.closest('.board-building')?.contains(e.relatedTarget)) hooks.onHover?.(null);
  });
  root.addEventListener('scroll', () => hooks.onHover?.(null));
  new ResizeObserver(layout).observe(root);

  return {
    sync, highlight,
    attachLabel(pid, el) { seats.get(pid)?.head.append(el); },
    setInsets({ top, bottom }) {
      root.style.setProperty('--board-top', `${top}px`);
      root.style.setProperty('--board-bottom', `${bottom}px`);
    },
    focus(pid) { if (seats.has(pid)) { focusPid = pid; layout(); root.scrollTop = 0; } },
    resetView() { focusPid = null; layout(); },
    get focused() { return focusPid; },
    screenOf(pid, what = 'coins') {
      const s = seats.get(pid);
      if (!s || s.el.hidden) return null;
      const el = what === 'coins' ? s.head.querySelector('.gold') || s.head : what === 'cards' ? s.head : s.plots;
      const r = el.getBoundingClientRect(), b = root.getBoundingClientRect();
      return r.bottom < b.top || r.top > b.bottom ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    fx(e) {
      if (calm) return;
      if (e.k === 'bribe' || e.k === 'threatRevealed') {
        for (const pid of new Set([e.from, e.to])) {
          const seat = seats.get(pid);
          if (!seat) continue;
          seat.el.classList.add('board-flash');
          later(() => seat.el.classList.remove('board-flash'), 650);
        }
        return;
      }
      const s = seats.get(e.pid);
      if (!s) return;
      s.el.classList.add('board-flash');
      later(() => s.el.classList.remove('board-flash'), 650);
    },
    reset() {
      timers.forEach(clearTimeout); timers.clear();
      root.replaceChildren(); seats.clear(); view = null; focusPid = null; targetUids = [];
      root.scrollTop = 0; layout();
    },
    relang() { if (view) sync(view, false); },
    setCalm(v) { calm = v; root.classList.toggle('calm', v); },
  };
}
