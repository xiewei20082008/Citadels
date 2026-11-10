// Lobby screens: home, solo setup, host room, join room, waiting room.
import { CHAR, PRESETS, AVATARS } from './data.js?v=a295c9dc';
import { t, cname, cabil, getLang, RULES } from './i18n.js?v=a295c9dc';
import { svg, ROMAN } from './icons.js?v=a295c9dc';
import { sfx } from './sfx.js?v=a295c9dc';
import { tutorialSeen } from './tutorial.js?v=a295c9dc';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RANK_OPTS = { 1: [1, 17], 2: [2, 18], 3: [3, 11, 15], 4: [4, 12], 5: [5, 13], 6: [6, 16], 7: [7, 10, 14], 8: [8, 20], 9: [9, 19, 0] };

function load() {
  try { return JSON.parse(localStorage.getItem('c3d.prefs')) || {}; } catch { return {}; }
}
export function createLobby(ctx) {
  const root = $('#lobby');
  const saved = load();
  const L = {
    screen: 'home', error: null, info: null,
    name: saved.name || '', avatar: saved.avatar || AVATARS[0],
    opp: saved.opp || 3, chars: saved.chars || PRESETS.classic, goal: saved.goal || 8, level: 'hard', timer: saved.timer || 0,
    code: '', seats: [], roomCode: '', copied: false,
  };
  const persist = () => { try { localStorage.setItem('c3d.prefs', JSON.stringify({ name: L.name, avatar: L.avatar, opp: L.opp, chars: L.chars, goal: L.goal, level: L.level, timer: L.timer })); } catch {} };
  const presetOf = chars => Object.keys(PRESETS).find(k => [...PRESETS[k]].sort().join() === [...chars].sort().join()) || 'custom';
  const myName = () => L.name.trim() || t('lb.defaultName');

  const identity = () => `
    <label class="field"><span>${t('lb.name')}</span><input id="lb-name" maxlength="16" value="${esc(L.name)}" placeholder="${t('ui.you')}" autocomplete="nickname"></label>
    <div class="field"><span>${t('lb.avatar')}</span><div class="avatars">${AVATARS.map(a => `<button class="${a === L.avatar ? 'on' : ''}" data-a="avatar" data-v="${a}">${a}</button>`).join('')}</div></div>`;

  const charSetup = () => {
    const preset = presetOf(L.chars);
    return `<div class="field"><span>${t('lb.chars')}</span>
      <div class="seg wrap">${[...Object.keys(PRESETS), 'custom'].map(k => `<button class="${preset === k ? 'on' : ''}" data-a="preset" data-v="${k}">${t('lb.preset.' + k)}</button>`).join('')}</div>
      <div class="ranks ${preset === 'custom' || L.custom ? 'open' : ''}">${Object.entries(RANK_OPTS).map(([r, ids]) => {
        const cur = L.chars.find(c => CHAR[c].rank === +r) || 0;
        return `<div class="rank-row"><span class="rk">${ROMAN[r]}</span><div class="seg">${ids.map(id => id ? `<button class="${cur === id ? 'on' : ''}" style="--cc:${CHAR[id].color}" data-a="rankpick" data-r="${r}" data-v="${id}" title="${esc(cabil(id))}">${svg(CHAR[id].key)}${esc(cname(id))}</button>`
          : `<button class="${cur === 0 ? 'on' : ''}" data-a="rankpick" data-r="${r}" data-v="0">—</button>`).join('')}</div></div>`;
      }).join('')}</div>
      <p class="note left">${t('lb.presetDesc.' + preset)}</p>
      <div class="strip">${[...L.chars].sort((a, b) => CHAR[a].rank - CHAR[b].rank).map(id => `<span class="chip named" style="--cc:${CHAR[id].color}" title="${esc(cabil(id))}">${svg(CHAR[id].key)}<b>${ROMAN[CHAR[id].rank]}</b>${esc(cname(id))}</span>`).join('')}
        <button class="link" data-a="custom">${t('lb.preset.custom')} ▾</button></div></div>
    <div class="field row"><span>${t('lb.goal')}</span><div class="seg">${[7, 8].map(g => `<button class="${L.goal === g ? 'on' : ''}" data-a="goal" data-v="${g}">${g}</button>`).join('')}</div></div>
    <div class="field row"><span>${t('lb.level')}</span><span>${t('lb.lvl.hard')}</span></div>
    <p class="note left lvl-note">${t('lb.lvlDesc.hard')}</p>`;
  };
  const timerSetup = () => `<div class="field row"><span>${t('lb.timer')}</span><div class="seg">${[0, 60, 120].map(s => `<button class="${L.timer === s ? 'on' : ''}" data-a="timer" data-v="${s}">${s ? s + 's' : t('lb.off')}</button>`).join('')}</div></div>`;

  const seatsList = (host) => `<ol class="seats">${L.seats.map((s, i) => `<li>${`<span class="av">${esc(s.avatar)}</span>`}<span class="nm">${esc(s.name)}</span>
      <span class="tag">${i === 0 ? t('lb.host.you') : s.ai ? t('lb.ai') : t('lb.human')}</span>
      ${host && i > 0 ? `<button class="icon-btn sm" data-a="removeSeat" data-v="${i}" title="${t('lb.removeAI')}">${svg('close')}</button>` : ''}</li>`).join('')}</ol>`;

  function render() {
    let body = '';
    const err = L.error ? `<p class="err">${esc(L.error)}</p>` : '';
    const back = `<button class="link back" data-a="go" data-v="home">${svg('back')}${t('lb.back')}</button>`;
    switch (L.screen) {
      case 'home': {
        const cont = ctx.canContinue(), newcomer = !tutorialSeen() && !ctx.stats?.()?.g && !cont;
        body = `<div class="hero"><div class="crest">${svg('crown')}</div><h1>${t('lb.title')}</h1><p class="tag">${t('lb.tag')}</p>${ctx.stats?.()?.g ? `<p class="record">${svg('trophy')}${t('lb.stats', ctx.stats())}</p>` : ''}</div>
          ${err}
          <nav class="menu">
            ${cont ? `<button class="btn primary big" data-a="continue">${svg('play')}<span>${t('lb.continue')}</span><small>${esc(cont)}</small></button>` : ''}
            ${newcomer ? `<button class="btn primary big" data-a="tutorial">${svg('help')}<span>${t('tut.start')}</span><small>${t('tut.pitch')}</small></button>` : ''}
            <button class="btn ${cont || newcomer ? '' : 'primary'} big" data-a="go" data-v="solo">${svg('users')}<span>${t('lb.solo')}</span></button>
            <button class="btn big" data-a="go" data-v="host">${svg('link')}<span>${t('lb.host')}</span></button>
            <button class="btn big" data-a="go" data-v="join">${svg('end')}<span>${t('lb.join')}</span></button>
            <div class="menu-links"><button class="btn ghost" data-a="go" data-v="rules">${svg('help')}<span>${t('lb.rules')}</span></button>
            ${newcomer ? '' : `<button class="btn ghost" data-a="tutorial">${svg('play')}<span>${t('tut.start')}</span></button>`}</div>
          </nav>`;
        break;
      }
      case 'solo':
        body = `${back}<h2>${t('lb.solo')}</h2>${err}${identity()}
          <div class="field row"><span>${t('lb.opponents')}</span><div class="stepper"><button data-a="opp" data-v="-1">${svg('minus')}</button><b>${L.opp}</b><button data-a="opp" data-v="1">${svg('plus')}</button></div></div>
          ${charSetup()}
          <button class="btn primary big wide" data-a="startSolo">${svg('play')}<span>${t('lb.start')}</span></button>`;
        break;
      case 'host':
        body = `${back}<h2>${t('lb.host')}</h2>${err}${identity()}${charSetup()}${timerSetup()}
          <button class="btn primary big wide" data-a="createRoom">${svg('link')}<span>${t('lb.host')}</span></button>`;
        break;
      case 'room':
        body = `${back}<h2>${t('lb.host')}</h2>${err}
          <div class="code-box"><span>${t('lb.roomCode')}</span><b>${esc(L.roomCode)}</b><button class="btn small" data-a="copy">${svg('copy')}${t(L.copied ? 'lb.copied' : 'lb.copy')}</button></div>
          <p class="note">${t('lb.share')}</p>
          <div class="field"><span>${t('lb.seats')} · ${L.seats.length}/7 <span class="muted">(${t('lb.minPlayers')})</span></span>${seatsList(true)}
          <button class="btn small" data-a="addAI" ${L.seats.length >= 7 ? 'disabled' : ''}>${svg('plus')}${t('lb.addAI')}</button></div>
          <button class="btn primary big wide" data-a="startHost" ${L.seats.length >= 2 ? '' : 'disabled'}>${svg('play')}<span>${t('lb.start')}</span></button>`;
        break;
      case 'join':
        body = `${back}<h2>${t('lb.join')}</h2>${err}${identity()}
          <label class="field"><span>${t('lb.code')}</span><input id="lb-code" class="code-in" maxlength="6" value="${esc(L.code)}" placeholder="ABC123" autocapitalize="characters" autocomplete="off"></label>
          <button class="btn primary big wide" data-a="joinRoom">${svg('end')}<span>${t('lb.joinGo')}</span></button>`;
        break;
      case 'wait':
        body = `${back}<h2>${esc(L.roomCode)}</h2>${err}<p class="note pulse">${t('lb.waitingHost')}</p>${seatsList(false)}`;
        break;
      case 'connecting':
        body = `<div class="spinner"></div><p class="note pulse">${esc(L.info || t('lb.connecting'))}</p>${back}`;
        break;
      case 'rules':
        body = `${back}<h2>${t('lb.rules')}</h2><div class="rules">${RULES[getLang()].replace('{goal}', L.goal)}</div>
          <div class="charlist">${Object.values(CHAR).sort((a, b) => a.rank - b.rank || a.id - b.id).map(c => `<div class="cl" style="--cc:${c.color}">${svg(c.key)}<div><b>${ROMAN[c.rank]} · ${esc(cname(c.id))}</b><p>${esc(cabil(c.id))}</p></div></div>`).join('')}</div>`;
        break;
    }
    root.innerHTML = `<div class="lb-panel ${L.screen}">${body}</div>
      <div class="lb-corner"><button class="icon-btn labelled" data-a="settings">${svg('gear')}<span>${t('set.title')}</span></button></div>`;
  }

  const readFields = () => {
    const n = $('#lb-name', root), c = $('#lb-code', root);
    if (n) L.name = n.value;
    if (c) L.code = c.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  root.addEventListener('input', e => { if (e.target.id === 'lb-code') e.target.value = e.target.value.toUpperCase(); });
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    readFields();
    const a = el.dataset.a, v = el.dataset.v;
    sfx('click');
    switch (a) {
      case 'go': L.error = null; if (L.screen === 'room' || L.screen === 'wait' || L.screen === 'connecting') ctx.cancelNet(); L.screen = v; break;
      case 'avatar': L.avatar = v; break;
      case 'opp': L.opp = Math.max(1, Math.min(6, L.opp + +v)); break;
      case 'preset': if (v === 'custom') L.custom = true; else { L.chars = [...PRESETS[v]]; L.custom = false; } break;
      case 'custom': L.custom = !L.custom; break;
      case 'rankpick': { const r = +el.dataset.r; L.chars = L.chars.filter(c => CHAR[c].rank !== r); if (+v) L.chars.push(+v); L.custom = true; break; }
      case 'goal': L.goal = +v; break;
      case 'settings': return ctx.openSettings();
      case 'tutorial': persist(); return ctx.startTutorial({ name: myName(), avatar: L.avatar });
      case 'timer': L.timer = +v; break;
      case 'continue': return ctx.cont();
      case 'startSolo': persist(); return ctx.startSolo({ name: myName(), avatar: L.avatar, opp: L.opp, chars: L.chars, goal: L.goal, level: L.level });
      case 'createRoom': persist(); return ctx.createRoom({ name: myName(), avatar: L.avatar, chars: L.chars, goal: L.goal, level: L.level, timer: L.timer });
      case 'copy': navigator.clipboard?.writeText(L.roomCode); L.copied = true; setTimeout(() => { L.copied = false; render(); }, 1500); break;
      case 'addAI': ctx.addAI(); return;
      case 'removeSeat': ctx.removeSeat(+v); return;
      case 'startHost': return ctx.startHost();
      case 'joinRoom':
        persist();
        if (L.code.length < 4) return;
        return ctx.joinRoom({ code: L.code, name: myName(), avatar: L.avatar });
    }
    render();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'lb-code') { readFields(); $('[data-a="joinRoom"]', root)?.click(); }
  });

  return {
    show(screen, patch = {}) { Object.assign(L, patch); if (screen) L.screen = screen; root.classList.add('on'); render(); },
    hide() { root.classList.remove('on'); },
    update(patch) { Object.assign(L, patch); if (root.classList.contains('on')) render(); },
    render,
    get screen() { return L.screen; },
  };
}
