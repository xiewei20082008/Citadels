// Settings: one panel for language, sound, gameplay, display and your record, opened from the lobby
// corner and the in-game top bar. Preferences persist in localStorage; other modules read `prefs`.
import { t, getLang, setLang, LANGS } from './i18n.js?v=f9072509';
import { svg } from './icons.js?v=f9072509';
import { sfx, soundOn, setSound, musicEnabled, setMusic, volume, setVolume, TRACKS, musicTrack, setTrack } from './sfx.js?v=f9072509';

const KEY = 'c3d.settings';
const systemCalm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const DEFAULTS = { confirmEnd: true, turnAlert: true, tips: true, symbols: false, reduceMotion: systemCalm() };
export const prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

let ctx = null, root = null, opener = null, resetArmed = false, tipsReset = false;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Page-wide effects of the display preferences.
export function applyPrefs() {
  document.documentElement.classList.toggle('calm', prefs.reduceMotion);
  document.documentElement.classList.toggle('symbols', prefs.symbols);
  ctx?.scene.setCalm(prefs.reduceMotion);
}

// Browsers refuse (and log an error) to vibrate before the page has had a real tap.
export const vibrate = p => { if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(p); };

// "Your turn" nudges for when you're looking elsewhere: a flashing tab title, and a buzz on phones.
let flashTimer = null;
export function alertTurn() {
  if (!prefs.turnAlert) return;
  const away = document.hidden;
  if (away || ctx?.mode() !== 'solo') vibrate([90, 60, 90]);
  if (!away || flashTimer) return;
  const base = document.title;
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? '⚑ ' + t('ui.yourTurnTitle') : base; }, 900);
  document.addEventListener('visibilitychange', function stop() {
    if (document.hidden) return;
    clearInterval(flashTimer); flashTimer = null; document.title = base;
    document.removeEventListener('visibilitychange', stop);
  });
}

export function initSettings(c) { ctx = c; applyPrefs(); }

const sw = (key, on, label) =>
  `<button class="switch" role="switch" aria-checked="${on}" data-s="${key}" aria-label="${esc(label)}"><i></i></button>`;
const row = (label, control, cls = '') => `<div class="set-row ${cls}"><span>${label}</span><div class="set-ctl">${control}</div></div>`;
const seg = (act, items, cur) => `<div class="seg">${items.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-s="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
const slider = (kind, enabled) => `<input type="range" class="vol" min="0" max="100" step="5" value="${Math.round(volume(kind) * 100)}" style="--p:${Math.round(volume(kind) * 100)}%" data-s="vol" data-v="${kind}" aria-label="${esc(t(kind === 'sfx' ? 'set.sfx' : 'ui.music'))}" ${enabled ? '' : 'disabled'}>`;

function render() {
  const mode = ctx.mode(), st = ctx.stats(), lang = getLang();
  root.innerHTML = `<div id="settings-panel" class="set" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <div class="sh-head"><h2 id="set-title">${svg('gear')}${t('set.title')}</h2>
      <div class="sh-controls"><button class="btn small ghost" data-s="hide" aria-controls="settings-panel" aria-expanded="true">${t('ui.hidePopup')}</button><button class="icon-btn" data-s="close" aria-label="${t('ui.close')}">${svg('close')}</button></div></div>
    <div class="set-body">
      <section class="set-lang"><h4>${t('lb.lang')}</h4>
        <div class="lang-grid">${Object.entries(LANGS).map(([k, name]) =>
          `<button lang="${k}" class="${k === lang ? 'on' : ''}" aria-pressed="${k === lang}" data-s="lang" data-v="${k}">${name}</button>`).join('')}</div></section>
      <section><h4>${t('set.sound')}</h4>
        ${row(t('set.sfx'), sw('sound', soundOn(), t('set.sfx')) + slider('sfx', soundOn()))}
        ${row(t('ui.music'), sw('music', musicEnabled(), t('ui.music')) + slider('music', musicEnabled()))}
        <div class="track-grid" role="group" aria-label="${t('set.track')}">${Object.keys(TRACKS).map(k =>
          `<button class="${k === musicTrack() ? 'on' : ''}" aria-pressed="${k === musicTrack()}" data-s="track" data-v="${k}">${musicEnabled() && k === musicTrack() ? '♪ ' : ''}${t('set.track.' + k)}</button>`).join('')}</div>
      </section>
      <section><h4>${t('set.game')}</h4>
        ${mode === 'peer' ? '' : row(t('lb.speed'), seg('speed', ['slow', 'normal', 'fast'].map(k => [k, t('lb.' + k)]), ctx.getSpeed()))}
        ${row(t('set.confirmEnd'), sw('confirmEnd', prefs.confirmEnd, t('set.confirmEnd')))}
        ${row(t('set.turnAlert'), sw('turnAlert', prefs.turnAlert, t('set.turnAlert')))}
        ${row(t('set.tips'), (prefs.tips ? `<button class="btn small ghost" data-s="tipsReset" ${tipsReset ? 'disabled' : ''}>${t(tipsReset ? 'set.tipsAgain' : 'set.tipsReset')}</button>` : '') + sw('tips', prefs.tips, t('set.tips')))}
      </section>
      <section><h4>${t('set.display')}</h4>
        ${row(t('ui.quality'), seg('quality', ['high', 'low'].map(k => [k, t('ui.q.' + k)]), ctx.scene.quality))}
        ${row(t('set.motion'), sw('reduceMotion', prefs.reduceMotion, t('set.motion')))}
        ${row(t('set.symbols'), sw('symbols', prefs.symbols, t('set.symbols')))}
      </section>
      <section><h4>${t('set.record')}</h4>
        ${row(st?.g ? t('lb.stats', st) : t('set.noGames'), st?.g ? `<button class="btn small ${resetArmed ? 'danger' : 'ghost'}" data-s="resetStats">${t(resetArmed ? 'set.resetSure' : 'set.reset')}</button>` : '')}
      </section>
    </div>
    ${mode ? `<div class="sh-foot"><button class="btn danger" data-s="leave">${t('ui.leave')}</button></div>` : ''}
  </div><button class="btn sheet-drawer" data-s="show" aria-controls="settings-panel" aria-expanded="false" hidden>${t('ui.showPopup')} · ${t('set.title')}</button>`;
}

export function openSettings() {
  if (!root) {
    root = document.createElement('div');
    root.id = 'settings';
    root.className = 'set-wrap';
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', e => {
      if (e.target.dataset.s !== 'vol') return;
      setVolume(e.target.dataset.v, e.target.value / 100);
      e.target.style.setProperty('--p', e.target.value + '%');
    });
    root.addEventListener('change', e => { if (e.target.dataset.s === 'vol' && e.target.dataset.v === 'sfx') sfx('coin', 1); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('open')) { e.stopPropagation(); closeSettings(); } }, true);
  }
  opener = document.activeElement;
  resetArmed = false; tipsReset = false;
  render();
  root.classList.remove('collapsed');
  root.classList.add('open');
  root.querySelector('[data-s="close"]').focus({ preventScroll: true });
  sfx('click');
}
export function closeSettings() {
  if (!root?.classList.contains('open')) return;
  root.classList.remove('open', 'collapsed');
  opener?.focus?.({ preventScroll: true });
}

function onClick(e) {
  if (e.target === root) return closeSettings(); // backdrop
  const el = e.target.closest('[data-s]');
  if (!el || el.matches('input')) return;
  const s = el.dataset.s, v = el.dataset.v;
  sfx('click');
  switch (s) {
    case 'hide': case 'show': {
      const hidden = s === 'hide';
      root.classList.toggle('collapsed', hidden);
      root.querySelector('.set').inert = hidden;
      root.querySelector('[data-s="show"]').hidden = !hidden;
      root.querySelector(hidden ? '[data-s="show"]' : '[data-s="hide"]').focus({ preventScroll: true });
      return;
    }
    case 'close': return closeSettings();
    case 'leave': closeSettings(); return ctx.leave();
    case 'lang': setLang(v); ctx.relang(); break;
    case 'sound': setSound(!soundOn()); break;
    case 'music': setMusic(!musicEnabled()); break;
    case 'track': setTrack(v); if (!musicEnabled()) setMusic(true); break; // picking a track means 'play it'
    case 'speed': ctx.setSpeed(v); break;
    case 'quality': ctx.scene.setQuality(v, true); break;
    case 'tipsReset':
      try { Object.keys(localStorage).filter(k => k.startsWith('c3d.coach.')).forEach(k => localStorage.removeItem(k)); } catch {}
      tipsReset = true; break;
    case 'resetStats':
      if (!resetArmed) { resetArmed = true; break; }
      ctx.resetStats(); resetArmed = false; break;
    default: // the boolean switches
      if (s in prefs) { prefs[s] = !prefs[s]; save(); applyPrefs(); }
  }
  render();
  root.querySelector(`[data-s="${s}"]${v ? `[data-v="${v}"]` : ''}`)?.focus({ preventScroll: true });
}
