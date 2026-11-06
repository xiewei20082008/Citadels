// Run: node test/ai-duel.mjs [games] ['{"hard":{"leadDiv":4}}']
// Head-to-head: two "hard" vs two "normal" seats, rotated; prints hard's share of wins (fair = 50%).
import { createGame, act, viewFor, currentActor } from '../js/engine.js';
import { aiAction, safeAction, TUNE } from '../js/ai.js';
import { PRESETS } from '../js/data.js';

const N = +process.argv[2] || 1000;
const over = JSON.parse(process.argv[3] || '{}');
for (const [lvl, p] of Object.entries(over)) Object.assign(TUNE[lvl], p);
let hard = 0;
const sets = [PRESETS.classic, PRESETS.queen, PRESETS.expanded, PRESETS.mixed];
for (let g = 0; g < N; g++) {
  const levels = g % 2 ? ['hard', 'normal', 'hard', 'normal'] : ['normal', 'hard', 'normal', 'hard'];
  let s = createGame({ players: levels.map((l, i) => ({ name: l + i, ai: true })), chars: sets[g % 4], goal: 8, seed: 50000 + g });
  for (let k = 0; s.phase !== 'over' && k < 20000; k++) {
    const pid = currentActor(s), v = viewFor(s, pid);
    v.cfg = { ...v.cfg, level: levels[pid] };
    let n = act(s, pid, aiAction(v, pid));
    if (n.error) n = act(s, pid, safeAction(v, pid));
    s = n;
  }
  if (levels[s.winner] === 'hard') hard++;
}
const p = hard / N, se = Math.sqrt(p * (1 - p) / N);
console.log(`hard wins ${(100 * p).toFixed(1)}% ± ${(196 * se).toFixed(1)} (95%) over ${N} games ${process.argv[3] || ''}`);
