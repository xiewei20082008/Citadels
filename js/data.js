// Static game data: characters, districts, deck factory. Pure — runs in node too.

export const COLORS = ['yellow', 'blue', 'green', 'red', 'purple'];

// Jewel-tone palette shared by the 3D scene and the HUD.
export const HUE = {
  yellow: '#e8b34a', blue: '#4f86d9', green: '#3fae7a', red: '#d2544a', purple: '#9a6ad8',
};

export const CHARS = [
  { id: 1, rank: 1, key: 'assassin', color: '#c25b5b' },
  { id: 2, rank: 2, key: 'thief', color: '#8fa3b8' },
  { id: 3, rank: 3, key: 'magician', color: '#9a6ad8' },
  { id: 4, rank: 4, key: 'king', color: '#e8b34a', crown: true, income: 'yellow' },
  { id: 5, rank: 5, key: 'bishop', color: '#4f86d9', income: 'blue' },
  { id: 6, rank: 6, key: 'merchant', color: '#3fae7a', income: 'green' },
  { id: 7, rank: 7, key: 'architect', color: '#d98a4e' },
  { id: 8, rank: 8, key: 'warlord', color: '#d2544a', income: 'red' },
  { id: 9, rank: 9, key: 'queen', color: '#e39bb0' },
  { id: 10, rank: 7, key: 'navigator', color: '#4aa3c9' },
  { id: 11, rank: 3, key: 'wizard', color: '#9a6ad8' },
  { id: 12, rank: 4, key: 'patrician', color: '#e8b34a', crown: true },
  { id: 13, rank: 5, key: 'abbot', color: '#4f86d9', income: 'blue' },
  { id: 14, rank: 7, key: 'scholar', color: '#d98a4e' },
  { id: 15, rank: 3, key: 'seer', color: '#9a6ad8' },
  { id: 16, rank: 6, key: 'trader', color: '#3fae7a', income: 'green' },
];
export const CHAR = Object.fromEntries(CHARS.map(c => [c.id, c]));

export const PRESETS = {
  classic: [1, 2, 3, 4, 5, 6, 7, 8],
  queen: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  expanded: [1, 2, 11, 12, 13, 6, 14, 8, 9],
  mixed: [1, 2, 15, 12, 13, 16, 10, 8, 9],
};

// id: [cost, color, copies]
export const DIST = {
  manor: [3, 'yellow', 3], castle: [4, 'yellow', 3], palace: [5, 'yellow', 2],
  temple: [1, 'blue', 3], church: [2, 'blue', 3], monastery: [3, 'blue', 3], cathedral: [5, 'blue', 2],
  tavern: [1, 'green', 3], market: [2, 'green', 3], trading_post: [2, 'green', 2], docks: [3, 'green', 2],
  harbor: [4, 'green', 2], town_hall: [5, 'green', 2],
  watchtower: [1, 'red', 3], prison: [2, 'red', 3], battlefield: [3, 'red', 2], fortress: [5, 'red', 2],
  haunted_city: [2, 'purple', 1], factory: [5, 'purple', 1], dragon_gate: [6, 'purple', 1],
  university: [6, 'purple', 1], thieves_den: [6, 'purple', 1], keep: [3, 'purple', 1],
  graveyard: [1, 'purple', 1], observatory: [5, 'purple', 1], smithy: [5, 'purple', 1],
  library: [6, 'purple', 1], school_of_magic: [6, 'purple', 1], wishing_well: [5, 'purple', 1],
  map_room: [5, 'purple', 1], secret_vault: [3, 'purple', 1], great_wall: [6, 'purple', 1],
  quarry: [5, 'purple', 1], basilica: [6, 'purple', 1], capitol: [5, 'purple', 1],
  ivory_tower: [3, 'purple', 1], laboratory: [5, 'purple', 1],
};
export const DIST_IDS = Object.keys(DIST);

export function makeDeck() {
  const deck = [];
  let n = 0;
  for (const [id, [cost, color, copies]] of Object.entries(DIST))
    for (let i = 0; i < copies; i++) deck.push({ uid: 'c' + n++, id, cost, color });
  return deck;
}

export const AVATARS = ['🦊', '🐺', '🦅', '🐉', '🦁', '🐻', '🦉', '🐍', '🦇', '🦚', '🐎', '🦌', '🐢', '🦋', '🐙', '🦈'];
export const AI_NAMES = {
  en: ['Lady Mira', 'Duke Arven', 'Baron Selt', 'Countess Vael', 'Lord Draven', 'Dame Isolde'],
  zh: ['米拉夫人', '阿尔文公爵', '塞尔特男爵', '维尔伯爵夫人', '德拉文勋爵', '伊索德女爵'],
  ja: ['ミラ夫人', 'アーヴェン公', 'セルト男爵', 'ヴェール伯爵夫人', 'ドレイヴン卿', 'イゾルデ女卿'],
  ko: ['미라 부인', '아르벤 공작', '셀트 남작', '베일 백작부인', '드레이븐 경', '이졸데 경'],
  es: ['Doña Mira', 'Duque Arven', 'Barón Selt', 'Condesa Vael', 'Lord Draven', 'Dama Isolda'],
  fr: ['Dame Mira', 'Duc Arven', 'Baron Selt', 'Comtesse Vael', 'Seigneur Draven', 'Dame Isolde'],
  'zh-TW': ['米拉夫人', '阿爾文公爵', '塞爾特男爵', '維爾伯爵夫人', '德拉文勳爵', '伊索德女爵'],
  de: ['Lady Mira', 'Herzog Arven', 'Baron Selt', 'Gräfin Vael', 'Fürst Draven', 'Dame Isolde'],
  pt: ['Dona Mira', 'Duque Arven', 'Barão Selt', 'Condessa Vael', 'Lorde Draven', 'Dama Isolda'],
  ru: ['Леди Мира', 'Герцог Арвен', 'Барон Сельт', 'Графиня Ваэль', 'Лорд Дрейвен', 'Дама Изольда'],
  it: ['Dama Mira', 'Duca Arven', 'Barone Selt', 'Contessa Vael', 'Lord Draven', 'Dama Isotta'],
};

// Heraldic colour per seat (flags on the table, label accents in the HUD).
export const SEAT_HUES = ['#e6bd6a', '#5aa9e6', '#e0645a', '#5cc28f', '#b07ae6', '#e88fbf', '#7fd1cf'];
