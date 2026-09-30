// 移行元: .claude/verify/scenarios/gen-engine.mjs（ブラウザ不要）
// engine-generate: シード再現・1000件の制約充足・予備マップ・fallback盤面の妥当性（Issue #68）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../js/engine-generate.js';
import { simulate, shortestSteps, shortestPath } from '../js/engine-grid.js';

const g = {
  grid: { cols: 5, rows: 5 },
  walls: { min: 3, max: 6 },
  shortestPath: { min: 5, max: 8 },
  minTurns: 2,
  wallsMustMatter: true,
  maxCommandsSlack: 2,
};
const turns = (c) => c.filter((x, i) => i > 0 && x !== c[i - 1]).length;

test('engine-generate: 同一シード再現・1000件が解けて制約充足・予備盤面(Issue #68)', () => {
  let sameSeed = true;
  for (let s = 0; s < 100; s += 1) {
    if (JSON.stringify(generateMap(g, s)) !== JSON.stringify(generateMap(g, s))) sameSeed = false;
  }
  const diff = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generateMap(g, s)))).size;
  let unsolved = 0, badRange = 0, badTurns = 0, decorative = 0, badMax = 0, fallbacks = 0, badOverlap = 0;
  for (let s = 0; s < 1000; s += 1) {
    const m = generateMap(g, s);
    if (m.fallback) fallbacks += 1;
    const res = simulate(m.solution, m);
    if (!(res.reachedGoal && res.blockedAt.length === 0)) unsolved += 1;
    if (m.solution.length < g.shortestPath.min || m.solution.length > g.shortestPath.max) badRange += 1;
    if (turns(m.solution) < g.minTurns) badTurns += 1;
    if (shortestSteps({ ...m, walls: [] }) >= m.solution.length) decorative += 1;
    if (m.maxCommands !== m.solution.length + g.maxCommandsSlack) badMax += 1;
    const keys = [m.start, m.goal, ...m.walls].map((p) => `${p.x},${p.y}`);
    if (new Set(keys).size !== keys.length || m.walls.length < g.walls.min || m.walls.length > g.walls.max) badOverlap += 1;
  }
  const impossible = generateMap({ ...g, shortestPath: { min: 50, max: 60 } }, 1);
  const fbRes = simulate(impossible.solution, impossible);
  const fb = [impossible.fallback, fbRes.reachedGoal, fbRes.blockedAt.length, shortestSteps(impossible) === impossible.solution.length, impossible.maxCommands >= impossible.solution.length];

  assert.equal(sameSeed, true, '同一シードで同一マップ（100シード）');
  assert.equal(diff >= 10, true, '異なるシードで盤面が変わる（20シード中10種以上）');
  assert.equal(unsolved, 0, '1000件すべてsolutionでクリアできる');
  assert.equal(badRange, 0, '最短手数が範囲内');
  assert.equal(badTurns, 0, '曲がり角がminTurns以上');
  assert.equal(decorative, 0, '飾りの壁が無い（壁を外すと短くなる）');
  assert.equal(badMax, 0, 'maxCommands＝最短手数＋slack');
  assert.equal(badOverlap, 0, '壁数が範囲内で座標重複なし');
  assert.equal(fallbacks, 0, '通常制約では予備盤面に落ちない');
  assert.deepEqual(fb, [true, true, 0, true, true], '満たせない制約では予備盤面が返り、解ける最短解を持つ');

  // Issue #142：曲がり角が最少の最短経路を返す（ジグザグ経路で判定しない）
  // Issue #143：wallsMustMatterでは壁0個の盤面を返さない
  const path = shortestPath({ grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [{ x: 0, y: 2 }], items: [] });
  let zeroWalls = 0;
  let strictOk = 0;
  for (let s = 0; s < 300; s += 1) {
    const m = generateMap({ ...g, walls: { min: 0, max: 2 } }, s);
    if (!m.fallback && m.walls.length === 0) zeroWalls += 1;
    const strict = generateMap({ ...g, minTurns: 2, shortestPath: { min: 4, max: 4 } }, s);
    if (strict.fallback || turns(strict.solution) >= 2) strictOk += 1;
  }
  assert.deepEqual([path.length, turns(path)], [4, 1], '最短経路は曲がり角最少（4手・曲がり角1）');
  assert.equal(zeroWalls, 0, 'walls.min=0でも壁0個の盤面は返らない');
  assert.equal(strictOk, 300, 'minTurns=2のsolutionは曲がり角2以上（最少経路で判定）');
});
