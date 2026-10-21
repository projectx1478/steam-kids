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

test('単独集合は paint、1種までの集合は warps・periodic・water（フォーム側も同じ。#531）', () => {
  assert.deepEqual(SG_SOLO_GIMMICKS, ['paint']);
  assert.deepEqual(GEN_SOLO_GIMMICKS, ['paint']);
  assert.deepEqual(SG_ONE_OF_GIMMICKS, ['warps', 'periodic', 'water']);
  assert.deepEqual(GEN_ONE_OF_GIMMICKS, ['warps', 'periodic', 'water']);
});

test('1種までの集合：2種以上は新文言でNG、items などとの併用は通る', () => {
  const one = { min: 1, max: 2 };
  assert.deepEqual(run({ warps: one, items: one }), []);
  assert.deepEqual(run({ warps: one, periodic: one }), ['stageGen: warps・periodic は同時に指定できない（warps・periodic・water は1種まで）']);
  assert.deepEqual(run({ warps: one, periodic: one, water: { min: 2, max: 4 } }), ['stageGen: warps・periodic・water は同時に指定できない（warps・periodic・water は1種まで）']);
});

test('集合に仮の要素を渡すと、その要素との併用がNGになる', () => {
  const g = { items: { min: 1, max: 2 }, ice: { min: 1, max: 2 } };
  assert.deepEqual(run(g, ['warps']), []);
  const errs = run(g, ['items']);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /items は単独で指定する（ice と併用できない）/);
  assert.deepEqual(run({ items: { min: 1, max: 2 } }, ['items']), []);
});
