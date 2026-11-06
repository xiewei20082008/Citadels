// Tiny synthesized sound set (WebAudio, no files).
let ctx = null;
let on = (() => { try { return localStorage.getItem('c3d.sound') !== '0'; } catch { return true; } })();
export const soundOn = () => on;
export function setSound(v) { on = v; try { localStorage.setItem('c3d.sound', v ? '1' : '0'); } catch {} }
// Volumes 0–1 (settings panel). Effects go through one master gain; the defaults match the original mix.
const vols = (() => { try { return { sfx: 0.8, music: 0.6, ...JSON.parse(localStorage.getItem('c3d.vol')) }; } catch { return { sfx: 0.8, music: 0.6 }; } })();
const MUSIC_PEAK = v => 0.1 * v;
let bus = null;
export const volume = kind => vols[kind];
export function setVolume(kind, v) {
  vols[kind] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('c3d.vol', JSON.stringify(vols)); } catch {}
  if (bus && kind === 'sfx') bus.gain.setTargetAtTime(vols.sfx * 1.25, ctx.currentTime, 0.05);
  if (music && kind === 'music') music.out.gain.setTargetAtTime(Math.max(0.0001, MUSIC_PEAK(vols.music)), ctx.currentTime, 0.2);
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  if (!bus) { bus = ctx.createGain(); bus.gain.value = vols.sfx * 1.25; bus.connect(ctx.destination); }
  return ctx;
}
function tone(f, dur, { type = 'sine', gain = 0.12, slide = 0, delay = 0 } = {}) {
  const a = ac(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { gain = 0.1, freq = 1800, q = 1, type = 'bandpass', delay = 0 } = {}) {
  const a = ac(), t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
  src.connect(f).connect(g).connect(bus);
  src.start(t);
}

const S = {
  click: () => tone(1400, 0.05, { type: 'triangle', gain: 0.04 }),
  coin: (n = 2) => { for (let i = 0; i < Math.min(n, 5); i++) { tone(2100 + Math.random() * 600, 0.18, { type: 'triangle', gain: 0.05, delay: i * 0.07 }); tone(3200, 0.08, { gain: 0.02, delay: i * 0.07 }); } },
  card: (n = 1) => { for (let i = 0; i < Math.min(n, 4); i++) noise(0.09, { gain: 0.12, freq: 2600, q: 0.7, delay: i * 0.08 }); },
  build: () => { tone(110, 0.35, { slide: 0.5, gain: 0.22 }); noise(0.3, { gain: 0.08, freq: 500, type: 'lowpass', delay: 0.02 }); tone(880, 0.4, { gain: 0.03, delay: 0.25 }); },
  destroy: () => { noise(0.9, { gain: 0.22, freq: 380, type: 'lowpass' }); tone(70, 0.8, { slide: 0.5, gain: 0.25 }); },
  call: () => { tone(523, 1.4, { gain: 0.07 }); tone(784, 1.2, { gain: 0.05, delay: 0.02 }); tone(1046, 0.9, { gain: 0.03, delay: 0.04 }); },
  kill: () => { tone(220, 0.9, { type: 'sawtooth', gain: 0.04, slide: 0.6 }); tone(233, 0.9, { gain: 0.06, slide: 0.6 }); },
  turn: () => [659, 784, 988].forEach((f, i) => tone(f, 0.5, { gain: 0.07, delay: i * 0.11, type: 'triangle' })),
  crown: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.6, { gain: 0.05, delay: i * 0.06 })),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.7, { gain: 0.08, delay: i * 0.14, type: 'triangle' })),
};
export function sfx(name, arg) {
  if (!on) return;
  try { S[name]?.(arg); } catch { /* audio unavailable */ }
}

// ── generative score: four synthesized tracks, scheduled bar by bar on the audio clock ──
let musicOn = (() => { try { return localStorage.getItem('c3d.music') === '1'; } catch { return false; } })();
let music = null;
export const musicEnabled = () => musicOn;
export function setMusic(v) {
  musicOn = v;
  try { localStorage.setItem('c3d.music', v ? '1' : '0'); } catch {}
  v ? startMusic() : stopMusic();
}
const hz = m => 440 * 2 ** ((m - 69) / 12);
const pick = a => a[Math.floor(Math.random() * a.length)];

// One enveloped oscillator; `cutoff` adds a low-pass for softer saws and squares.
function voice(a, dest, f, t, dur, { peak = 0.1, type = 'sine', attack = 0.01, detune = 0, cutoff = 0 } = {}) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (cutoff) { const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; node = g.connect(lp); }
  node.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
let whiteBuf = null;
function hiss(a, dest, t, dur, { peak = 0.04, freq = 7000, type = 'highpass' } = {}) {
  if (!whiteBuf) {
    whiteBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = whiteBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = whiteBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + dur + 0.02);
}
function kick(a, dest, t, peak = 0.5) {
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
  g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(dest); o.start(t); o.stop(t + 0.35);
}

// Each track plays one bar at audio time t. `wet` runs through the echo, `dry` doesn't.
let mel = 3;
export const TRACKS = {
  candle: { // the original: modal string pads (Dm · C · Bb · A) and sparse plucks
    bar: 6.4, cutoff: 1400, echo: 0.42, feedback: 0.38,
    play(a, { wet }, i, t) {
      [[50, 57, 65, 69], [48, 55, 64, 67], [46, 53, 62, 65], [45, 52, 61, 64]][i % 4].forEach((m, k) =>
        voice(a, wet, hz(m), t + k * 0.08, 7.5, { peak: k ? 0.18 : 0.26, type: k % 2 ? 'triangle' : 'sine', attack: 2, detune: (Math.random() - 0.5) * 8 }));
      for (let b = 0; b < 8; b++) if (Math.random() < 0.65)
        voice(a, wet, hz(pick([62, 64, 65, 67, 69, 72, 74, 76, 77, 81])), t + b * 0.8 + 0.02, 1.6, { peak: 0.14, type: 'triangle', attack: 0.5 });
    },
  },
  garden: { // soft and slow: pentatonic piano-like notes over a warm drone (C · Am · F · G)
    bar: 8, cutoff: 2400, echo: 0.55, feedback: 0.45,
    play(a, { wet }, i, t) {
      const root = [36, 33, 29, 31][i % 4];
      voice(a, wet, hz(root + 12), t, 8.6, { peak: 0.12, attack: 2.5 });
      voice(a, wet, hz(root + 19), t + 0.3, 8.2, { peak: 0.05, attack: 3, type: 'triangle' });
      for (let at = 0.4 + Math.random(); at < 7.4; at += pick([0.75, 1, 1.5, 2])) {
        const f = hz(pick([60, 62, 64, 67, 69, 72, 74, 76, 79]));
        voice(a, wet, f, t + at, 3.2, { peak: 0.12, attack: 0.012 });
        voice(a, wet, f * 2, t + at, 1.1, { peak: 0.025, attack: 0.008, type: 'triangle' });
      }
    },
  },
  neon: { // electronic, ~100 bpm: soft four-on-the-floor, offbeat hats, saw bass, square arpeggio (Am · F · C · G)
    bar: 2.4, cutoff: 6000, echo: 0.45, feedback: 0.3,
    play(a, { wet, dry }, i, t) {
      const beat = 0.6, e = beat / 2, chord = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]][i % 4];
      for (let k = 0; k < 4; k++) kick(a, dry, t + k * beat, 0.45);
      for (let k = 0; k < 8; k++) hiss(a, dry, t + k * e, k % 2 ? 0.06 : 0.03, { peak: k % 2 ? 0.045 : 0.012 });
      [1, 3].forEach(k => hiss(a, dry, t + k * beat, 0.16, { peak: 0.05, freq: 1700, type: 'bandpass' }));
      for (let k = 0; k < 8; k++) voice(a, dry, hz(chord[0] - 24 + (k % 4 === 3 ? 12 : 0)), t + k * e, e * 0.9, { peak: 0.14, type: 'sawtooth', cutoff: 480 });
      const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((n, k) => chord[n] + (k >= 4 ? 24 : 12));
      arp.forEach((m, k) => voice(a, wet, hz(m), t + k * e, e * 0.8, { peak: 0.035, type: 'square', attack: 0.005, cutoff: 2400 }));
      chord.forEach((m, k) => voice(a, wet, hz(m), t, 2.6, { peak: 0.05, type: 'sawtooth', attack: 0.5, detune: (k - 1) * 8, cutoff: 1300 }));
    },
  },
  tavern: { // folk dance in 6/8: lute-like plucks wandering a D mixolydian tune (D · C · D · A)
    bar: 2.1, cutoff: 3400, echo: 0.35, feedback: 0.18,
    play(a, { wet, dry }, i, t) {
      const e = 0.35, root = [50, 48, 50, 45][i % 4], scale = [62, 64, 66, 67, 69, 71, 72, 74];
      voice(a, wet, hz(root - 12), t, 1, { peak: 0.15, type: 'triangle' });
      voice(a, wet, hz(root - 5), t + 3 * e, 1, { peak: 0.11, type: 'triangle' });
      for (const k of pick([[0, 2, 3, 5], [0, 1, 2, 3, 5], [0, 2, 3, 4, 5]])) {
        mel = Math.max(0, Math.min(scale.length - 1, mel + pick([-2, -1, 1, 1, 2])));
        voice(a, wet, hz(scale[mel]), t + k * e, 0.9, { peak: 0.1, type: 'triangle', attack: 0.005 });
        voice(a, wet, hz(scale[mel]) * 2, t + k * e, 0.3, { peak: 0.025, attack: 0.004 });
      }
      [0, 3].forEach(k => hiss(a, dry, t + k * e, 0.08, { peak: 0.025, freq: 6000 }));
    },
  },
};
let trackId = (() => { try { const v = localStorage.getItem('c3d.track'); return TRACKS[v] ? v : 'candle'; } catch { return 'candle'; } })();
export const musicTrack = () => trackId;
export function setTrack(id) {
  if (!TRACKS[id]) return;
  trackId = id;
  try { localStorage.setItem('c3d.track', id); } catch {}
  if (music) { stopMusic(); startMusic(); }
}

function startMusic() {
  if (music) return;
  const a = ac(), T = TRACKS[trackId];
  const out = a.createGain(), lp = a.createBiquadFilter(), wet = a.createGain(), dry = a.createGain(), echo = a.createDelay(), fb = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0001, MUSIC_PEAK(vols.music)), a.currentTime + 3);
  out.connect(a.destination);
  lp.type = 'lowpass'; lp.frequency.value = T.cutoff; lp.connect(out);
  dry.connect(out);
  echo.delayTime.value = T.echo; fb.gain.value = T.feedback;
  wet.connect(lp); wet.connect(echo); echo.connect(fb).connect(echo); echo.connect(lp);
  // look-ahead scheduler: bars are queued on the audio clock, so timer jitter never smears the rhythm
  let bar = 0, next = a.currentTime + 0.1;
  const tick = () => { while (next < a.currentTime + 0.8) { T.play(a, { wet, dry }, bar++, next); next += T.bar; } };
  tick();
  music = { out, timers: [setInterval(tick, 250)] };
}
function stopMusic() {
  if (!music) return;
  const m = music; music = null;
  m.timers.forEach(clearInterval);
  try { m.out.gain.cancelScheduledValues(0); m.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); } catch {}
  setTimeout(() => { try { m.out.disconnect(); } catch {} }, 2000);
}
// Browsers only allow audio after a gesture: resume the saved preference on the first tap.
addEventListener('pointerdown', () => { if (musicOn && !music) startMusic(); }, { once: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  document.hidden ? ctx.suspend() : ctx.resume();
});
