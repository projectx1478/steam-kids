// optimal（最短判定。Issue #491）の純関数。ブラウザ不要。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeOptimal, shortestOfStep } from '../js/engine-grid.js';

const step = { grid: { cols: 4, rows: 4 }, start: { x: 0, y: 3 }, goal: { x: 3, y: 0 }, walls: [{ x: 2, y: 2 }] };

test('optimal：最短（手数＝最短、以下）は true', () => {
  const shortest = shortestOfStep(step);
  assert.equal(shortest, 6);
  assert.equal(judgeOptimal(6, shortest), true);
  assert.equal(judgeOptimal(5, shortest), true);
});

test('optimal：最短を超えたら false', () => {
  assert.equal(judgeOptimal(7, shortestOfStep(step)), false);
});

test('optimal：算出不能（repeatBox・到達不能・数値でない）は undefined', () => {
  assert.equal(shortestOfStep({ ...step, repeatBox: true }), undefined);
  assert.equal(shortestOfStep({ ...step, walls: [{ x: 3, y: 1 }, { x: 2, y: 0 }] }), undefined);
  assert.equal(judgeOptimal(3, undefined), undefined);
  assert.equal(judgeOptimal(3, Infinity), undefined);
});
