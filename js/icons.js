// Hand-drawn line emblems (48×48, stroke = currentColor). Used in the HUD and baked into 3D tokens.

const C = {
  assassin: '<path d="M24 4l4 21h-8z"/><path d="M14 27h20"/><path d="M24 27v11"/><circle cx="24" cy="41" r="2.6"/>',
  thief: '<path d="M5 20c6-5 13-5 19 0 6-5 13-5 19 0 0 8-5 12-10 12-4 0-6-3-9-5-3 2-5 5-9 5-5 0-10-4-10-12z"/><ellipse cx="15" cy="22.5" rx="3.5" ry="2"/><ellipse cx="33" cy="22.5" rx="3.5" ry="2"/>',
  magician: '<path d="M9 39l22-22"/><path d="M35 5l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M14 10v4M12 12h4M40 30v4M38 32h4"/>',
  king: '<path d="M8 34L6 14l10 8 8-12 8 12 10-8-2 20z"/><path d="M8 40h32"/><circle cx="24" cy="28" r="2"/><circle cx="15" cy="29" r="1.4"/><circle cx="33" cy="29" r="1.4"/>',
  bishop: '<path d="M14 42V21c0-8 10-15 10-15s10 7 10 15v21z"/><path d="M24 17v14M19 22h10"/><path d="M14 36h20"/>',
  merchant: '<path d="M24 8v32M16 40h16M9 14h30"/><path d="M9 14L4 26h10zM39 14l-5 12h10z"/><path d="M4 26q5 6 10 0M34 26q5 6 10 0"/>',
  architect: '<circle cx="24" cy="9" r="3"/><path d="M22.5 11.5L12 41M25.5 11.5L36 41"/><path d="M15 30q9 5 18 0"/>',
  warlord: '<path d="M10 10l24 24M38 10L14 34"/><path d="M30 38l8-8M10 30l8 8"/><path d="M35 35l5 5M13 35l-5 5"/>',
  queen: '<path d="M8 33c6-10 12-6 16-19 4 13 10 9 16 19z"/><path d="M8 39h32"/><circle cx="24" cy="10" r="2.5"/><circle cx="24" cy="28" r="1.6"/>',
  navigator: '<circle cx="24" cy="9" r="3.5"/><path d="M24 12.5V42M16 20h16"/><path d="M8 30c0 8 8 12 16 12s16-4 16-12"/><path d="M5 33l3-3 3 3M37 33l3-3 3 3"/>',
  wizard: '<circle cx="24" cy="21" r="12"/><path d="M14 42l4-8h12l4 8z"/><path d="M18 17a7 7 0 0 1 6-5"/>',
  patrician: '<path d="M16 4l6 15M32 4l-6 15"/><circle cx="24" cy="30" r="10"/><path d="M24 24l1.8 3.8 4 .4-3 2.8.8 4-3.6-2-3.6 2 .8-4-3-2.8 4-.4z"/>',
  abbot: '<path d="M24 7v5"/><path d="M14 34c0-14 4-22 10-22s10 8 10 22z"/><path d="M10 34h28"/><circle cx="24" cy="38.5" r="2.6"/>',
  scholar: '<path d="M24 12c-6-4-14-4-18-2v28c4-2 12-2 18 2 6-4 14-4 18-2V10c-4-2-12-2-18 2z"/><path d="M24 12v28"/><path d="M11 17h7M11 23h7M30 17h7M30 23h7"/>',
  seer: '<path d="M4 24c6-10 14-14 20-14s14 4 20 14c-6 10-14 14-20 14S10 34 4 24z"/><circle cx="24" cy="24" r="6.5"/><circle cx="24" cy="24" r="2" fill="currentColor"/>',
  trader: '<ellipse cx="17" cy="14" rx="9" ry="3.5"/><path d="M8 14v6c0 2 4 3.5 9 3.5s9-1.5 9-3.5v-6"/><ellipse cx="31" cy="28" rx="9" ry="3.5"/><path d="M22 28v8c0 2 4 3.5 9 3.5s9-1.5 9-3.5v-8"/><path d="M8 20v8c0 2 4 3.5 9 3.5"/>',
};

const UI = {
  gold: '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="10"/><path d="M24 18v12M20 22l4-4 4 4"/>',
  card: '<rect x="12" y="8" width="24" height="32" rx="3"/><path d="M18 16h12M18 22h12M18 28h7"/>',
  crown: C.king,
  build: '<path d="M8 40h32M12 40V22l12-10 12 10v18"/><path d="M20 40V30h8v10"/>',
  draw: '<rect x="8" y="12" width="18" height="26" rx="2.5"/><rect x="22" y="8" width="18" height="26" rx="2.5"/>',
  end: '<path d="M10 24h26M28 14l10 10-10 10"/>',
  log: '<path d="M12 10h24M12 18h24M12 26h24M12 34h16"/>',
  help: '<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 7 4.5c-1.5.8-2 1.8-2 3.5"/><circle cx="24" cy="33" r="1" fill="currentColor"/>',
  sound: '<path d="M8 19h7l9-7v24l-9-7H8z"/><path d="M31 18a8 8 0 0 1 0 12M35 13a14 14 0 0 1 0 22"/>',
  mute: '<path d="M8 19h7l9-7v24l-9-7H8z"/><path d="M31 19l10 10M41 19L31 29"/>',
  lang: '<circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c6 6 6 28 0 34M24 7c-6 6-6 28 0 34"/>',
  close: '<path d="M13 13l22 22M35 13L13 35"/>',
  gear: '<circle cx="24" cy="24" r="6"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2"/><circle cx="24" cy="24" r="13"/>',
  menu: '<path d="M10 14h28M10 24h28M10 34h28"/>',
  skull: '<path d="M12 30v-8a12 12 0 0 1 24 0v8l-4 2v6H16v-6z"/><circle cx="19" cy="24" r="3"/><circle cx="29" cy="24" r="3"/><path d="M22 38v-3M26 38v-3"/>',
  eye: C.seer,
  focus: '<path d="M8 16V8h8M32 8h8v8M40 32v8h-8M16 40H8v-8"/><circle cx="24" cy="24" r="5"/>',
  smithy: '<path d="M8 30h22l6-8H14z"/><path d="M18 30v6h10v-6"/><path d="M12 40h22"/>',
  lab: '<path d="M19 8h10M21 8v12L11 38a2 2 0 0 0 2 3h22a2 2 0 0 0 2-3L27 20V8"/><path d="M15 30h18"/>',
  trophy: '<path d="M16 8h16v10a8 8 0 0 1-16 0z"/><path d="M16 12H9c0 6 3 9 7 9M32 12h7c0 6-3 9-7 9"/><path d="M24 26v8M17 40h14M19 34h10"/>',
  users: '<circle cx="18" cy="17" r="6"/><path d="M6 38c0-7 5-12 12-12s12 5 12 12"/><circle cx="33" cy="15" r="5"/><path d="M33 25c6 0 9 4 9 10"/>',
  link: '<path d="M20 28l8-8"/><path d="M22 14l4-4a7 7 0 0 1 10 10l-4 4M26 34l-4 4a7 7 0 0 1-10-10l4-4"/>',
  play: '<path d="M16 10l22 14-22 14z"/>',
  back: '<path d="M30 10L16 24l14 14"/>',
  copy: '<rect x="16" y="16" width="22" height="24" rx="3"/><path d="M10 32V11a3 3 0 0 1 3-3h17"/>',
  plus: '<path d="M24 10v28M10 24h28"/>',
  minus: '<path d="M10 24h28"/>',
};

export function svg(name, cls = 'ico') {
  const body = C[name] || UI[name] || '';
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// Character emblem as an <img>-able data URL in a given colour (for canvas textures).
export function emblemURL(key, color, stroke = 2.4) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="256" height="256" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" color="${color}">${C[key]}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
