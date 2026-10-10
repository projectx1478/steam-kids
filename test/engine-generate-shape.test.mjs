// engine-generate: generator.shape（形のプリセット。Issue #338 段2-1）。座標・陸の連結・glassesの別島・再現性と、
// validatePracticeでの shape 関連の検査（boards の shape 盤7つ）。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateMap } from '../js/engine-generate.js';
import { simulate } from '../js/engine-grid.js';

const K = (p) => `${p.x},${p.y}`;
const set = (list) => new Set(list.map(K));
const pts = (list) => list.map(([x, y]) => ({ x, y }));
const SEEDS = 200;
const sorted = (list) => [...list].sort((a, b) => a.y - b.y || a.x - b.x);

const PRESETS = {
  round: {
    gen: { grid: { cols: 5, rows: 5 }, shape: 'round', walls: { min: 1, max: 2 }, wallsMustMatter: true },
    water: pts([[0, 0], [1, 0], [3, 0], [4, 0], [0, 1], [4, 1], [0, 3], [4, 3], [0, 4], [1, 4], [3, 4], [4, 4]]),
    bridge: [],
    land: 13,
  },
  bumpy: {
    gen: { grid: { cols: 5, rows: 4 }, shape: 'bumpy', walls: { min: 0, max: 2 } },
    water: pts([[0, 0], [1, 0], [2, 0], [4, 0], [0, 1], [2, 2], [3, 2], [2, 3]]),
    bridge: [],
    land: 12,
  },
  glasses: {
    gen: { grid: { cols: 6, rows: 4 }, shape: 'glasses', walls: { min: 0, max: 0 } },
    water: [...[0, 1, 2, 3, 4, 5].flatMap((x) => [{ x, y: 0 }, { x, y: 3 }]), { x: 2, y: 2 }, { x: 3, y: 2 }],
    bridge: pts([[2, 1], [3, 1]]),
    land: 10,
  },
};

const landOf = (grid, water) => {
  const w = set(water);
  const land = [];
  for (let y = 0; y < grid.rows; y += 1) for (let x = 0; x < grid.cols; x += 1) if (!w.has(`${x},${y}`)) land.push({ x, y });
  return land;
};

function connected(land) {
  const all = set(land);
  const seen = new Set([K(land[0])]);
  const stack = [land[0]];
  while (stack.length > 0) {
    const c = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (all.has(K(n)) && !seen.has(K(n))) { seen.add(K(n)); stack.push(n); }
    }
  }
  return seen.size === land.length;
}

for (const [name, p] of Object.entries(PRESETS)) {
  test(`engine-generate shape ${name}: 水・橋の座標がプリセット表どおりで、陸は連結し、start・goal・walls・itemsは陸にある`, () => {
    const land = landOf(p.gen.grid, p.water);
    assert.equal(land.length, p.land);
    assert.ok(connected(land), '陸が連結');
    const landKeys = set(land);
    for (let s = 0; s < SEEDS; s += 1) {
      const m = generateMap({ ...p.gen, items: { min: 1, max: 2 } }, s);
      assert.equal(m.fallback, false, `seed ${s} が予備盤面`);
      assert.deepEqual(sorted(m.water), sorted(p.water));
      assert.deepEqual(sorted(m.bridge ?? []), sorted(p.bridge));
      for (const c of [m.start, m.goal, ...m.walls, ...m.items]) assert.ok(landKeys.has(K(c)), `seed ${s}: ${K(c)} が水の上`);
      assert.equal(new Set([m.start, m.goal, ...m.walls, ...m.items].map(K)).size, 2 + m.walls.length + m.items.length);
      const r = simulate(m.solution, m);
      assert.ok(r.reachedGoal, `seed ${s} の solution がゴールに届かない`);
      assert.deepEqual(r.blockedAt, [], `seed ${s} の solution が止まる`);
    }
  });

  test(`engine-generate shape ${name}: 同じseedなら同じ盤面`, () => {
    for (let s = 0; s < 30; s += 1) {
      assert.equal(JSON.stringify(generateMap(p.gen, s)), JSON.stringify(generateMap(p.gen, s)));
    }
    assert.ok(new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generateMap(p.gen, s)))).size > 1);
  });
}

test('engine-generate shape glasses: startとgoalは別の島（左右）にあり、橋のマスには置かない', () => {
  const side = (c) => (c.x <= 1 ? 'L' : c.x >= 4 ? 'R' : 'B');
  const seen = new Set();
  for (let s = 0; s < SEEDS; s += 1) {
    const m = generateMap(PRESETS.glasses.gen, s);
    const a = side(m.start);
    const b = side(m.goal);
    assert.ok(a !== 'B' && b !== 'B' && a !== b, `seed ${s}: start=${K(m.start)} goal=${K(m.goal)}`);
    seen.add(a);
  }
  assert.equal(seen.size, 2, 'startは左右どちらにも出る');
});

test('engine-generate shape: round・bumpyはstartとgoalが同じ塊でもよい（別島の規則はglassesだけ）', () => {
  assert.equal(generateMap(PRESETS.round.gen, 0).water.length, 12);
});

test('engine-generate shape: shapeを指定しない generator の結果に water・bridge は出ない', () => {
  const m = generateMap({ grid: { cols: 5, rows: 5 }, walls: { min: 3, max: 6 }, shortestPath: { min: 6, max: 10 }, minTurns: 2, wallsMustMatter: true, maxCommandsSlack: 2 }, 7);
  assert.equal('water' in m, false);
  assert.equal('bridge' in m, false);
});

// --- validatePractice（boards の shape 盤7つ）---
const practice = JSON.parse(readFileSync('lessons/cmd-06-practice.json', 'utf-8'));
const BOARDS = {
  'round-shape-ok': { stepId: 'p1', kind: 'play', generator: { grid: { cols: 5, rows: 5 }, shape: 'round', walls: { min: 1, max: 2 }, wallsMustMatter: true } },
  'bad-shape-with-water': { stepId: 'p1', kind: 'play', water: [{ x: 2, y: 0 }], generator: { grid: { cols: 6, rows: 4 }, shape: 'glasses', walls: { min: 0, max: 0 } } },
  'bad-shape-with-bridge': { stepId: 'p1', kind: 'play', bridge: [{ x: 2, y: 1 }], generator: { grid: { cols: 6, rows: 4 }, shape: 'glasses', walls: { min: 0, max: 0 } } },
  'bad-shape-with-watermode': { stepId: 'p1', kind: 'play', waterMode: 'bump', generator: { grid: { cols: 5, rows: 5 }, shape: 'round', walls: { min: 1, max: 2 }, wallsMustMatter: true } },
  'bad-shape-grid-mismatch': { stepId: 'p1', kind: 'play', generator: { grid: { cols: 5, rows: 5 }, shape: 'glasses', walls: { min: 0, max: 0 } } },
  'bad-shape-no-grid': { stepId: 'p1', kind: 'play', generator: { shape: 'round', walls: { min: 1, max: 2 }, wallsMustMatter: true } },
  'bad-shape-value': { stepId: 'p1', kind: 'play', generator: { grid: { cols: 5, rows: 5 }, shape: 'lake', walls: { min: 1, max: 2 } } },
};

// 盤を seedPick・play・summary の3段のレッスンに包んで validate-lessons に通す。
function validate(play) {
  const lesson = JSON.parse(JSON.stringify(practice));
  lesson.steps[1] = { ...play, text: 'ゴールへ いこう' };
  const dir = mkdtempSync(path.join(tmpdir(), 'vs-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'commands', title: 'コマンド', lessonIds: [], practiceIds: [lesson.lessonId] }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('validatePractice: round-shape-ok（shape＋grid＋wallsMustMatter）は合格', () => {
  const r = validate(BOARDS['round-shape-ok']);
  assert.equal(r.code, 0, r.out);
});

const NG = [
  ['bad-shape-with-water', 'generator.shapeとwaterは同時に置けない'],
  ['bad-shape-with-bridge', 'generator.shapeとbridgeは同時に置けない'],
  ['bad-shape-with-watermode', 'generator.shapeとwaterModeは同時に置けない'],
  ['bad-shape-grid-mismatch', 'shape="glasses" は6×4（grid=5×5と違う）'],
  ['bad-shape-no-grid', 'generator.gridが必須'],
  ['bad-shape-value', 'shape="lake" が不正'],
];
for (const [name, text] of NG) {
  test(`validatePractice: ${name} は検証NG`, () => {
    const r = validate(BOARDS[name]);
    assert.equal(r.code, 1, r.out);
    assert.ok(r.out.includes(text), r.out);
    assert.equal(r.out.includes('TypeError'), false, '例外で落とさない');
  });
}
