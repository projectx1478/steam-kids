// 単独ギミック集合の一般化（#496 段0）。集合に要素を足せば、検査器もフォーム検査も同じ併用NGが働く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStageGen, SG_SOLO_GIMMICKS, SG_ONE_OF_GIMMICKS } from '../tools/lib/validate/stagegen.mjs';
import { GEN_SOLO_GIMMICKS, GEN_ONE_OF_GIMMICKS } from '../tools/editor/editor-view.js';

const sg = (gimmicks) => ({
  ver: 1, stages: 3, grid: { cols: { min: 5, max: 6 }, rows: { min: 5, max: 6 } },
  gimmicks, teach: Object.keys(gimmicks)[0], shortestPath: { min: 4, max: 8 },
});
const run = (gimmicks, solo) => {
  const errs = [];
  checkStageGen({ stageGen: sg(gimmicks) }, [], (rule, msg) => errs.push(`${rule}: ${msg}`), solo);
  return errs;
};

test('単独集合・1種までの集合は空（paint の単独制限と warps・periodic・water の1種制限は #649 で撤廃。フォーム側も同じ）', () => {
  assert.deepEqual(SG_SOLO_GIMMICKS, []);
  assert.deepEqual(GEN_SOLO_GIMMICKS, []);
  assert.deepEqual(SG_ONE_OF_GIMMICKS, []);
  assert.deepEqual(GEN_ONE_OF_GIMMICKS, []);
});

test('撤廃した併用：warps+periodic・水+warps+periodic・paint+items/keys/warps/periodic・keys+switches は検査を通る', () => {
  const one = { min: 1, max: 2 };
  const water = { min: 2, max: 4 };
  const paint = { min: 4, max: 6 };
  assert.deepEqual(run({ warps: one, items: one }), []);
  assert.deepEqual(run({ warps: one, periodic: one }), []);
  assert.deepEqual(run({ warps: one, periodic: one, water }), []);
  for (const k of ['items', 'keys', 'warps', 'periodic']) assert.deepEqual(run({ paint, [k]: one }), [], k);
  assert.deepEqual(run({ keys: one, switches: one }), []);
});

test('集合に仮の要素を渡すと、その要素との併用がNGになる', () => {
  const g = { items: { min: 1, max: 2 }, ice: { min: 1, max: 2 } };
  assert.deepEqual(run(g, ['warps']), []);
  const errs = run(g, ['items']);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /items は単独で指定する（ice と併用できない）/);
  assert.deepEqual(run({ items: { min: 1, max: 2 } }, ['items']), []);
});

test('rollBalls は ice・warps・switches・periodic・cushion と同時に指定できない（#660）。items・keys・water・paint とは併用できる', () => {
  const one = { min: 1, max: 1 };
  for (const k of ['ice', 'warps', 'switches', 'periodic', 'cushion']) {
    const errs = run({ rollBalls: one, [k]: one });
    assert.equal(errs.length, 1, k);
    assert.match(errs[0], new RegExp(`^stageGen: rollBalls は ${k} と同時に指定できない`), k);
  }
  for (const [k, v] of [['items', one], ['keys', one], ['water', { min: 2, max: 4 }], ['paint', { min: 4, max: 6 }]]) {
    assert.deepEqual(run({ rollBalls: one, [k]: v }), [], k);
  }
  assert.equal(run({ rollBalls: { min: 1, max: 3 } }).length, 1);
  assert.match(run({ rollBalls: one, pits: one }).join(' '), /stageGen 未対応のギミック: gimmicks の pits は未対応/);
});
