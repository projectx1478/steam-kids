// stage-gen: 1盤の生成（Issue #337 段2）。受理した盤が solution の再生でクリアでき、必須性が真で、最短が範囲内。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, canonicalKey, metrics, itemsMustMatter, GEN_VERSION } from '../tools/gen/stage-gen.mjs';
import { simulate, isRunCleared, shortestSteps } from '../js/engine-grid.js';
import { iceMustMatter, keysMustMatter } from '../tools/lib/must-matter.mjs';

const base = {
  ver: GEN_VERSION,
  grid: { cols: { min: 4, max: 6 }, rows: { min: 4, max: 6 } },
  walls: { min: 2, max: 6 },
  shortestPath: { min: 4, max: 12 },
  minTurns: 1,
};
const cases = {
  items: { ...base, gimmicks: { items: { min: 1, max: 3 } }, teach: 'items' },
  ice: { ...base, gimmicks: { ice: { min: 1, max: 2 } }, teach: 'ice' },
  keys: { ...base, gimmicks: { keys: { min: 1, max: 1 } }, teach: 'keys' },
};
const SEEDS = 30;

test('stage-gen: 受理した盤は solution でクリアでき、必須性が真で、最短が範囲内', () => {
  for (const [teach, sg] of Object.entries(cases)) {
    let accepted = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      accepted += 1;
      const tag = `${teach} seed=${seed}`;
      assert.ok(isRunCleared(simulate(b.solution, b)), `${tag}: solution でクリアできない`);
      assert.equal(b.maxCommands, b.solution.length, tag);
      assert.equal(shortestSteps(b), b.solution.length, tag);
      assert.ok(b.solution.length >= 4 && b.solution.length <= 12, `${tag}: 最短が範囲外`);
      assert.ok(metrics(b).turns >= 1, `${tag}: 曲がり角が足りない`);
      assert.ok(b.grid.cols <= 6 && b.grid.rows <= 6, tag);
      if (teach === 'items') assert.ok(itemsMustMatter(b, b.solution.length), `${tag}: どんぐり必須でない`);
      if (teach === 'ice') assert.ok(iceMustMatter(b).matters && b.ice.length > 0, `${tag}: こおり必須でない`);
      if (teach === 'keys') assert.ok(keysMustMatter(b).matters && b.doors.length > 0, `${tag}: かぎ必須でない`);
    }
    assert.ok(accepted >= SEEDS / 2, `${teach}: 受理が少ない (${accepted}/${SEEDS})`);
  }
});

test('stage-gen: 同じ seed で同じ盤。ver は GEN_VERSION', () => {
  for (const sg of Object.values(cases)) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      assert.deepEqual(generateBoard(sg, seed), generateBoard(sg, seed));
    }
  }
  assert.equal(GEN_VERSION, 1);
});

test('stage-gen: canonicalKey は回転・鏡写しで不変、別の盤では異なる', () => {
  const b = generateBoard(cases.items, 1);
  const { cols, rows } = b.grid;
  const mirror = (p) => ({ ...p, x: cols - 1 - p.x });
  const m = {
    ...b, start: mirror(b.start), goal: mirror(b.goal), walls: b.walls.map(mirror), items: b.items.map(mirror),
  };
  assert.equal(canonicalKey(m), canonicalKey(b));
  const t = (p) => ({ ...p, x: p.y, y: p.x });
  const tr = {
    ...b, grid: { cols: rows, rows: cols }, start: t(b.start), goal: t(b.goal),
    walls: b.walls.map(t), items: b.items.map(t),
  };
  assert.equal(canonicalKey(tr), canonicalKey(b));
  assert.notEqual(canonicalKey(generateBoard(cases.items, 2)), canonicalKey(b));
});
