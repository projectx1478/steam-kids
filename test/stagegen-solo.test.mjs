// 単独ギミック集合の一般化（#496 段0）。集合に要素を足せば、検査器もフォーム検査も同じ併用NGが働く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStageGen, SG_SOLO_GIMMICKS } from '../tools/lib/validate/stagegen.mjs';
import { GEN_SOLO_GIMMICKS } from '../tools/editor/editor-view.js';

const sg = (gimmicks) => ({
  ver: 1, stages: 3, grid: { cols: { min: 5, max: 6 }, rows: { min: 5, max: 6 } },
  gimmicks, teach: Object.keys(gimmicks)[0], shortestPath: { min: 4, max: 8 },
});
const run = (gimmicks, solo) => {
  const errs = [];
  checkStageGen({ stageGen: sg(gimmicks) }, [], (rule, msg) => errs.push(`${rule}: ${msg}`), solo);
  return errs;
};

test('単独集合の初期値は warps のみ', () => {
  assert.deepEqual(SG_SOLO_GIMMICKS, ['warps']);
  assert.deepEqual(GEN_SOLO_GIMMICKS, ['warps']);
});

test('集合に仮の要素を渡すと、その要素との併用がNGになる', () => {
  const g = { items: { min: 1, max: 2 }, ice: { min: 1, max: 2 } };
  assert.deepEqual(run(g, ['warps']), []);
  const errs = run(g, ['items']);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /items は単独で指定する（ice と併用できない）/);
  assert.deepEqual(run({ items: { min: 1, max: 2 } }, ['items']), []);
});
