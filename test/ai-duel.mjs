// Run: node test/ai-duel.mjs [games] ['{"leadDiv":4}']
// Head-to-head: tuned Cunning vs baseline Cunning, rotated (fair = 50%).
import { createGame, act, viewFor, currentActor } from '../js/engine.js';
import { aiAction, safeAction, TUNE } from '../js/ai.js';
import { PRESETS } from '../js/data.js';

const N = +process.argv[2] || 1000;
const over = JSON.parse(process.argv[3] || '{}');
const baseline = { ...TUNE };
let tunedWins = 0;
const sets = [PRESETS.classic, PRESETS.queen, PRESETS.expanded, PRESETS.mixed];
for (let g = 0; g < N; g++) {
  const levels = g % 2 ? ['tuned', 'baseline', 'tuned', 'baseline'] : ['baseline', 'tuned', 'baseline', 'tuned'];
  let s = createGame({ players: levels.map((l, i) => ({ name: l + i, ai: true })), chars: sets[g % 4], goal: 8, seed: 50000 + g });
  for (let k = 0; s.phase !== 'over' && k < 20000; k++) {
    const pid = currentActor(s), v = viewFor(s, pid);
    Object.assign(TUNE, baseline, levels[pid] === 'tuned' ? over : {});
    let n = act(s, pid, aiAction(v, pid));
    if (n.error) n = act(s, pid, safeAction(v, pid));
    s = n;
  }
  if (levels[s.winner] === 'tuned') tunedWins++;
}
const p = tunedWins / N, se = Math.sqrt(p * (1 - p) / N);
console.log(`tuned Cunning wins ${(100 * p).toFixed(1)}% ± ${(196 * se).toFixed(1)} (95%) over ${N} games ${process.argv[3] || ''}`);
