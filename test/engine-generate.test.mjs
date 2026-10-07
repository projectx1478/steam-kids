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
// 手元の短縮用（Issue #315）：GENERATE_SEEDS（正の整数）で1000シードのテストの回数を減らす。上限1000・不正/未設定は1000。
const positiveIntOr = (v, d) => (/^[1-9]\d*$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : d);
const seedCount = Math.min(1000, positiveIntOr(process.env.GENERATE_SEEDS, 1000));
const turns = (c) => c.filter((x, i) => i > 0 && x !== c[i - 1]).length;

test('engine-generate: 同一シード再現・1000件が解けて制約充足・予備盤面(Issue #68)', () => {
  let sameSeed = true;
  for (let s = 0; s < 100; s += 1) {
    if (JSON.stringify(generateMap(g, s)) !== JSON.stringify(generateMap(g, s))) sameSeed = false;
  }
  const diff = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generateMap(g, s)))).size;
  let unsolved = 0, badRange = 0, badTurns = 0, decorative = 0, badMax = 0, fallbacks = 0, badOverlap = 0;
  for (let s = 0; s < seedCount; s += 1) {
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
  assert.equal(unsolved, 0, `${seedCount}件すべてsolutionでクリアできる`);
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

// R3（Issue #70）：generatorのギミック対応。個別ギミックは1000シード・複合は300シードで、
// 解け制約・個数範囲・座標重複なし・同一シード再現・解法関与（ギミックを除いた盤面との
// 最短手数比較）を検証する。解法関与の比較方向はitems/keys＝「外すと短くなる」、ice＝「手数が変わる」。
const G6 = { cols: 6, rows: 6 };
const r3 = {
  walls: { min: 2, max: 4 },
  shortestPath: { min: 5, max: 14 },
  minTurns: 1,
  wallsMustMatter: true,
  maxCommandsSlack: 2,
};
const stripItems = (m) => ({ ...m, items: [] });
const stripIce = (m) => ({ ...m, ice: [] });
const stripKeys = (m) => ({ ...m, keys: [], doors: [] });
const allPoints = (m) => [m.start, m.goal, ...m.walls, ...(m.items ?? []), ...(m.ice ?? []), ...(m.keys ?? []), ...(m.doors ?? [])];
const hasOverlap = (m) => new Set(allPoints(m).map((p) => `${p.x},${p.y}`)).size !== allPoints(m).length;

test('engine-generate: ギミック未指定のgeneratorはR1と同一シードで同一マップ（Issue #70）', () => {
  // ゴールデン固定：R3改修前の出力。ギミック未指定ではrng消費も返り値も変えないことを直接確認する
  const golden = {
    0: '{"grid":{"cols":5,"rows":5},"start":{"x":4,"y":0},"goal":{"x":0,"y":0},"walls":[{"x":1,"y":2},{"x":1,"y":0},{"x":1,"y":4},{"x":0,"y":3}],"items":[],"allowedCommands":["up","down","left","right"],"solution":["down","left","left","left","left","up"],"maxCommands":8,"fallback":false}',
    1: '{"grid":{"cols":5,"rows":5},"start":{"x":0,"y":3},"goal":{"x":4,"y":4},"walls":[{"x":3,"y":0},{"x":0,"y":2},{"x":2,"y":3},{"x":1,"y":4},{"x":0,"y":4},{"x":4,"y":0}],"items":[],"allowedCommands":["up","down","left","right"],"solution":["right","up","right","right","right","down","down"],"maxCommands":9,"fallback":false}',
    7: '{"grid":{"cols":5,"rows":5},"start":{"x":0,"y":3},"goal":{"x":1,"y":4},"walls":[{"x":3,"y":4},{"x":3,"y":3},{"x":0,"y":4},{"x":1,"y":3},{"x":4,"y":2},{"x":4,"y":0}],"items":[],"allowedCommands":["up","down","left","right"],"solution":["up","right","right","down","down","left"],"maxCommands":8,"fallback":false}',
  };
  for (const [s, json] of Object.entries(golden)) {
    assert.equal(JSON.stringify(generateMap(g, Number(s))), json, `シード${s}の生成結果がR1と一致`);
  }
});

test('engine-generate: itemsギミックの生成（1000シード。Issue #70）', () => {
  const gen = { ...r3, grid: G6, items: { min: 1, max: 2 }, itemsMustMatter: true };
  let sameSeed = true, fallbacks = 0, unsolved = 0, decorative = 0, badCount = 0, overlap = 0, badRange = 0;
  for (let s = 0; s < seedCount; s += 1) {
    const m = generateMap(gen, s);
    if (JSON.stringify(generateMap(gen, s)) !== JSON.stringify(m)) sameSeed = false;
    if (m.fallback) { fallbacks += 1; continue; }
    const res = simulate(m.solution, m);
    if (!(res.reachedGoal && res.blockedAt.length === 0 && res.remainingItems.length === 0)) unsolved += 1;
    if (shortestSteps(stripItems(m)) >= m.solution.length) decorative += 1;
    if (m.items.length < 1 || m.items.length > 2) badCount += 1;
    if (hasOverlap(m)) overlap += 1;
    if (m.solution.length < gen.shortestPath.min || m.solution.length > gen.shortestPath.max) badRange += 1;
  }
  assert.equal(sameSeed, true, `同一シードで同一マップ（${seedCount}シード）`);
  assert.equal(fallbacks, 0, `${seedCount}シードすべて生成成功`);
  assert.equal(unsolved, 0, `${seedCount}件すべてsolutionでクリアできる`);
  assert.equal(decorative, 0, 'itemsを外すと最短手数が短くなる（飾りが無い）');
  assert.equal(badCount, 0, 'itemsの個数が範囲内');
  assert.equal(overlap, 0, '座標重複なし');
  assert.equal(badRange, 0, '最短手数が範囲内');
});

test('engine-generate: iceギミックの生成（1000シード。Issue #70）', () => {
  const gen = { ...r3, grid: G6, ice: { min: 1, max: 3 }, iceMustMatter: true };
  let sameSeed = true, fallbacks = 0, unsolved = 0, decorative = 0, badCount = 0, overlap = 0;
  for (let s = 0; s < seedCount; s += 1) {
    const m = generateMap(gen, s);
    if (JSON.stringify(generateMap(gen, s)) !== JSON.stringify(m)) sameSeed = false;
    if (m.fallback) { fallbacks += 1; continue; }
    const res = simulate(m.solution, m);
    if (!(res.reachedGoal && res.blockedAt.length === 0)) unsolved += 1;
    if (shortestSteps(stripIce(m)) === m.solution.length) decorative += 1;
    if (m.ice.length < 1 || m.ice.length > 3) badCount += 1;
    if (hasOverlap(m)) overlap += 1;
  }
  assert.equal(sameSeed, true, `同一シードで同一マップ（${seedCount}シード）`);
  assert.equal(fallbacks, 0, `${seedCount}シードすべて生成成功`);
  assert.equal(unsolved, 0, `${seedCount}件すべてsolutionでクリアできる`);
  assert.equal(decorative, 0, 'iceを外すと最短手数が変わる（関与している）');
  assert.equal(badCount, 0, 'iceの個数が範囲内');
  assert.equal(overlap, 0, '座標重複なし');
});

test('engine-generate: keysギミックの生成（1000シード。Issue #70）', () => {
  const gen = { ...r3, grid: G6, keys: { min: 1, max: 1 }, keysMustMatter: true };
  let sameSeed = true, fallbacks = 0, unsolved = 0, decorative = 0, badPair = 0, overlap = 0;
  for (let s = 0; s < seedCount; s += 1) {
    const m = generateMap(gen, s);
    if (JSON.stringify(generateMap(gen, s)) !== JSON.stringify(m)) sameSeed = false;
    if (m.fallback) { fallbacks += 1; continue; }
    const res = simulate(m.solution, m);
    if (!(res.reachedGoal && res.blockedAt.length === 0)) unsolved += 1;
    if (shortestSteps(stripKeys(m)) >= m.solution.length) decorative += 1;
    if (m.keys.length !== 1 || m.doors.length !== 1 || m.keys[0].color !== m.doors[0].color) badPair += 1;
    if (hasOverlap(m)) overlap += 1;
  }
  assert.equal(sameSeed, true, `同一シードで同一マップ（${seedCount}シード）`);
  assert.equal(fallbacks, 0, `${seedCount}シードすべて生成成功`);
  assert.equal(unsolved, 0, `${seedCount}件すべてsolutionでクリアできる`);
  assert.equal(decorative, 0, 'keys/doorsを外すと最短手数が短くなる（ドアが最短路を塞ぐ）');
  assert.equal(badPair, 0, 'かぎとドアは1組で同色');
  assert.equal(overlap, 0, '座標重複なし');
});

test('engine-generate: 複合ギミックの生成（items+ice+keys。300シード。Issue #70）', () => {
  const gen = {
    ...r3, grid: G6,
    items: { min: 1, max: 2 }, itemsMustMatter: true,
    ice: { min: 1, max: 2 }, iceMustMatter: true,
    keys: { min: 1, max: 1 }, keysMustMatter: true,
  };
  let sameSeed = true, fallbacks = 0, unsolved = 0, notMattering = 0;
  for (let s = 0; s < 300; s += 1) {
    const m = generateMap(gen, s);
    if (JSON.stringify(generateMap(gen, s)) !== JSON.stringify(m)) sameSeed = false;
    if (m.fallback) { fallbacks += 1; continue; }
    const res = simulate(m.solution, m);
    if (!(res.reachedGoal && res.blockedAt.length === 0 && res.remainingItems.length === 0)) unsolved += 1;
    if (shortestSteps(stripItems(m)) >= m.solution.length
      || shortestSteps(stripIce(m)) === m.solution.length
      || shortestSteps(stripKeys(m)) >= m.solution.length) notMattering += 1;
  }
  assert.equal(sameSeed, true, '同一シードで同一マップ（300シード）');
  assert.equal(fallbacks, 0, '300シードすべて生成成功');
  assert.equal(unsolved, 0, '300件すべてsolutionでクリアできる');
  assert.equal(notMattering, 0, 'すべてのギミックが解法に関与している');
});
