// Run: node test/ai-stats.mjs [games]
// Measures AI behaviour so "smart" is a number, not a feeling: targeting accuracy, hoarding,
// missed builds, repetitive picks and head-to-head win rates between levels.
import { createGame, act, viewFor, currentActor, rankOf, score, buildCost, canPlace } from '../js/engine.js';
import { aiAction, safeAction } from '../js/ai.js';
import { PRESETS, CHAR } from '../js/data.js';

const N = +process.argv[2] || 300;
const LEVELS = ['easy', 'normal', 'hard'];

function run(levels, seed, chars = PRESETS.classic, goal = 8) {
  const n = levels.length;
  let s = createGame({ players: levels.map((l, i) => ({ name: l + i, ai: true })), chars, goal, seed });
  const st = { kill: 0, killHit: 0, killLeader: 0, rob: 0, robHit: 0, stolen: 0, war: 0, warUsed: 0, warLeader: 0,
    turns: 0, gold: 0, draw: 0, missed: 0, firstPick: {}, killRank: {} };
  const lvlOf = pid => levels[pid];
  const by = {}; LEVELS.forEach(l => { by[l] = structuredClone(st); });
  const leader = (s, except) => s.players.filter(p => p.id !== except).sort((a, b) => score(s, b).total - score(s, a).total)[0];
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 20000) {
    const pid = currentActor(s);
    const level = lvlOf(pid);
    const v = viewFor(s, pid);
    v.cfg = { ...v.cfg, level };
    const a = aiAction(v, pid);
    const B = by[level];
    const before = s;
    if (a.t === 'pick' && s.draft.idx === 0) B.firstPick[CHAR[a.charId].key] = (B.firstPick[CHAR[a.charId].key] || 0) + 1;
    if (a.t === 'kill') {
      B.kill++; B.killRank[a.rank] = (B.killRank[a.rank] || 0) + 1;
      const h = s.players.find(p => p.chars.some(c => rankOf(c) === a.rank) && p.id !== pid);
      if (h) { B.killHit++; if (h.id === leader(s, pid).id) B.killLeader++; }
    }
    if (a.t === 'rob') {
      B.rob++;
      const h = s.players.find(p => p.chars.some(c => rankOf(c) === a.rank) && p.id !== pid);
      if (h && s.killed !== a.rank) B.robHit++;
    }
    if (a.t === 'destroy') { B.warUsed++; if (a.target === leader(s, pid).id) B.warLeader++; }
    if (a.t === 'gold') B.gold++;
    if (a.t === 'draw') B.draw++;
    if (a.t === 'end' && s.turn) {
      B.turns++;
      if (CHAR[s.turn.charId].key === 'warlord') B.war++;
      const me = s.players[pid];
      const T = s.turn;
      if (T.built < T.max && me.hand.some(c => canPlace(me, c) && buildCost(me, c) <= me.gold)) B.missed++;
    }
    let next = act(s, pid, a);
    if (next.error) next = act(s, pid, safeAction(v, pid));
    for (const e of next.ev.filter(e => e.id > before.evSeq)) if (e.k === 'robbed') by[lvlOf(e.to)].stolen += e.n;
    s = next;
  }
  const order = [...s.scores].sort((a, b) => b.total - a.total);
  return { by, winner: lvlOf(s.winner), gold: s.players.map(p => [lvlOf(p.id), p.gold]), rounds: s.round, top: order[0].total };
}

const agg = {}; LEVELS.forEach(l => { agg[l] = { wins: 0, seats: 0, endGold: 0, k: null }; });
let rounds = 0, top = 0;
for (let g = 0; g < N; g++) {
  // rotate a mixed table so every level sits in every seat
  const n = 3 + (g % 4);
  const levels = Array.from({ length: n }, (_, i) => LEVELS[(i + g) % 3]);
  const r = run(levels, 1000 + g);
  rounds += r.rounds; top += r.top;
  agg[r.winner].wins++;
  levels.forEach(l => agg[l].seats++);
  r.gold.forEach(([l, gold]) => { agg[l].endGold += gold; });
  for (const l of LEVELS) {
    if (!agg[l].k) { agg[l].k = r.by[l]; continue; }
    const k = agg[l].k, b = r.by[l];
    for (const key of Object.keys(b)) {
      if (typeof b[key] === 'number') k[key] += b[key];
      else for (const [x, y] of Object.entries(b[key])) k[key][x] = (k[key][x] || 0) + y;
    }
  }
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '—');
console.log(`${N} mixed games · avg ${(rounds / N).toFixed(1)} rounds · avg winning score ${(top / N).toFixed(1)}\n`);
for (const l of LEVELS) {
  const A = agg[l], k = A.k;
  const share = A.wins / N, fair = A.seats / (N * 4.5 / 1); // seats per game avg 4.5
  console.log(`${l.padEnd(7)} win ${pct(A.wins, N)} (fair share ${pct(A.seats / 4.5, N)})  end gold/seat ${(A.endGold / A.seats).toFixed(1)}`);
  console.log(`        assassin hit ${pct(k.killHit, k.kill)} · on leader ${pct(k.killLeader, k.kill)} · thief hit ${pct(k.robHit, k.rob)} · stolen/rob ${(k.stolen / (k.rob || 1)).toFixed(1)}`);
  console.log(`        warlord destroys ${pct(k.warUsed, k.war)} · on leader ${pct(k.warLeader, k.warUsed)} · income gold ${pct(k.gold, k.gold + k.draw)} · missed builds ${pct(k.missed, k.turns)}`);
  console.log(`        kill ranks ${JSON.stringify(k.killRank)}  first picks ${JSON.stringify(k.firstPick)}`);
}
