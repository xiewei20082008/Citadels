// In-game HUD: top bar, call track, seat labels, hand dock, action buttons, sheets (modals),
// character-call banner, toasts, floating numbers, emotes and the end screen. Pure DOM.

import { CHAR, HUE, DIST, COLORS, SEAT_HUES } from './data.js?v=45d44b46';
import {
  rankOf, has, buildCost, canPlace, destroyCost, shielded, targetRanks, countsTowardLimit, score, colorCount, buildLimit, canConfiscate, seizeError, seizureCost, charsPerPlayer,
} from './engine.js?v=45d44b46';
import { t, cname, cabil, dname, ddesc, RULES, getLang } from './i18n.js?v=45d44b46';
import { svg, ROMAN } from './icons.js?v=45d44b46';
import { sfx } from './sfx.js?v=45d44b46';
import { prefs, alertTurn, vibrate } from './settings.js?v=45d44b46';
import { update as tutorialUpdate, tutorialActive } from './tutorial.js?v=45d44b46';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACTIVE = { tax_collector: 'tax', marshal: 'marshal', spy: 'spy', magistrate: 'warrants', assassin: 'kill', thief: 'rob', magician: 'mag', warlord: 'war', wizard: 'wiz', seer: 'seer', navigator: 'nav', scholar: 'scholar' };
const ABILITY_ICON = { tax: 'tax_collector', marshal: 'marshal', spy: 'spy', warrants: 'magistrate', kill: 'assassin', rob: 'thief', mag: 'magician', war: 'warlord', wiz: 'wizard', seer: 'seer', nav: 'navigator', scholar: 'scholar' };
const ABILITY_OF_ACTION = { collectTax: 'tax', seize: 'marshal', spy: 'spy', warrants: 'warrants', kill: 'kill', rob: 'rob', swap: 'mag', redraw: 'mag', destroy: 'war', peek: 'wiz', seer: 'seer', nav: 'nav', scholar: 'scholar' };
// Colour-blind aid (setting): each district colour also gets a symbol.
const COLOR_SYM = { yellow: 'king', blue: 'bishop', green: 'merchant', red: 'warlord', purple: 'magician' };
const BLOCKING = ['draft', 'discard', 'keep', 'wizPick', 'seerGive', 'grave', 'warrantResponse', 'over'];
const TURN_SHEETS = ['tax', 'marshal', 'spy', 'spyResult', 'warrants', 'kill', 'rob', 'mag', 'war', 'wiz', 'seer', 'nav', 'scholar', 'den', 'lab'];
export const EMOTES = ['👍', '😂', '😮', '😡', '😈', '👑', '🙏', '🎉'];
const seatHue = pid => SEAT_HUES[pid % SEAT_HUES.length];

export function createUI(ctx) {
  const root = $('#hud');
  root.innerHTML = `
    <header class="topbar"></header>
    <div class="labels"></div>
    <div class="floaters"></div>
    <div class="toasts" aria-live="polite"></div>
    <div class="banner"></div>
    <section class="dock">
      <div class="prompt"></div>
      <div class="dock-row">
        <div class="me-panel"></div>
        <div class="hand"></div>
        <div class="actions"></div>
      </div>
    </section>
    <div class="sheet-wrap"><div id="game-sheet" class="sheet" role="dialog" aria-modal="true"></div></div>
    <button class="btn sheet-drawer" data-a="restoreSheet" aria-controls="game-sheet" aria-expanded="false" hidden></button>
    <div class="tip" role="tooltip" aria-hidden="true"></div>`;

  const els = {
    top: $('.topbar', root), labels: $('.labels', root), floaters: $('.floaters', root), toasts: $('.toasts', root),
    banner: $('.banner', root), dock: $('.dock', root), prompt: $('.prompt', root), me: $('.me-panel', root),
    hand: $('.hand', root), actions: $('.actions', root), wrap: $('.sheet-wrap', root), sheet: $('.sheet', root),
    tip: $('.tip', root), drawer: $('.sheet-drawer', root),
  };

  function chrome() {
    els.top.innerHTML = `
      <div class="tb-left"><button class="round-chip" data-a="sheet" data-v="round" title="${t('tl.open')}"></button><span class="tax-pool gold" hidden></span></div>
      <div class="calltrack" aria-label="call order"></div>
      <div class="tb-right">
        <div class="emote-wrap"><button class="icon-btn" data-a="emotes" title="${t('ui.react')}">😀</button>
          <div class="emote-pal">${EMOTES.map(e => `<button data-a="emote" data-v="${e}">${e}</button>`).join('')}</div></div>
        <button class="icon-btn" data-a="overview" title="${t('ui.resetView')}">${svg('focus')}</button>
        <button class="icon-btn" data-a="sheet" data-v="log" title="${t('ui.log')}">${svg('log')}</button>
        <button class="icon-btn" data-a="sheet" data-v="rules" title="${t('ui.rules')}">${svg('help')}</button>
        <button class="icon-btn" data-a="settings" title="${t('set.title')}">${svg('gear')}</button>
      </div>`;
    els.round = $('.round-chip', els.top);
    els.track = $('.calltrack', els.top);
  }
  chrome();

  // local (non-game) UI state
  const L = { drawers: [], sel: null, sheet: null, multi: new Set(), inspect: null, log: [], view: null, labelEls: new Map(), hint: null, shown: null };

  const insets = () => ctx.scene.setInsets({ top: els.top.offsetHeight + 8, bottom: els.dock.offsetHeight + 8 });
  const hudSize = new ResizeObserver(insets);
  hudSize.observe(els.top); hudSize.observe(els.dock);

  // ── helpers ──
  const P = pid => L.view.players[pid];
  const thumb = id => ctx.thumbs[id] ? `style="background-image:url(${ctx.thumbs[id]})"` : '';
  const avatar = p => `<span class="av">${esc(p?.avatar || '◆')}</span>`;
  const pname = pid => (pid === L.view.me ? t('ui.you') : esc(P(pid)?.name ?? '?'));
  const realName = pid => esc(P(pid)?.name ?? '?');
  const shownScore = (v, p) => score(v, p).total - (p.id !== v.me && has(p, 'secret_vault') && v.phase !== 'over' ? 3 : 0);
  const sortHand = hand => [...hand].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.cost - b.cost || a.id.localeCompare(b.id));
  const actorOf = v => v.interrupt ? v.interrupt.pid : v.phase === 'draft' ? v.draft.order[v.draft.idx] : v.phase === 'turns' ? v.turn?.pid : null;

  function cardHTML(card, { cls = '', costShown, attrs = '' } = {}) {
    if (card.hidden) return `<div class="card back ${cls}"></div>`;
    const cost = costShown ?? card.cost;
    return `<button class="card c-${card.color} ${cls}" data-uid="${card.uid}" data-id="${card.id}" ${attrs}>
      <span class="card-art" ${thumb(card.id)}></span>
      <span class="card-cost${cost < card.cost ? ' disc' : ''}">${cost}</span>
      ${card.color === 'purple' ? '<span class="card-gem">✦</span>' : ''}<span class="card-sym">${svg(COLOR_SYM[card.color])}</span>
      <span class="card-name${/^[^\u3040-\u9fff\uac00-\ud7af]{9,}$/.test(dname(card)) ? ' long' : ''}">${esc(dname(card))}</span></button>`;
  }
  function charHTML(id, { cls = '', attrs = '', sub = '', you = null } = {}) {
    const c = CHAR[id];
    return `<button class="ccard ${cls}" style="--cc:${c.color}" data-char="${id}" ${attrs}>
      <span class="cc-rank">${ROMAN[c.rank]}</span>
      <span class="cc-emb">${svg(c.key, 'emb')}</span>
      <span class="cc-txt"><span class="cc-name">${esc(cname(id))}</span>
      <span class="cc-ab">${esc(sub || cabil(id))}</span>
      ${you?.length ? `<span class="cc-you">${you.map(esc).join(' · ')}</span>` : ''}</span></button>`;
  }
  const chip = (id, extra = '') => `<span class="chip" style="--cc:${CHAR[id].color}" data-char="${id}" ${extra}>${svg(CHAR[id].key)}<b>${ROMAN[CHAR[id].rank]}</b></span>`;
  const namedChip = id => `<span class="chip named" style="--cc:${CHAR[id].color}" data-char="${id}">${svg(CHAR[id].key)}<b>${ROMAN[CHAR[id].rank]}</b>${esc(cname(id))}</span>`;

  // What a character would mean for me right now — turns the rules text into numbers.
  function forYou(id, v = L.view) {
    const me = v.players[v.me], c = CHAR[id], rivals = v.players.filter(p => p.id !== v.me);
    const top = f => rivals.reduce((b, p) => (f(p) > f(b) ? p : b));
    const out = [];
    if (c.income) out.push(t('fy.gold', { n: colorCount(me, c.income) + (c.key === 'merchant' ? 1 : 0) }));
    if (c.crown) out.push(t('fy.crown'));
    switch (c.key) {
      case 'patrician': out.push(t('fy.cards', { n: colorCount(me, 'yellow') })); break;
      case 'architect': out.push(t('fy.cards', { n: 2 })); break;
      case 'navigator': out.push(`${t('fy.gold', { n: 4 })} / ${t('fy.cards', { n: 4 })}`); break;
      case 'queen': out.push(t('fy.queen')); break;
      case 'tax_collector': out.push(t('ui.taxPool', { n: v.taxPool })); break;
      case 'marshal': {
        const costs = rivals.flatMap(p => p.city.filter(c => !seizeError(v, me, p, c)).map(seizureCost));
        if (costs.length) out.push(t('fy.target', { n: Math.min(...costs) }));
        break;
      }
      case 'bishop': if (me.city.length) out.push(t('fy.shield', { n: me.city.length })); break;
      case 'assassin': { const l = top(p => shownScore(v, p)); out.push(t('fy.leader', { name: P(l.id).name, n: shownScore(v, l) })); break; }
      case 'thief': { const r = top(p => p.gold); out.push(t('fy.richest', { name: P(r.id).name, n: r.gold })); break; }
      case 'magician': out.push(t('fy.hands', { a: me.hand.length, b: top(p => p.handCount).handCount })); break;
      case 'wizard': { const h = top(p => p.handCount); out.push(t('fy.peek', { name: P(h.id).name, n: h.handCount })); break; }
      case 'warlord': {
        const costs = rivals.filter(p => p.city.length < v.cfg.goal).flatMap(p => p.city.filter(d => d.id !== 'keep').map(d => destroyCost(p, d)));
        if (costs.length) out.push(t('fy.target', { n: Math.min(...costs) }));
        break;
      }
    }
    const lim = buildLimit(id);
    out.push(lim ? t('fy.build', { n: lim }) : t('fy.noBuild'));
    return out;
  }
  // My resources at a glance (draft sheet): gold, hand, city and how many districts of each colour.
  const meStrip = (v, me) => `<div class="me-strip"><span class="st gold">${svg('gold')}<b>${me.gold}</b></span>
    <span class="st">${svg('card')}<b>${me.hand.length}</b></span><span class="st">${svg('build')}<b>${me.city.length}/${v.cfg.goal}</b></span>
    <span class="cdots">${COLORS.map(c => `<span class="cdot" style="--k:${HUE[c]}" title="${t('col.' + c)}"><i></i>${me.city.filter(d => d.color === c).length}</span>`).join('')}</span></div>`;
  const rankChar = r => L.view.cfg.chars.find(c => rankOf(c) === r);

  // ── event text (log + toasts) ──
  function evText(e) {
    const n = pid => (pid === null || pid === undefined ? '' : realName(pid));
    switch (e.k) {
      case 'start': return t('l.start');
      case 'round': return t('l.round', { n: e.n, name: n(e.crown) });
      case 'pick': return t('l.pick', { name: n(e.pid) });
      case 'discard': return t('l.discard', { name: n(e.pid) });
      case 'call':
        if (e.pid === null) return t('l.callNone', { char: cname(e.charId) });
        if (e.killed) return t('l.callKilled', { char: cname(e.charId), name: n(e.pid) });
        return t('l.call', { char: cname(e.charId), name: n(e.pid) });
      case 'robbed': return t('l.robbed', { to: n(e.to), from: n(e.from), n: e.n });
      case 'crown': return t(e.heir ? 'l.heir' : 'l.crown', { name: n(e.pid) });
      case 'gold': return t('l.gold', { name: n(e.pid), n: e.n });
      case 'cards': return t('l.cards', { name: n(e.pid), n: e.n });
      case 'tithe': return t('l.tithe', { from: n(e.from) });
      case 'draw': return t('l.draw', { name: n(e.pid), n: e.n });
      case 'build': return t('l.build', { name: n(e.pid), dist: dname(e.card) });
      case 'tax': return t('l.tax', { name: n(e.pid), n: e.n, pool: e.pool });
      case 'collectTax': return t('l.collectTax', { name: n(e.pid), n: e.n });
      case 'seize': return t('l.seize', { name: n(e.pid), target: n(e.target), dist: dname(e.card), n: e.cost });
      case 'complete': return t('l.complete', { name: n(e.pid) });
      case 'kill': return t('l.kill', { char: cname(rankChar(e.rank)) });
      case 'rob': return t('l.rob', { char: cname(rankChar(e.rank)) });
      case 'swap': return t('l.swap', { name: n(e.pid), target: n(e.target) });
      case 'redraw': return t('l.redraw', { name: n(e.pid), n: e.n });
      case 'destroy': return t('l.destroy', { name: n(e.pid), target: n(e.target), dist: dname(e.card) });
      case 'graveyard': return t('l.graveyard', { name: n(e.pid), dist: dname(e.card) });
      case 'warrants': return t('l.warrants', { name: n(e.pid), chars: e.targets.map(cname).join(', ') });
      case 'confiscate': return t('l.confiscate', { name: n(e.pid), target: n(e.target), dist: dname(e.card), n: e.refund });
      case 'peek': return t('l.peek', { name: n(e.pid), target: n(e.target) });
      case 'spy': return t('l.spy', { name: n(e.pid), target: n(e.target), color: t('col.' + e.color), gold: e.gold, n: e.n });
      case 'wizTake': return t('l.wizTake', { name: n(e.pid), target: n(e.target) });
      case 'seer': return t('l.seer', { name: n(e.pid), n: e.n });
      case 'seerGive': return t('l.seerGive', { name: n(e.pid), n: e.n });
      case 'over': return t('l.over', { name: n(e.winner) });
    }
    return null;
  }

  function toast(text, tone = '', ms = 2800) {
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.innerHTML = text;
    els.toasts.prepend(el);
    while (els.toasts.children.length > 4) els.toasts.lastChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }
  // First-time guidance: each tip shows once per device.
  function coach(key) {
    if (!prefs.tips || tutorialActive()) return; // the tutorial does the explaining
    try {
      if (localStorage.getItem('c3d.coach.' + key)) return;
      localStorage.setItem('c3d.coach.' + key, '1');
    } catch { return; }
    toast(`💡 ${t('coach.' + key)}`, 'coach', 7000);
  }

  // Numbers that rise from coins / cards / plots on the board.
  function floater(pid, where, text, tone = '') {
    const p = ctx.scene.screenOf(pid, where);
    if (!p || p.behind || document.hidden) return;
    const el = document.createElement('div');
    el.className = 'floater ' + tone;
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    els.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function showEmote(pid, e) {
    if (!EMOTES.includes(e) || !L.view) return;
    const anchor = pid === L.view.me ? els.me : L.labelEls.get(pid);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'emote';
    el.textContent = e;
    el.style.left = r.left + r.width / 2 + 'px';
    el.style.top = r.top + 'px';
    els.floaters.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function banner(e) {
    let html;
    if (e.k === 'complete') {
      html = `<div class="bn final"><div class="bn-emb">${svg('trophy', 'emb')}</div>
        <div class="bn-txt"><div class="bn-rank">${t('ui.finalSub', { name: realName(e.pid) })}</div><div class="bn-name">${t('ui.finalRound')}</div></div></div>`;
    } else {
      const c = CHAR[e.charId];
      const sub = e.pid === null ? t('ui.calledNobody') : e.killed ? `${pname(e.pid)} · ${t('ui.calledSlain')}` : pname(e.pid);
      html = `<div class="bn ${e.pid === null ? 'none' : ''} ${e.killed ? 'slain' : ''}" style="--cc:${c.color}">
        <div class="bn-emb">${svg(c.key, 'emb')}</div>
        <div class="bn-txt"><div class="bn-rank">${ROMAN[c.rank]}</div><div class="bn-name">${esc(cname(e.charId))}</div>
        <div class="bn-sub">${e.pid !== null && !e.killed ? avatar(P(e.pid)) : ''}${sub}</div>
        <div class="bn-ab">${esc(cabil(e.charId))}</div></div></div>`;
    }
    els.banner.innerHTML = html;
    els.banner.classList.remove('show');
    void els.banner.offsetWidth;
    els.banner.classList.add('show');
  }

  // Called by the controller for every new event, in order. Returns ms to let it breathe.
  function event(e, view) {
    L.view = view;
    L.evShown = e.id;
    const txt = evText(e);
    if (txt && e.k !== 'gold' && e.k !== 'cards') L.log.push({ id: e.id, k: e.k, txt });
    if (L.log.length > 300) L.log.splice(0, L.log.length - 300);
    if (L.sheet === 'log' || L.sheet === 'round') renderSheet();
    if (e.k !== 'pick' && e.k !== 'discard') feedLine();
    const mine = e.pid === view.me;
    switch (e.k) {
      case 'call':
        L.shown = { round: view.round, call: e.rank };
        renderTrack(view);
        banner(e);
        sfx(e.killed ? 'kill' : 'call');
        if (mine && !e.killed) setTimeout(() => sfx('turn'), 500);
        return e.pid === null ? 750 : e.killed ? 1200 : 1350;
      case 'round': toast(`<b>${t('ui.round', { n: e.n })}</b>`, 'gold'); return 900;
      case 'pick': case 'discard': return 220;
      case 'gold': sfx('coin', e.n); floater(e.pid, 'coins', `+${e.n}`, 'gold'); return 420;
      case 'cards': case 'draw': sfx('card', e.n); floater(e.pid, 'cards', `+${e.n}`, 'card'); return 420;
      case 'build': sfx('build'); floater(e.pid, 'plot', `+${e.card.cost}★`, 'pts'); if (!mine) toast(txt, 'c-' + e.card.color); return 750;
      case 'tax': sfx('coin', e.n); floater(e.pid, 'coins', `−${e.n}`, 'loss'); toast(txt); return 420;
      case 'collectTax': sfx('coin', e.n); floater(e.pid, 'coins', `+${e.n}`, 'gold'); toast(txt, 'gold'); return 650;
      case 'seize': sfx('card', 1); floater(e.pid, 'coins', `−${e.cost}`, 'loss'); floater(e.target, 'coins', `+${e.cost}`, 'gold'); floater(e.pid, 'plot', `+${e.card.cost}★`, 'pts'); floater(e.target, 'plot', `−${e.card.cost}★`, 'loss'); toast(txt); return 1000;
      case 'destroy': sfx('destroy'); floater(e.pid, 'coins', `−${e.cost}`, 'loss'); floater(e.target, 'plot', `−${e.card.cost}★`, 'loss'); toast(txt, 'danger'); return 1000;
      case 'robbed': sfx('coin', 4); floater(e.from, 'coins', `−${e.n}`, 'loss'); floater(e.to, 'coins', `+${e.n}`, 'gold'); toast(txt, 'danger'); return 900;
      case 'tithe': floater(e.from, 'coins', '−1', 'loss'); floater(e.to, 'coins', '+1', 'gold'); sfx('coin', 1); toast(txt); return 600;
      case 'kill': case 'rob': {
        const mineHit = e.pid !== view.me && view.players[view.me]?.chars.some(c => rankOf(c) === e.rank);
        if (e.k === 'kill') sfx('kill');
        if (mineHit) { toast(`<b>${t(e.k === 'kill' ? 'me.killed' : 'me.robbed', { char: cname(rankChar(e.rank)) })}</b>`, 'danger', 6000); vibrate(200); }
        else toast(txt, e.k === 'kill' ? 'danger' : '');
        return mineHit ? 1400 : e.k === 'kill' ? 700 : 600;
      }
      case 'crown': sfx('crown'); toast(txt, 'gold'); return 700;
      case 'complete': sfx('win'); banner(e); toast(`<b>${txt}</b>`, 'gold'); return 2000;
      case 'spy': case 'warrants': case 'confiscate': case 'swap': case 'wizTake': case 'graveyard': case 'seer': case 'peek': case 'seerGive': case 'redraw': sfx('card', 2); toast(txt); return 700;
      case 'over': sfx('win'); return 600;
    }
    return 300;
  }

  // ── round feed: who did what this round, grouped by character call ──
  function roundFeed(v) {
    const seen = v.ev.filter(e => e.id <= (L.evShown ?? Infinity));
    const from = seen.findLastIndex(e => e.k === 'round');
    const calls = [];
    for (const e of seen.slice(from + 1)) {
      if (e.k === 'call') { calls.push({ e, items: [] }); continue; }
      const cur = calls.at(-1);
      if (!cur || e.k === 'end') continue;
      const self = e.pid === cur.e.pid;
      const line = e.k === 'gold' && self ? t('fy.gold', { n: e.n }) : e.k === 'cards' && self ? t('fy.cards', { n: e.n }) : evText(e);
      if (line) cur.items.push({ k: e.k, line });
    }
    return calls;
  }
  // under "X is thinking…": what the current character has done so far
  function feedLine() {
    const el = els.prompt.querySelector('.feed-last');
    if (!el || !L.view) return;
    const cur = roundFeed(L.view).at(-1);
    // the animation trails the state, so follow the last character shown rather than view.turn
    el.innerHTML = cur && cur.e.pid !== null && cur.e.pid !== L.view.me && cur.items.length ? cur.items.slice(-2).map(x => `<span>${x.line}</span>`).join('') : '';
  }

  // ── render ──
  function render(view) {
    const prevMe = L.view?.me;
    L.view = view;
    const me = view.players[view.me];
    const T = view.turn;
    const myTurn = view.phase === 'turns' && T?.pid === view.me && !view.interrupt;
    const draftMine = view.phase === 'draft' && view.draft.order[view.draft.idx] === view.me;
    // Hidden decisions survive view refreshes, but never a new decision or seat.
    const decisionKey = JSON.stringify([view.me, view.round, view.phase, view.draft?.idx,
      view.draft?.mustDiscard, T?.pid, T?.charId, T?.pending?.k, view.interrupt?.pid, view.interrupt?.card?.uid]);
    if (decisionKey !== L.decisionKey) { L.decisionKey = decisionKey; L.drawers = []; }
    // a new turn (incl. my second character straight after my first) closes the last turn's tools
    const turnKey = myTurn ? view.round + ':' + T.charId : null, wasWar = ['war', 'marshal'].includes(L.sheet);
    if (turnKey !== L.turnKey) { L.turnKey = turnKey; L.sel = null; L.endArmed = false; L.targetSel = null; L.warSel = null; L.warrantTargets = []; L.spyTarget = null; L.spyColor = null; if (TURN_SHEETS.includes(L.sheet)) L.sheet = null; if (turnKey) alertTurn(); }
    const draftKey = draftMine ? view.round + ':' + view.draft.idx : null;
    if (draftKey !== L.draftKey) { L.draftKey = draftKey; L.draftSel = null; if (draftKey) alertTurn(); }
    if (myTurn && ABILITY_ICON[L.sheet] && L.sheet !== abilityKey(view)) L.sheet = null; // ability already spent
    if (wasWar && !['war', 'marshal'].includes(L.sheet)) ctx.scene.highlight([]);
    if (prevMe !== view.me) { L.labelEls.forEach(el => el.remove()); L.labelEls.clear(); }
    if (L.hint && L.hint.seq !== view.evSeq) L.hint = null;
    if (me && L.sel && !me.hand.some(c => c.uid === L.sel)) L.sel = null;

    els.round.innerHTML = `<span class="rc-n">${t('ui.round', { n: view.round })}</span><span class="rc-p">${t('ui.' + (view.phase === 'idle' ? 'turns' : view.phase))}</span>`;
    const pool = $('.tax-pool', els.top);
    pool.hidden = !view.cfg.chars.includes(19);
    pool.innerHTML = `${svg('tax_collector')}<span>${t('ui.taxPool', { n: view.taxPool })}</span>`;
    renderTrack(view);
    renderLabels(view);

    if (me) {
      const curChar = myTurn ? T.charId : null;
      els.me.style.setProperty('--seat', seatHue(me.id));
      els.me.innerHTML = `
        <div class="mp-id">${avatar(me)}<span class="mp-name">${esc(me.name)}</span>${view.crown === me.id ? `<span class="crown-ico" title="Crown">${svg('crown')}</span>` : ''}</div>
        <div class="mp-stats"><span class="st gold" title="${t('ui.gold')}">${svg('gold')}<b>${me.gold}</b></span>
          <span class="st" title="${t('ui.city')}">${svg('build')}<b>${me.city.length}/${view.cfg.goal}</b></span>
          <span class="st" title="${t('ui.projected')}">★<b>${shownScore(view, me)}</b></span></div>
        <div class="mp-chars">${me.chars.map(c => chip(c, curChar === c ? 'data-on="1"' : view.killed === rankOf(c) && view.revealed.includes(c) ? 'data-dead="1"' : '')).join('')}</div>`;
    }

    renderHand(view, me, myTurn);
    renderActions(view, me, myTurn, draftMine);
    renderPrompt(view, myTurn, draftMine);
    if (L.evShown === undefined) L.evShown = view.ev.at(-1)?.id ?? 0; // resumed mid-game: history so far counts as seen
    feedLine();

    // decisions that can't wait open themselves
    const pend = myTurn ? T.pending : null;
    const auto = view.interrupt?.pid === view.me ? (view.interrupt.k === 'warrant' ? 'warrantResponse' : 'grave')
      : draftMine ? (view.draft.mustDiscard ? 'discard' : 'draft')
      : pend?.k === 'keep' ? 'keep' : pend?.k === 'wizard' ? 'wizPick' : pend?.k === 'seerGive' ? 'seerGive' : null;
    if (auto && L.sheet !== auto && !L.drawers.some(d => d.sheet === auto)) { L.sheet = auto; L.multi.clear(); }
    else if (!auto && BLOCKING.includes(L.sheet) && L.sheet !== 'over') L.sheet = null;
    const spyKey = myTurn && T.spyPeek ? `${view.me}:${view.round}:${T.charId}` : null;
    if (spyKey && L.spySeen !== spyKey) { L.spySeen = spyKey; L.sheet = 'spyResult'; }
    if (draftMine) coach('draft');
    if (myTurn) coach('turn');
    if (view.phase === 'turns' && view.round === 1 && !myTurn) coach('call');
    if (view.round === 2) coach('cam');
    if (view.phase === 'over' && !L.overShown) { L.overShown = true; setTimeout(() => { if (L.view?.phase === 'over') { L.sheet = 'over'; renderSheet(); } }, 2200); }
    if (view.phase !== 'over') L.overShown = false;
    renderSheet();
    ctx.scene.highlight(L.sheet === 'war' ? warTargets(view).filter(x => x.ok).map(x => x.card.uid) : []);
    insets();
    tutorialUpdate(view);
  }

  function renderTrack(view) {
    const ids = [...view.cfg.chars].sort((a, b) => rankOf(a) - rankOf(b));
    const up = view.draft?.faceUp || [];
    const call = L.shown?.round === view.round ? L.shown.call : view.call; // follows the banner, not the state
    els.track.innerHTML = ids.map(id => {
      const r = rankOf(id);
      const revealed = view.revealed.find(c => rankOf(c) === r);
      const holder = revealed ? view.players.find(p => p.chars.includes(revealed)) : null;
      const cls = [
        up.includes(id) ? 'up' : '',
        view.phase === 'turns' && call === r ? 'now' : '',
        view.phase === 'turns' && call > r ? 'past' : '',
        view.killed === r ? 'killed' : '',
        view.robbed === r ? 'robbed' : '',
      ].join(' ');
      const shown = revealed || id;
      return `<span class="tk ${cls}" style="--cc:${CHAR[shown].color}" data-char="${shown}">
        <span class="tk-emb">${svg(CHAR[shown].key)}</span><span class="tk-r">${ROMAN[r]}</span>
        ${view.killed === r ? `<span class="tk-mark k">${svg('skull')}</span>` : view.robbed === r ? `<span class="tk-mark r">${svg('thief')}</span>` : ''}
        ${view.warrants?.targets.includes(id) ? `<span class="warrant-mark ${view.warrants.signed === id ? 'signed' : ''}" title="${esc(t(view.warrants.signed === id ? 'ui.signedWarrant' : 'ui.warrant'))}">${view.warrants.signed === id ? '✍' : '◇'}</span>` : ''}
        ${holder ? `<span class="tk-who">${esc(holder.avatar || '·')}</span>` : ''}</span>`;
    }).join('');
  }

  function renderLabels(view) {
    const actor = actorOf(view);
    const seen = new Set();
    for (const p of view.players) {
      if (p.id === view.me && !ctx.scene.attachLabel) continue;
      seen.add(p.id);
      let el = L.labelEls.get(p.id);
      if (!el) {
        el = document.createElement('button');
        el.className = 'seat';
        el.dataset.a = 'inspect';
        el.dataset.v = p.id;
        el.style.setProperty('--seat', seatHue(p.id));
        els.labels.appendChild(el);
        L.labelEls.set(p.id, el);
      }
      ctx.scene.attachLabel?.(p.id, el);
      const live = view.phase !== 'over' && view.phase !== 'idle';
      el.classList.toggle('active', actor === p.id && live);
      el.classList.toggle('winner', view.phase === 'over' && view.winner === p.id);
      el.classList.toggle('done', p.city.length >= view.cfg.goal);
      el.innerHTML = `<div class="s-top">${avatar(p)}<span class="s-name">${esc(p.name)}</span>${view.crown === p.id ? `<span class="crown-ico">${svg('crown')}</span>` : ''}${p.ai && ctx.mode() !== 'solo' ? '<span class="tag ai">AI</span>' : ''}${actor === p.id && live ? '<span class="dots"><i></i><i></i><i></i></span>' : ''}</div>
        <div class="s-stats"><span class="st gold">${svg('gold')}<b>${p.gold}</b></span><span class="st">${svg('card')}<b>${p.handCount}</b></span><span class="st">${svg('build')}<b>${p.city.length}</b></span><span class="st">★<b>${shownScore(view, p)}</b></span></div>
        ${p.chars.length || p.charCount ? `<div class="s-chars">${p.chars.map(c => chip(c, view.killed === rankOf(c) ? 'data-dead="1"' : '')).join('')}${'<span class="chip hid">?</span>'.repeat(Math.max(0, p.charCount - p.chars.length))}</div>` : ''}`;
    }
    for (const [pid, el] of L.labelEls) if (!seen.has(pid)) { el.remove(); L.labelEls.delete(pid); }
  }

  // Labels live in each city header. Only the turn countdown needs a tick.
  function frame() {
    const tm = els.prompt.querySelector('.timer');
    if (tm) {
      const left = Math.max(0, Math.ceil((+tm.dataset.at - Date.now()) / 1000));
      if (tm.textContent !== left + 's') { tm.textContent = left + 's'; tm.classList.toggle('low', left <= 10); }
    }
  }

  function buildState(view, me, card) {
    const T = view.turn;
    if (!T || T.pid !== view.me) return null;
    if (!T.income) return t('ui.incomeFirst');
    if (countsTowardLimit(T.charId, card) && T.built >= T.max) return T.max === 0 ? t('ui.noBuild') : t('ui.limit');
    if (!canPlace(me, card)) return t('ui.dup');
    const cost = buildCost(me, card);
    if (cost > me.gold && !(card.id === 'thieves_den' && cost <= me.gold + me.hand.length - 1)) return t('ui.tooPoor');
    return 'ok';
  }

  function renderHand(view, me, myTurn) {
    if (!me) { els.hand.innerHTML = ''; return; }
    const hand = sortHand(me.hand), n = hand.length;
    if (!n) { els.hand.innerHTML = `<div class="hand-empty">${t('ui.empty')}</div>`; return; }
    const mid = (n - 1) / 2;
    els.hand.innerHTML = hand.map((c, i) => {
      const st = myTurn && !view.turn.pending ? buildState(view, me, c) : null;
      const cls = [st === 'ok' ? 'playable' : st ? 'blocked' : '', L.sel === c.uid ? 'sel' : ''].join(' ');
      return cardHTML(c, { cls, costShown: buildCost(me, c), attrs: `data-a="card" data-k="${i + 1}" style="--i:${i - mid};--a:${Math.abs(i - mid)}" ${st && st !== 'ok' ? `data-why="${esc(st)}"` : ''}` });
    }).join('');
    fitHand();
  }
  function fitHand() {
    const cards = els.hand.querySelectorAll('.card');
    if (!cards.length) return;
    const cw = cards[0].offsetWidth || 80, avail = els.hand.clientWidth - 8, n = cards.length;
    const gap = n > 1 ? Math.min(8, (avail - cw) / (n - 1) - cw) : 0;
    els.hand.style.setProperty('--gap', gap + 'px');
  }
  addEventListener('resize', () => fitHand());

  function abilityKey(view) {
    const T = view.turn;
    const k = ACTIVE[CHAR[T.charId].key];
    return k && !T.used.ability ? k : null;
  }

  function renderActions(view, me, myTurn, draftMine) {
    const hintBtn = `<button class="btn small ghost hint-btn" data-a="hint" title="H">${svg('help')}<span>${t('ui.hint')}</span></button>`;
    if (!myTurn || view.turn.pending) { els.actions.innerHTML = ''; return; }
    const T = view.turn, b = [];
    if (!T.income) {
      const n = has(me, 'observatory') ? 3 : 2;
      b.push(`<button class="btn gold" data-a="gold">${svg('gold')}<span>${t('ui.takeGold')}</span><kbd>G</kbd></button>`);
      b.push(`<button class="btn" data-a="draw" ${view.deckCount ? '' : 'disabled'}>${svg('draw')}<span>${has(me, 'library') ? t('ui.drawAll', { n }) : t('ui.drawCards', { n, k: 1 })}</span><kbd>D</kbd></button>`);
    }
    const ab = abilityKey(view);
    if (T.spyPeek) b.push(`<button class="btn" data-a="sheet" data-v="spyResult">${svg('spy')}<span>${t('ui.spyReview')}</span></button>`);
    if (ab) b.push(`<button class="btn ability" style="--cc:${CHAR[T.charId].color}" data-a="sheet" data-v="${ab}">${svg(ABILITY_ICON[ab])}<span>${esc(cname(T.charId))}</span><kbd>A</kbd></button>`);
    if (has(me, 'smithy') && !T.used.smithy && me.gold >= 2) b.push(`<button class="btn small" data-a="smithy">${svg('smithy')}<span>${t('ui.smithy')}</span></button>`);
    if (has(me, 'laboratory') && !T.used.lab && me.hand.length) b.push(`<button class="btn small" data-a="sheet" data-v="lab">${svg('lab')}<span>${t('ui.lab')}</span></button>`);
    const sel = me.hand.find(c => c.uid === L.sel);
    if (sel && buildState(view, me, sel) === 'ok') b.push(`<button class="btn primary" data-a="build">${svg('build')}<span>${t('ui.buildFor', { n: buildCost(me, sel) })}</span><kbd>B</kbd></button>`);
    if (T.income) b.push(`<button class="btn ${sel ? '' : 'primary'} end" data-a="end">${svg('end')}<span>${t('ui.endTurn')}</span><kbd>E</kbd></button>`);
    b.push(hintBtn);
    els.actions.innerHTML = b.join('');
    markHint();
  }

  function renderPrompt(view, myTurn, draftMine) {
    let s = '';
    const actor = actorOf(view);
    if (view.phase === 'over') s = t('ui.winner', { name: pname(view.winner) });
    else if (view.interrupt && view.interrupt.pid !== view.me) s = t(view.interrupt.k === 'warrant' ? 'ui.waitingWarrant' : 'ui.waitingGrave', { name: pname(view.interrupt.pid) });
    else if (myTurn) {
      const T = view.turn, active = !!ACTIVE[CHAR[T.charId].key];
      const steps = [
        [t('tg.income'), T.income ? 'done' : 'now'],
        [T.max === 0 ? t('ui.noBuild') : t('tg.build', { a: T.built, b: T.max }), !T.income || T.max === 0 ? '' : T.built >= T.max ? 'done' : 'now'],
        active && [t('ui.ability'), T.used.ability ? 'done' : 'opt'],
        [t('ui.endTurn'), T.income ? 'opt' : ''],
      ].filter(Boolean);
      s = `<div class="tg-head"><b style="color:${CHAR[T.charId].color}" data-char="${T.charId}">${t('ui.yourTurn', { char: cname(T.charId) })}</b>
        <span class="tg-steps">${steps.map(([l, st]) => `<span class="tg ${st}">${st === 'done' ? '✓ ' : ''}${l}</span>`).join('')}</span></div>
        <div class="tg-ab">${esc(cabil(T.charId))}</div>`;
    } else if (draftMine) s = `<b>${t(view.draft.mustDiscard ? 'ui.discardTitle' : 'ui.pickChar')}</b>`;
    else if (view.phase === 'draft') s = t(view.draft.mustDiscard ? 'ui.waitingDiscard' : 'ui.waitingDraft', { name: pname(view.draft.order[view.draft.idx]) });
    else if (view.turn) s = `${t('ui.waitingFor', { name: pname(view.turn.pid) })} <span class="muted">· ${esc(cname(view.turn.charId))}</span><span class="feed-last"></span>`;
    const dl = ctx.deadline?.();
    if (dl && dl.pid === actor && view.phase !== 'over') s += ` <span class="timer" data-at="${dl.at}"></span>`;
    els.prompt.innerHTML = s;
  }

  // ── hints: the advisor (Cunning AI) suggests a move and the UI points at it ──
  function describe(a, v) {
    const me = v.players[v.me];
    const cardIn = (list, uid) => list?.find(c => c.uid === uid);
    switch (a.t) {
      case 'pick': case 'discard': return t('h.' + a.t, { char: cname(a.charId) });
      case 'gold': case 'draw': case 'end': case 'seer': case 'scholar': case 'smithy': case 'seerGive': return t('h.' + a.t);
      case 'build': return t('h.build', { dist: dname(cardIn(me.hand, a.uid)) });
      case 'lab': return t('h.lab', { dist: dname(cardIn(me.hand, a.uid)) });
      case 'keep': return t('h.keep', { dist: dname(cardIn(v.turn.pending.cards, a.uids[0])) });
      case 'wizTake': return t('h.wizTake', { dist: dname(cardIn(v.turn.pending.cards, a.uid)) });
      case 'kill': case 'rob': return t('h.' + a.t, { char: cname(rankChar(a.rank)) });
      case 'swap': case 'peek': return t('h.' + a.t, { name: realName(a.target) });
      case 'spy': return t('h.spy', { name: realName(a.target), color: t('col.' + a.color) });
      case 'redraw': return t('h.redraw', { n: a.uids.length });
      case 'destroy': return t('h.destroy', { name: realName(a.target), dist: dname(cardIn(v.players[a.target].city, a.uid)) });
      case 'collectTax': return t('ui.collectTax', { n: v.taxPool });
      case 'seize': return t('h.seize', { name: realName(a.target), dist: dname(cardIn(v.players[a.target].city, a.uid)) });
      case 'nav': return t(a.choice === 'gold' ? 'h.navg' : 'h.navc');
      case 'graveyard': return t(a.take ? 'h.graveYes' : 'h.graveNo');
      case 'warrants': return t('ui.warrantTitle');
      case 'warrantResponse': return t(a.take ? 'ui.confiscate' : 'ui.allowBuild');
    }
    return '';
  }
  function showHint() {
    const a = ctx.hint?.();
    if (!a || !L.view) return;
    L.hint = { a, seq: L.view.evSeq };
    toast(t('ui.hintSays', { what: `<b>${esc(describe(a, L.view))}</b>` }), 'gold');
    if (a.t === 'build') L.sel = a.uid;
    if (a.t === 'pick' || a.t === 'discard') L.draftSel = a.charId; // preselect: one tap on the button confirms
    if (a.t === 'kill' || a.t === 'rob') L.targetSel = a.rank;
    if (a.t === 'warrants') L.warrantTargets = [a.signed, ...a.targets.filter(c => c !== a.signed)];
    if (a.t === 'spy') { L.spyTarget = a.target; L.spyColor = a.color; }
    if (a.t === 'destroy' || a.t === 'seize') L.warSel = a.uid;
    render(L.view);
  }
  function markHint() {
    root.querySelectorAll('.suggest').forEach(el => el.classList.remove('suggest'));
    const a = L.hint?.a;
    if (!a) return;
    const sel = [];
    const ab = ABILITY_OF_ACTION[a.t];
    if (ab) sel.push(`[data-a="sheet"][data-v="${ab}"]`);
    if (a.t === 'pick' || a.t === 'discard') sel.push(`.ccard[data-char="${a.charId}"]`);
    if (['gold', 'draw', 'end', 'smithy'].includes(a.t)) sel.push(`[data-a="${a.t}"]`);
    if (a.t === 'build') sel.push(`.hand .card[data-uid="${a.uid}"]`, '[data-a="build"]');
    if (a.t === 'lab') sel.push('[data-a="sheet"][data-v="lab"]', `.card[data-a="lab"][data-uid="${a.uid}"]`);
    if (a.t === 'keep') sel.push(`.card[data-a="keep"][data-uid="${a.uids[0]}"]`);
    if (a.t === 'wizTake') sel.push(`[data-a="${a.build ? 'wizBuild' : 'wizTake'}"][data-v="${a.uid}"]`);
    if (a.t === 'kill' || a.t === 'rob') sel.push(`.ccard[data-a="${a.t}"][data-v="${a.rank}"]`);
    if (a.t === 'swap' || a.t === 'peek') sel.push(`[data-a="${a.t}"][data-v="${a.target}"]`);
    if (a.t === 'spy') sel.push(`[data-a="spyTarget"][data-v="${a.target}"]`, `[data-a="spyColor"][data-v="${a.color}"]`, '[data-a="spyGo"]');
    if (a.t === 'redraw' || a.t === 'seerGive') a.uids.forEach(u => sel.push(`.card[data-a="multi"][data-uid="${u}"]`));
    if (a.t === 'destroy') sel.push(`.card[data-a="destroy"][data-uid="${a.uid}"]`);
    if (a.t === 'seize') sel.push(`.card[data-a="seize"][data-uid="${a.uid}"]`);
    if (a.t === 'collectTax') sel.push('[data-a="collectTax"]');
    if (a.t === 'seer') sel.push('[data-a="seerGo"]');
    if (a.t === 'scholar') sel.push('[data-a="scholarGo"]');
    if (a.t === 'nav') sel.push(`[data-a="nav"][data-v="${a.choice}"]`);
    if (a.t === 'graveyard') sel.push(`[data-a="${a.take ? 'graveYes' : 'graveNo'}"]`);
    if (a.t === 'warrantResponse') sel.push(`[data-a="warrantReply"][data-v="${a.take ? 'yes' : 'no'}"]`);
    sel.forEach(s => root.querySelectorAll(s).forEach(el => el.classList.add('suggest')));
  }

  // ── sheets ──
  function warTargets(view, marshal = false) {
    const me = view.players[view.me], out = [];
    for (const o of view.players) {
      const sh = shielded(view, o);
      for (const card of o.city) {
        if (marshal && o.id === me.id) continue;
        const cost = marshal ? seizureCost(card) : destroyCost(o, card);
        const why = marshal ? seizeError(view, me, o, card) : null;
        out.push({ o, card, cost, sh, why, ok: marshal ? !why : !sh && card.id !== 'keep' && cost <= me.gold });
      }
    }
    return out;
  }

  function sheetFrame(title, body, { closable = true, cls = '', foot = '' } = {}) {
    return `<div class="sh-head"><h2>${title}</h2>${closable ? `<button class="icon-btn" data-a="close" aria-label="${t('ui.close')}">${svg('close')}</button>` : ''}</div>
      <div class="sh-body ${cls}">${body}</div>${foot}`;
  }
  function orderStrip(v) {
    const d = v.draft;
    return `<div class="order"><span class="muted">${t('ui.order')}</span>${d.order.map((pid, i) =>
      `<span class="ord ${i < d.idx ? 'done' : i === d.idx ? 'now' : ''}" style="--seat:${seatHue(pid)}" title="${realName(pid)}">${avatar(P(pid))}</span>`).join('<i>›</i>')}</div>`;
  }

  function renderSheet() {
    const v = L.view, s = L.sheet;
    els.wrap.classList.toggle('open', !!s);
    els.wrap.classList.toggle('blocking', BLOCKING.includes(s));
    els.wrap.classList.toggle('side', ['war', 'marshal', 'inspect', 'log', 'round'].includes(s)); // keep the table clickable
    els.sheet.inert = !s;
    els.sheet.setAttribute('aria-hidden', String(!s));
    els.drawer.hidden = !L.drawers.length || s === 'journeys';
    els.drawer.textContent = `${t('ui.showPopup')} · ${L.drawers.at(-1)?.title || ''}`;
    if (!s || !v) { els.sheet.innerHTML = ''; return; }
    // never leave a decision dialog on screen with nothing to decide
    if ((s === 'draft' || s === 'discard') && !(v.phase === 'draft' && v.draft.options?.length)) { L.sheet = null; return renderSheet(); }
    const me = v.players[v.me], T = v.turn, pend = T?.pid === v.me ? T.pending : null;
    let html = '', wide = false;
    const myRanks = me ? me.chars.map(rankOf) : [];
    const hintFoot = `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button></div>`;

    if (s === 'draft' || s === 'discard') {
      const discarding = s === 'discard';
      const opts = [...(v.draft.options || [])].sort((a, b) => rankOf(a) - rankOf(b));
      if (!opts.includes(L.draftSel)) L.draftSel = null;
      const second = me.chars.length > 0, after = v.draft.order.length - v.draft.idx - 1, sel = L.draftSel;
      const go = discarding ? 'discard' : 'pick';
      html = sheetFrame(t(discarding ? 'ui.discardTitle' : second ? 'ui.pickSecond' : 'ui.pickChar'),
        `<div class="draft-top">${orderStrip(v)}<span class="muted">${after ? t('dr.after', { n: after }) : t('dr.last')}</span></div>
        ${meStrip(v, me)}
        <div class="ccards draft ${discarding ? 'discarding' : ''} ${opts.length > 5 ? 'many' : ''}">${opts.map(id => charHTML(id, {
          attrs: `data-a="${go}" aria-pressed="${sel === id}"`,
          cls: [sel === id ? 'sel' : '', !discarding && !v.draft.avail.includes(id) ? 'hiddenpick' : ''].join(' '),
          you: discarding ? null : forYou(id),
        })).join('')}</div>
        <div class="aside">${v.draft.faceUp.length ? `<span class="muted">${t('ui.faceUp')}</span>${v.draft.faceUp.map(namedChip).join('')}` : ''}
        ${v.draft.faceDown.length ? `<span class="chip hid">?</span><span class="muted">${t('ui.faceDown', { n: v.draft.faceDown.length })}</span>` : ''}
        ${second ? `<span class="muted">· ${t('ui.you')}</span>${me.chars.map(namedChip).join('')}` : ''}</div>
        ${discarding ? `<p class="note">${t('ui.discardHint')}</p>` : opts.length > v.draft.avail.length ? `<p class="note">${t('ui.lastPickNote')}</p>` : ''}`,
        { closable: false, foot: `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button>
          <button class="btn primary" data-a="${go}Go" ${sel ? '' : 'disabled'}>${sel ? t(discarding ? 'dr.discardGo' : 'dr.choose', { char: cname(sel) }) : t('dr.tapCard')}</button></div>` });
      wide = true;
    } else if (s === 'warrants') {
      const chosen = L.warrantTargets || [];
      const opts = [...v.cfg.chars].sort((a, b) => rankOf(a) - rankOf(b));
      html = sheetFrame(t('ui.warrantTitle'), `<p class="note">${t('ui.warrantHint')}</p>
        <div class="warrant-choices">${opts.map(id => `<button class="btn ${chosen.includes(id) ? 'primary' : ''}" data-a="warrantPick" data-v="${id}" aria-pressed="${chosen.includes(id)}">${ROMAN[rankOf(id)]} ${esc(cname(id))}${chosen.includes(id) ? ` · ${t(chosen[0] === id ? 'ui.signedWarrant' : 'ui.unsignedWarrant')}` : ''}</button>`).join('')}</div>`,
        { foot: `<div class="sh-foot"><button class="btn primary" data-a="warrantAssign" ${chosen.length === 3 ? '' : 'disabled'}>${t('ui.confirm')} · ${chosen.length}/3</button></div>` });
    } else if (s === 'warrantResponse' && v.interrupt?.k === 'warrant') {
      const i = v.interrupt;
      html = sheetFrame(t('ui.warrantReview'), `<div class="cards-big">${cardHTML(i.card, { cls: 'big' })}</div>
        <p class="note">${t(canConfiscate(v) ? 'ui.warrantCanTake' : 'ui.warrantCannotTake')}</p>
        <div class="sh-foot two"><button class="btn" data-a="warrantReply" data-v="no">${t('ui.allowBuild')}</button>
        <button class="btn primary" data-a="warrantReply" data-v="yes" ${canConfiscate(v) ? '' : 'disabled'}>${t('ui.confiscate')}</button></div>`, { closable: false });
    } else if (s === 'grave' && v.interrupt) {
      const c = v.interrupt.card;
      html = sheetFrame(t('ui.graveTitle'), `<div class="cards-big">${cardHTML(c, { cls: 'big' })}</div>
        <p class="center">${t('ui.graveAsk', { dist: `<b>${esc(dname(c))}</b>` })}</p>
        <div class="sh-foot two"><button class="btn" data-a="graveNo">${t('ui.graveNo')}</button>
        <button class="btn primary" data-a="graveYes" ${me.gold >= 1 ? '' : 'disabled'}>${svg('gold')}${t('ui.graveYes')}</button></div>`, { closable: false });
    } else if (s === 'keep' && pend) {
      html = sheetFrame(t('ui.keepTitle', { n: pend.n }),
        `<div class="cards-big">${sortHand(pend.cards).map(c => cardHTML(c, { cls: 'big' + (canPlace(me, c) ? '' : ' dupwarn'), costShown: buildCost(me, c), attrs: 'data-a="keep"' })).join('')}</div>
        <p class="note">${t('ui.keepHint')}</p>`, { closable: false, foot: hintFoot });
      wide = true;
    } else if (s === 'kill' || s === 'rob') {
      const ranks = targetRanks(v, s === 'kill' ? [1] : [1, 2, v.killed]).filter(r => !myRanks.includes(r));
      if (!ranks.includes(L.targetSel)) L.targetSel = null;
      const sel = L.targetSel, ctxLine = forYou(s === 'kill' ? 1 : 2)[0];
      html = sheetFrame(t(s === 'kill' ? 'ui.killTitle' : 'ui.robTitle'),
        `<p class="ctx-line">${esc(ctxLine)}</p>
        <div class="ccards compact">${ranks.map(r => charHTML(rankChar(r), { attrs: `data-a="${s}" data-v="${r}" aria-pressed="${sel === r}"`, cls: sel === r ? 'sel' : '' })).join('')}</div>`,
        { foot: `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button>
          <button class="btn primary" data-a="${s}Go" ${sel ? '' : 'disabled'}>${sel ? t(s + '.go', { char: cname(rankChar(sel)) }) : t('dr.tapCard')}</button></div>` });
      wide = true;
    } else if (s === 'mag') {
      const opps = v.players.filter(p => p.id !== v.me);
      html = sheetFrame(t('ui.magTitle'), `
        <h4>${t('ui.magSwap')}</h4>
        <div class="plist">${opps.map(p => `<button class="pitem" data-a="swap" data-v="${p.id}">${avatar(p)}<span>${esc(p.name)}</span><span class="st">${svg('card')}<b>${p.handCount}</b></span></button>`).join('')}</div>
        <h4>${t('ui.magRedraw')}</h4><p class="note">${t('ui.magRedrawHint')}</p>
        <div class="cards-pick">${sortHand(me.hand).map(c => cardHTML(c, { cls: L.multi.has(c.uid) ? 'picked' : '', attrs: 'data-a="multi"' })).join('')}</div>`,
        { foot: `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button><button class="btn primary" data-a="redraw" ${L.multi.size && v.deckCount ? '' : 'disabled'}>${t('ui.confirm')} · ${L.multi.size}</button></div>` });
    } else if (s === 'tax') {
      html = sheetFrame(cname(19), `<p class="note">${esc(cabil(19))}</p><p class="center gold">${t('ui.taxPool', { n: v.taxPool })}</p>`,
        { foot: `<div class="sh-foot"><button class="btn primary" data-a="collectTax">${svg('gold')}${t('ui.collectTax', { n: v.taxPool })}</button></div>` });
    } else if (s === 'war' || s === 'marshal') {
      // rivals by score (who to hit), my own city last; every blocked card says why
      const marshal = s === 'marshal', action = marshal ? 'seize' : 'destroy';
      const rows = warTargets(v, marshal), goal = v.cfg.goal;
      if (!rows.some(x => x.ok && x.card.uid === L.warSel)) L.warSel = null;
      const order = [...v.players].sort((a, b) => (a.id === v.me) - (b.id === v.me) || shownScore(v, b) - shownScore(v, a));
      const by = order.map(o => ({ o, list: rows.filter(x => x.o.id === o.id) })).filter(g => g.list.length);
      const pick = rows.find(x => x.card.uid === L.warSel);
      const why = x => x.ok ? '' : x.sh ? t('ui.shielded.' + x.sh) : marshal ? t('seize.' + x.why) : x.card.id === 'keep' ? t('war.keep') : t('ui.tooPoor');
      html = sheetFrame(marshal ? cname(20) : t('ui.warTitle'), `<p class="ctx-line">${svg('gold')}${t('war.have', { n: me.gold })} · ${marshal ? esc(cabil(20)) : t('ui.warHint')}</p>` + by.map(({ o, list }) => `
        <div class="wgroup ${o.id === v.me ? 'own' : ''}"><div class="wg-head" style="--seat:${seatHue(o.id)}">${avatar(o)}<b>${o.id === v.me ? t('ui.you') : esc(o.name)}</b>
          <span class="muted">★${shownScore(v, o)}${o.city.length < goal ? ' · ' + t('war.toGo', { n: goal - o.city.length }) : ''}</span>
          ${list[0].sh ? `<span class="tag">${t('ui.shielded.' + list[0].sh)}</span>` : ''}</div>
        ${list[0].sh ? '' : `<div class="cards-pick">${list.map(x => `<div class="wopt ${x.ok ? '' : 'no'}">${cardHTML(x.card, {
          cls: [x.ok ? 'target' : 'blocked', L.warSel === x.card.uid ? 'picked' : ''].join(' '),
          attrs: x.ok ? `data-a="${action}" data-t="${o.id}" aria-pressed="${L.warSel === x.card.uid}"` : `disabled aria-disabled="true" data-why="${esc(why(x))}"`, costShown: x.card.cost })}
          <span class="wcost">${x.ok ? t(marshal ? 'ui.seizeCost' : 'ui.destroyCost', { n: x.cost }) : esc(why(x))}</span></div>`).join('')}</div>`}</div>`).join(''),
        { foot: `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button>
          <button class="btn ${marshal ? 'primary' : 'danger'}" data-a="${action}Go" ${pick ? '' : 'disabled'}>${pick ? t(marshal ? 'seize.go' : 'war.go', { dist: dname(pick.card), n: pick.cost }) : t('war.pick')}</button></div>` });
      wide = true;
    } else if (s === 'spy') {
      const opps = v.players.filter(p => p.id !== v.me);
      html = sheetFrame(cname(18), `<p class="note">${t('ui.spyHint')}</p>
        <div class="spy-targets">${opps.map(p => `<button class="btn small ${L.spyTarget === p.id ? 'primary' : ''}" data-a="spyTarget" data-v="${p.id}" aria-pressed="${L.spyTarget === p.id}"><span class="spy-name">${esc(p.name)}</span><span class="spy-stats"><span class="st">${svg('card')}<b>${p.handCount}</b></span><span class="st">${svg('gold')}<b>${p.gold}</b></span></span></button>`).join('')}</div>
        <div class="spy-colors">${COLORS.map(color => `<button class="btn small ${L.spyColor === color ? 'primary' : ''}" data-a="spyColor" data-v="${color}" aria-pressed="${L.spyColor === color}" style="--cc:${HUE[color]}">${svg(COLOR_SYM[color])}${t('col.' + color)}</button>`).join('')}</div>`,
        { foot: `<div class="sh-foot"><button class="btn small ghost" data-a="hint">${t('ui.hint')}</button><button class="btn primary" data-a="spyGo" ${opps.some(p => p.id === L.spyTarget) && COLORS.includes(L.spyColor) ? '' : 'disabled'}>${t('ui.confirm')}</button></div>` });
    } else if (s === 'spyResult' && T?.spyPeek) {
      html = sheetFrame(cname(18) + ' · ' + realName(T.spyPeek.target), `<p class="note">${t('ui.spySnapshot')}</p><div class="cards-pick">${sortHand(T.spyPeek.cards).map(c => cardHTML(c)).join('') || `<p>${t('ui.spyEmpty')}</p>`}</div>`);
    } else if (s === 'wiz') {
      const opps = v.players.filter(p => p.id !== v.me && p.handCount);
      html = sheetFrame(t('ui.wizTitle'), `<div class="plist">${opps.map(p => `<button class="pitem" data-a="peek" data-v="${p.id}">${avatar(p)}<span>${esc(p.name)}</span><span class="st">${svg('card')}<b>${p.handCount}</b></span></button>`).join('')}</div>`, { foot: hintFoot });
    } else if (s === 'wizPick' && pend) {
      html = sheetFrame(cname(11) + ' · ' + esc(P(pend.target).name), `<div class="cards-big">${sortHand(pend.cards).map(c => {
        const canB = buildCost(me, c) <= me.gold;
        return `<div class="wiz-opt">${cardHTML(c, { cls: 'big', costShown: buildCost(me, c) })}
          <button class="btn small" data-a="wizTake" data-v="${c.uid}">${t('ui.wizTake')}</button>
          <button class="btn small primary" data-a="wizBuild" data-v="${c.uid}" ${canB ? '' : 'disabled'}>${t('ui.wizBuild', { n: buildCost(me, c) })}</button></div>`;
      }).join('')}</div>`, { closable: false, foot: hintFoot });
      wide = true;
    } else if (s === 'seer') {
      html = sheetFrame(cname(15), `<p>${esc(cabil(15))}</p>`, { foot: `<div class="sh-foot"><button class="btn primary" data-a="seerGo">${t('ui.seerGo')}</button></div>` });
    } else if (s === 'seerGive' && pend) {
      const names = pend.targets.map(id => realName(id)).join(' → ');
      html = sheetFrame(t('ui.seerGive', { n: pend.targets.length }), `<p class="note">${t('ui.seerGiveHint', { names })}</p>
        <div class="cards-pick">${sortHand(me.hand).map(c => cardHTML(c, { cls: L.multi.has(c.uid) ? 'picked' : '', attrs: 'data-a="multi"' })).join('')}</div>`,
        { closable: false, foot: `<div class="sh-foot"><button class="btn small ghost hint-btn" data-a="hint">${svg('help')}<span>${t('ui.hint')}</span></button><button class="btn primary" data-a="seerGive" ${L.multi.size === pend.targets.length ? '' : 'disabled'}>${t('ui.confirm')} · ${L.multi.size}/${pend.targets.length}</button></div>` });
    } else if (s === 'nav') {
      html = sheetFrame(t('ui.navTitle'), `<p>${esc(cabil(10))}</p>`, { foot: `<div class="sh-foot two">
        <button class="btn gold" data-a="nav" data-v="gold">${svg('gold')}${t('ui.nav4gold')}</button>
        <button class="btn" data-a="nav" data-v="cards" ${v.deckCount ? '' : 'disabled'}>${svg('draw')}${t('ui.nav4cards')}</button></div>` });
    } else if (s === 'scholar') {
      html = sheetFrame(cname(14), `<p>${esc(cabil(14))}</p>`, { foot: `<div class="sh-foot"><button class="btn primary" data-a="scholarGo" ${v.deckCount ? '' : 'disabled'}>${t('ui.scholarGo')}</button></div>` });
    } else if (s === 'lab') {
      html = sheetFrame(dname('laboratory'), `<p class="note">${esc(ddesc('laboratory'))}</p>
        <div class="cards-pick">${sortHand(me.hand).map(c => cardHTML(c, { attrs: 'data-a="lab"' })).join('')}</div>`);
    } else if (s === 'den') {
      const card = me.hand.find(c => c.uid === L.sel);
      if (!card) { L.sheet = null; return renderSheet(); }
      const cost = buildCost(me, card), need = Math.max(0, cost - me.gold), goldPaid = cost - L.multi.size;
      html = sheetFrame(dname(card) + ' · ' + t('ui.denPay'), `<p class="note">${t('ui.denHint', { n: need })}</p>
        <div class="cards-pick">${sortHand(me.hand.filter(c => c.uid !== card.uid)).map(c => cardHTML(c, { cls: L.multi.has(c.uid) ? 'picked' : '', attrs: 'data-a="multi"' })).join('')}</div>`,
        { foot: `<div class="sh-foot"><button class="btn primary" data-a="denBuild" ${L.multi.size >= need && goldPaid >= 0 ? '' : 'disabled'}>${svg('build')}${svg('gold')}${Math.max(0, goldPaid)} + ${svg('card')}${L.multi.size}</button></div>` });
    } else if (s === 'inspect') {
      const p = P(L.inspect);
      if (!p) { L.sheet = null; return renderSheet(); }
      const sc = v.phase === 'over' ? v.scores[p.id].total : shownScore(v, p);
      html = sheetFrame(`<span class="seat-dot" style="--seat:${seatHue(p.id)}"></span>${avatar(p)} ${p.id === v.me ? t('ui.you') : esc(p.name)}`, `
        <div class="stats-row"><span class="st gold">${svg('gold')}<b>${p.gold}</b></span><span class="st">${svg('card')}<b>${p.handCount}</b></span>
        <span class="st">${svg('build')}<b>${p.city.length}/${v.cfg.goal}</b></span><span class="st">★<b>${sc}</b></span>
        ${p.chars.map(c => chip(c)).join('')}</div>
        <div class="cards-pick city">${p.city.length ? p.city.map(c => cardHTML(c, { attrs: 'data-a="none"' })).join('') : `<p class="muted">—</p>`}</div>`);
      wide = true;
    } else if (s === 'round') {
      const calls = roundFeed(v);
      html = sheetFrame(t('tl.title', { n: v.round }), calls.length ? `<ol class="feed">${calls.map(({ e, items }, i) => {
        const c = CHAR[e.charId], now = i === calls.length - 1 && v.turn?.pid === e.pid && v.phase === 'turns';
        const who = e.pid === null ? `<span class="muted">${t('ui.calledNobody')}</span>` : `${avatar(P(e.pid))}${pname(e.pid)}${e.killed ? ` <span class="tag danger">${t('ui.slain')}</span>` : ''}`;
        return `<li class="${now ? 'now' : ''} ${e.pid === null ? 'none' : ''}" style="--cc:${c.color}"><div class="fd-head">${chip(e.charId)}<b>${esc(cname(e.charId))}</b><span class="fd-who">${who}</span></div>
          ${items.length ? `<ul>${items.map(x => `<li class="lk-${x.k}">${x.line}</li>`).join('')}</ul>` : ''}</li>`;
      }).join('')}</ol>` : `<p class="muted center">${t('tl.empty')}</p>`, { cls: 'scroll' });
    } else if (s === 'log') {
      html = sheetFrame(t('ui.log'), `<ol class="log">${L.log.map(l => `<li class="lk-${l.k}">${l.txt}</li>`).join('')}</ol>`, { cls: 'scroll' });
    } else if (s === 'rules') {
      const ids = [...new Set(v.cfg.chars)].sort((a, b) => rankOf(a) - rankOf(b));
      const purples = Object.keys(DIST).filter(id => DIST[id][1] === 'purple');
      html = sheetFrame(t('ui.rules'), `<div class="rules">${RULES[getLang()].replace('{goal}', v.cfg.goal)}</div>
        <div class="ccards compact static">${ids.map(id => charHTML(id, { attrs: 'tabindex="-1"' })).join('')}</div>
        <h3>${t('col.purple')}</h3><dl class="dlist">${purples.map(id => `<dt><span class="dot" style="background:${HUE.purple}"></span>${dname(id)} <span class="muted">${DIST[id][0]}</span></dt><dd>${ddesc(id)}</dd>`).join('')}</dl>
        <p class="note">${t('ui.keys')}</p><p class="note">${t('ui.camHint')}</p>`, { cls: 'scroll' });
      wide = true;
    } else if (s === 'journeys') {
      const per = charsPerPlayer(v.players.length);
      const rounds = Math.ceil(Math.max(0, ...v.players.map(p => p.played?.length || 0)) / per);
      const players = [...v.players].sort((a, b) => (v.scores?.find(r => r.pid === b.id)?.total || 0) - (v.scores?.find(r => r.pid === a.id)?.total || 0));
      html = sheetFrame(t('ov.journey'), `<div class="journey-rounds">${Array.from({ length: rounds }, (_, round) => `
        <section class="journey-round"><h3>${t('ui.round', { n: round + 1 })}</h3>${players.map(p => `
          <div class="jr"><span class="jr-who">${avatar(p)}<span class="jr-name">${p.id === v.me ? t('ui.you') : realName(p.id)}</span></span>
            <div class="jr-chars">${(p.played || []).slice(round * per, (round + 1) * per).map(id => `
              <button class="btn small ghost journey-character" data-char="${id}" style="--cc:${CHAR[id].color}">${svg(CHAR[id].key)}<span>${ROMAN[CHAR[id].rank]} · ${esc(cname(id))}</span></button>`).join('') || '<span class="muted">—</span>'}</div></div>`).join('')}
        </section>`).join('')}</div>`, { cls: 'scroll', foot: `<div class="sh-foot"><button class="btn" data-a="journeyBack">${svg('back')}${t('lb.back')}</button></div>` });
      wide = true;
    } else if (s === 'over') {
      const rows = [...v.scores].sort((a, b) => b.total - a.total);
      const win = v.winner === v.me, mine = rows.findIndex(r => r.pid === v.me);
      const cols = ['base', 'first', 'complete', 'colors', 'extra'].filter(k => rows.some(r => r.parts[k]));
      const rec = ctx.stats?.();
      // highlights from the public tallies the engine keeps (st) — best player per category, if anyone scored
      const st = (p, k) => p.st?.[k] || 0;
      const moments = [['built', 'build', 'mo.n.built'], ['seized', 'marshal', 'mo.n.built'], ['earned', 'gold', 'mo.n.gold'], ['stole', 'thief', 'mo.n.gold'], ['razed', 'warlord', 'mo.n.built'], ['slain', 'skull', 'mo.n.times']]
        .map(([k, icon, unit]) => { const p = v.players.reduce((b, q) => (st(q, k) > st(b, k) ? q : b)); return st(p, k) ? { k, icon, unit, p, n: st(p, k) } : null; })
        .filter(Boolean);
      const placing = mine < 0 ? '' : win ? t('ov.win', { n: rows[0].total })
        : `${t('ov.place', { rank: mine + 1, n: rows[mine].total })} · ${t('ov.behind', { n: rows[0].total - rows[mine].total })}`;
      html = `<div class="over ${win ? 'win' : ''}">
        <div class="over-ico">${svg('trophy')}</div>
        <h1>${win ? t('ui.youWin') : t('ui.youLose', { name: realName(v.winner) })}</h1>
        ${placing ? `<p class="placing">${placing}</p>` : ''}
        <table class="score"><thead><tr><th></th>${[...cols, 'total'].map(k => `<th>${t('ui.score.' + k)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${r.pid === v.winner ? 'w' : ''} ${r.pid === v.me ? 'me' : ''}" style="--d:${i * 120}ms;--seat:${seatHue(r.pid)}"><td>${avatar(P(r.pid))}${r.pid === v.me ? t('ui.you') : realName(r.pid)}</td>
          ${cols.map(k => `<td>${r.parts[k] || '·'}</td>`).join('')}<td class="tot">${r.total}</td></tr>`).join('')}</tbody></table>
        ${moments.length ? `<h4 class="ov-h">${t('ov.moments')}</h4><div class="moments">${moments.map(m => `<div class="mo">${svg(m.icon)}<span class="mo-k">${t('mo.' + m.k)}</span>
          <span class="mo-v">${avatar(m.p)}<span class="mo-name">${m.p.id === v.me ? t('ui.you') : realName(m.p.id)}</span><b>${t(m.unit, { n: m.n })}</b></span></div>`).join('')}</div>` : ''}
        ${v.players.some(p => p.played?.length) ? `<button class="btn journeys" data-a="journey" aria-haspopup="dialog" aria-controls="game-sheet">${svg('log')}${t('ov.journey')}</button>` : ''}
        ${rec ? `<p class="note">${t('lb.stats', rec)}</p>` : ''}
        <div class="sh-foot two">${ctx.mode() !== 'peer' ? `<button class="btn primary" data-a="again">${svg('play')}${t('ui.again')}</button>` : ''}<button class="btn" data-a="home">${t('ui.home')}</button></div></div>`;
      wide = true;
    }
    if (!html) { L.sheet = null; els.wrap.classList.remove('open'); els.sheet.innerHTML = ''; return; }
    els.sheet.className = 'sheet' + (wide ? ' wide' : '') + (s === 'over' ? ' over-sheet' : s === 'journeys' ? ' journey-sheet' : '');
    els.sheet.innerHTML = html;
    const collapse = `<button class="btn small ghost" data-a="hideSheet" aria-controls="game-sheet" aria-expanded="true">${t('ui.hidePopup')}</button>`;
    const head = $('.sh-head', els.sheet);
    if (head) {
      const controls = document.createElement('div');
      controls.className = 'sh-controls';
      controls.innerHTML = collapse;
      const close = $('[data-a="close"]', head);
      if (close) controls.appendChild(close);
      head.appendChild(controls);
    } else els.sheet.insertAdjacentHTML('afterbegin', `<div class="sh-controls over-controls">${collapse}</div>`);
    if (s === 'log') { const b = $('.sh-body', els.sheet); b.scrollTop = b.scrollHeight; }
    markHint();
    // keyboard users land inside a decision dialog
    if ((BLOCKING.includes(s) || s === 'journeys') && !els.sheet.contains(document.activeElement)) els.sheet.querySelector('button:not([disabled]):not([data-a="close"])')?.focus({ preventScroll: true });
  }

  function hideSheet() {
    if (!L.sheet) return;
    L.drawers.push({ sheet: L.sheet, multi: new Set(L.multi),
      sel: L.sel, draftSel: L.draftSel, targetSel: L.targetSel, warSel: L.warSel, inspect: L.inspect,
      title: $('h2, h1', els.sheet)?.textContent || '' });
    L.sheet = null;
    L.multi.clear();
    renderSheet();
    hideTip();
    els.drawer.focus({ preventScroll: true });
  }
  function restoreSheet() {
    const saved = L.drawers.pop();
    if (!saved) return;
    const { title, ...state } = saved;
    Object.assign(L, state);
    renderSheet();
    $('[data-a="hideSheet"]', els.sheet)?.focus({ preventScroll: true });
  }
  function openSheet(name) {
    // Reopening a hidden tool must retain its card selections.
    const saved = L.drawers.findIndex(d => d.sheet === name);
    if (saved !== -1) {
      L.drawers.push(...L.drawers.splice(saved, 1));
      return restoreSheet();
    }
    if (L.sheet && BLOCKING.includes(L.sheet)) hideSheet();
    L.sheet = name;
    L.multi.clear();
    renderSheet();
    ctx.scene.highlight(['war', 'marshal'].includes(name) ? warTargets(L.view, name === 'marshal').filter(x => x.ok).map(x => x.card.uid) : []);
    sfx('click');
  }
  function closeSheet() {
    if (L.sheet === 'journeys' && L.drawers.at(-1)?.sheet === 'over') {
      restoreSheet();
      $('[data-a="journey"]', els.sheet)?.focus({ preventScroll: true });
      return;
    }
    L.sheet = null; L.multi.clear(); renderSheet(); ctx.scene.highlight([]);
  }

  // ── input ──
  const go = a => { L.multi.clear(); L.hint = null; ctx.dispatch(a); };
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!$('.emote-wrap', root)?.contains(e.target)) els.top.classList.remove('emoting');
    if (!el || !root.contains(el)) {
      if (e.target === els.wrap && !els.wrap.classList.contains('blocking')) closeSheet();
      return;
    }
    const a = el.dataset.a, v = el.dataset.v, view = L.view;
    if (!view) return;
    const me = view.players[view.me];
    switch (a) {
      case 'hideSheet': return hideSheet();
      case 'restoreSheet': return restoreSheet();
      case 'close': return closeSheet();
      case 'journey': return openSheet('journeys');
      case 'journeyBack': return closeSheet();
      case 'sheet': return openSheet(v);
      case 'overview': ctx.scene.resetView(); return;
      case 'hint': return showHint();
      case 'emotes': els.top.classList.toggle('emoting'); return;
      case 'emote': els.top.classList.remove('emoting'); return ctx.emote(v);
      case 'inspect': L.inspect = +v; ctx.scene.focus(+v); return openSheet('inspect');
      // characters: the first tap selects (and shows what it means for you), a second tap or the button confirms
      case 'pick': case 'discard': {
        const id = +el.dataset.char;
        sfx('click');
        if (L.draftSel !== id) { L.draftSel = id; return renderSheet(); }
        L.draftSel = null;
        return go({ t: a, charId: id });
      }
      case 'pickGo': case 'discardGo':
        if (!L.draftSel) return;
        sfx('click');
        { const id = L.draftSel; L.draftSel = null; return go({ t: a === 'pickGo' ? 'pick' : 'discard', charId: id }); }
      case 'graveYes': return go({ t: 'graveyard', take: true });
      case 'warrantPick': {
        const chosen = L.warrantTargets ||= [];
        const id = +v, idx = chosen.indexOf(id);
        if (idx >= 0) chosen.splice(idx, 1);
        else if (chosen.length < 3) chosen.push(id);
        return renderSheet();
      }
      case 'warrantAssign': {
        const targets = L.warrantTargets || [];
        if (targets.length !== 3) return;
        return go({ t: 'warrants', targets: [...targets], signed: targets[0] });
      }
      case 'warrantReply': {
        const i = view.interrupt;
        if (i?.k !== 'warrant') return;
        return go({ t: 'warrantResponse', id: i.id, round: i.round, take: v === 'yes' });
      }
      case 'graveNo': return go({ t: 'graveyard', take: false });
      case 'gold': return go({ t: 'gold' });
      case 'collectTax': closeSheet(); return go({ t: 'collectTax', round: view.round, charId: view.turn.charId });
      case 'draw': return go({ t: 'draw' });
      case 'end': {
        // Ending while a build is still possible is usually a slip: ask once (setting).
        const canBuild = me && view.turn.built < view.turn.max && me.hand.some(c => buildState(view, me, c) === 'ok');
        if (prefs.confirmEnd && canBuild && !L.endArmed) {
          L.endArmed = true;
          el.classList.add('armed'); el.querySelector('span').textContent = t('ui.endSure');
          toast(t('ui.endHint'), 'gold');
          setTimeout(() => { L.endArmed = false; if (L.view) render(L.view); }, 3000);
          return sfx('click');
        }
        L.sel = null; L.endArmed = false; return go({ t: 'end' });
      }
      case 'settings': return ctx.openSettings();
      case 'smithy': return go({ t: 'smithy' });
      case 'card': {
        const uid = el.dataset.uid;
        if (el.dataset.why) toast(el.dataset.why);
        L.sel = L.sel === uid ? null : uid;
        sfx('click');
        return render(view);
      }
      case 'build': {
        const card = me.hand.find(c => c.uid === L.sel);
        if (!card) return;
        if (buildCost(me, card) > me.gold) return openSheet('den');
        L.sel = null;
        return go({ t: 'build', uid: card.uid });
      }
      case 'denBuild': { const uid = L.sel; L.sel = null; const pay = [...L.multi]; closeSheet(); return go({ t: 'build', uid, pay }); }
      case 'keep': return go({ t: 'keep', uids: [el.dataset.uid] });
      case 'kill': case 'rob':
        sfx('click');
        if (L.targetSel !== +v) { L.targetSel = +v; return renderSheet(); }
        // falls through: a second tap on the selected character confirms
      case 'killGo': case 'robGo': {
        const rank = L.targetSel;
        if (!rank) return;
        L.targetSel = null; closeSheet();
        return go({ t: a.startsWith('kill') ? 'kill' : 'rob', rank });
      }
      case 'swap': closeSheet(); return go({ t: 'swap', target: +v });
      case 'spyTarget': L.spyTarget = +v; return renderSheet();
      case 'spyColor': L.spyColor = v; return renderSheet();
      case 'spyGo': {
        if (!Number.isInteger(L.spyTarget) || !COLORS.includes(L.spyColor)) return;
        const action = { t: 'spy', target: L.spyTarget, color: L.spyColor, round: view.round };
        closeSheet(); return go(action);
      }
      case 'multi': {
        const uid = el.dataset.uid;
        // when the selection is already full (Seer give-back, Thieves' Den), a new pick replaces the oldest
        const V = L.view, sel = V.players[V.me].hand.find(c => c.uid === L.sel);
        const cap = L.sheet === 'seerGive' ? V.turn?.pending?.targets?.length : L.sheet === 'den' && sel ? buildCost(V.players[V.me], sel) : Infinity;
        if (L.multi.has(uid)) L.multi.delete(uid);
        else { if (L.multi.size >= cap) L.multi.delete(L.multi.values().next().value); L.multi.add(uid); }
        sfx('click');
        return renderSheet();
      }
      case 'redraw': { const uids = [...L.multi]; closeSheet(); return go({ t: 'redraw', uids }); }
      case 'seize': case 'destroy':
        sfx('click');
        if (L.warSel !== el.dataset.uid) { L.warSel = el.dataset.uid; renderSheet(); return ctx.scene.highlight([L.warSel]); }
        // falls through: tapping the selected building again confirms
      case 'seizeGo': case 'destroyGo': {
        const marshal = a.startsWith('seize');
        const x = warTargets(view, marshal).find(w => w.ok && w.card.uid === L.warSel);
        if (!x) return;
        L.warSel = null; closeSheet();
        return go(marshal ? { t: 'seize', target: x.o.id, uid: x.card.uid, round: view.round, charId: view.turn.charId } : { t: 'destroy', target: x.o.id, uid: x.card.uid });
      }
      case 'peek': closeSheet(); return go({ t: 'peek', target: +v });
      case 'wizTake': return go({ t: 'wizTake', uid: v, build: false });
      case 'wizBuild': return go({ t: 'wizTake', uid: v, build: true });
      case 'seerGo': closeSheet(); return go({ t: 'seer' });
      case 'seerGive': return go({ t: 'seerGive', uids: [...L.multi] });
      case 'nav': closeSheet(); return go({ t: 'nav', choice: v });
      case 'scholarGo': closeSheet(); return go({ t: 'scholar' });
      case 'lab': closeSheet(); return go({ t: 'lab', uid: el.dataset.uid });
      case 'again': closeSheet(); return ctx.again();
      case 'home': closeSheet(); return ctx.leave();
    }
  });
  root.addEventListener('dblclick', e => {
    const el = e.target.closest('.hand .card.playable');
    if (!el) return;
    L.sel = el.dataset.uid;
    render(L.view);
    $('[data-a="build"]', els.actions)?.click();
  });
  addEventListener('keydown', e => {
    if (!root.classList.contains('on') || e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const click = sel => { const b = root.querySelector(sel); if (b && !b.disabled) { b.click(); e.preventDefault(); } };
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (L.sheet === 'journeys') closeSheet(); else if (L.sheet) hideSheet(); else if (L.drawers.length) restoreSheet(); else els.top.classList.remove('emoting'); return; }
    if (els.wrap.classList.contains('open') && !['h', 'l'].includes(k)) {
      if (/^[1-9]$/.test(k)) click(`.sheet .ccard:nth-of-type(${k}), .sheet .cards-big > :nth-child(${k}) [data-a], .sheet .cards-big > .card:nth-child(${k})`);
      return;
    }
    if (L.drawers.some(d => BLOCKING.includes(d.sheet)) && !['h', 'l'].includes(k)) return;
    if (k === 'g') click('[data-a="gold"]');
    else if (k === 'd') click('[data-a="draw"]');
    else if (k === 'b') click('[data-a="build"]');
    else if (k === 'a') click('.actions .btn.ability');
    else if (k === 'e' || k === 'enter') click('[data-a="end"]');
    else if (k === 'h') showHint();
    else if (k === 'l') L.sheet === 'log' ? closeSheet() : openSheet('log');
    else if (/^[1-9]$/.test(k)) click(`.hand .card[data-k="${k}"]`);
  });

  // Hover previews and persistent click/tap details share the same content.
  function showTip(html, x, y, pinned = false) {
    if (L.tipPinned && !pinned) return;
    L.tipPinned = pinned;
    els.tip.innerHTML = (pinned ? `<button class="tip-close" data-tip-close aria-label="${esc(t('ui.close'))}">${svg('close')}</button>` : '') + html;
    els.tip.classList.toggle('pinned', pinned);
    els.tip.classList.add('on');
    els.tip.setAttribute('aria-hidden', 'false');
    const w = els.tip.offsetWidth, h = els.tip.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2));
    const top = Math.max(8, Math.min(innerHeight - h - 8, y - h - 14 < 8 ? y + 18 : y - h - 14));
    els.tip.style.transform = `translate(${left}px, ${top}px)`;
  }
  const hideTip = (force = false) => {
    if (L.tipPinned && !force) return;
    L.tipPinned = false;
    els.tip.classList.remove('on', 'pinned');
    els.tip.setAttribute('aria-hidden', 'true');
  };
  const cardTip = card => `<b>${esc(dname(card))}</b> <span class="muted">· ${t('col.' + card.color)} · ${t('ui.cost', { n: card.cost })}</span>${ddesc(card.id) ? `<p>${esc(ddesc(card.id))}</p>` : ''}`;
  const charTip = id => `<b style="color:${CHAR[id].color}">${ROMAN[CHAR[id].rank]} · ${esc(cname(id))}</b><p>${esc(cabil(id))}</p>`;
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const c = e.target.closest('.card[data-id]'), ch = e.target.closest('[data-char]:not(.ccard)');
    if (!c && !ch) return hideTip();
    const r = (c || ch).getBoundingClientRect();
    if (c) showTip(cardTip({ id: c.dataset.id, color: DIST[c.dataset.id][1], cost: DIST[c.dataset.id][0] }) + (c.dataset.why ? `<p class="warn">${esc(c.dataset.why)}</p>` : ''), r.left + r.width / 2, r.top);
    else showTip(charTip(+ch.dataset.char), r.left + r.width / 2, r.top);
  });
  // Capture the anchor before selection handlers replace card/character DOM.
  // Show after the click finishes, so touch pointer-out and re-renders can't erase it.
  document.addEventListener('click', e => {
    if (!root.classList.contains('on')) return;
    if (els.tip.contains(e.target)) {
      if (e.target.closest('[data-tip-close]')) hideTip(true);
      return;
    }
    const item = e.target.closest('.card[data-id], .board-building[data-id], [data-char]');
    if (!item || !(root.contains(item) || document.getElementById('board')?.contains(item))) return hideTip(true);
    const r = item.getBoundingClientRect();
    const html = item.dataset.char ? charTip(+item.dataset.char)
      : cardTip({ id: item.dataset.id, color: DIST[item.dataset.id][1], cost: DIST[item.dataset.id][0] })
        + (item.dataset.why ? `<p class="warn">${esc(item.dataset.why)}</p>` : '');
    queueMicrotask(() => { if (root.classList.contains('on')) showTip(html, r.left + r.width / 2, r.top, true); });
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && L.tipPinned) { hideTip(true); e.stopPropagation(); } }, true);
  root.addEventListener('pointerout', e => { if (!e.relatedTarget || !root.contains(e.relatedTarget)) hideTip(); });
  // Board picks
  function onPick(h) {
    if (!L.view || !h) return;
    const hiddenTargeting = !L.sheet && L.drawers.findLast(d => ['war', 'marshal'].includes(d.sheet));
    const targeting = L.sheet || hiddenTargeting?.sheet;
    if (['war', 'marshal'].includes(targeting) && h.card) {
      const tgt = warTargets(L.view, targeting === 'marshal').find(x => x.card.uid === h.card.uid && x.ok);
      if (tgt) {
        if (hiddenTargeting) openSheet(targeting);
        L.warSel = tgt.card.uid; sfx('click'); renderSheet(); return ctx.scene.highlight([tgt.card.uid]);
      }
    }
    // Building and character clicks show their details; headers inspect the city.
    if (h.card || h.charId) return;
    if (h.pid !== null && h.pid !== undefined) {
      L.inspect = h.pid;
      ctx.scene.focus(h.pid);
      openSheet('inspect');
    }
  }
  function onHover(h, x, y) {
    if (h?.card) showTip(cardTip(h.card), x, y);
    else if (h?.charId) showTip(charTip(h.charId), x, y);
    else hideTip();
  }

  return {
    render, event, frame, toast, onPick, onHover, showEmote,
    relang() { chrome(); if (L.view) render(L.view); },
    show() { root.classList.add('on'); insets(); },
    hide() { root.classList.remove('on'); L.sheet = null; L.drawers = []; els.drawer.hidden = true; L.log = []; L.shown = null; L.labelEls.forEach(el => el.remove()); L.labelEls.clear(); els.wrap.classList.remove('open'); hideTip(true); },
    resetLog() { L.log = []; L.evShown = undefined; L.shown = null; L.spySeen = null; },
  };
}
