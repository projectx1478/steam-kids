// fastSteps（Issue #743）：2回目以降のじっこうで速くする手の純関数。js/ui-commands.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastSteps } from '../js/ui-commands.js';

const mv = (dir, times = 1) => ({ dir, times });
const own = (n) => Array.from({ length: n }, (_, i) => i); // 各チップ1手

test('1回目（前回なし）は全部 false', () => {
  assert.deepEqual(fastSteps(null, -1, [mv('up'), mv('up')], own(2)), [false, false]);
});

test('前回＝今回・失敗なしは全部 true', () => {
  const c = [mv('up'), mv('up'), mv('left'), mv('left')];
  assert.deepEqual(fastSteps(c, -1, c, own(4)), [true, true, true, true]);
});

test('途中から違うチップは、そこから等速', () => {
  const prev = [mv('up'), mv('up'), mv('left')];
  const cur = [mv('up'), mv('up'), mv('right')];
  assert.deepEqual(fastSteps(prev, -1, cur, own(3)), [true, true, false]);
});

test('前回の失敗手の2手前（i >= failStep-2）から等速', () => {
  const c = Array.from({ length: 6 }, () => mv('up'));
  assert.deepEqual(fastSteps(c, 5, c, own(6)), [true, true, true, false, false, false]);
});

test('箱は1チップとして比べ、中身が違えば一致しない', () => {
  const prev = [mv('up'), { box: [mv('up'), mv('left')] }];
  const same = [mv('up'), { box: [mv('up'), mv('left')] }];
  const diff = [mv('up'), { box: [mv('up'), mv('right')] }];
  assert.deepEqual(fastSteps(prev, -1, same, [0, 1, 1]), [true, true, true]);
  assert.deepEqual(fastSteps(prev, -1, diff, [0, 1, 1]), [true, false, false]);
});

test('1チップ複数手（times）も同じチップの手は同じ判定', () => {
  const c = [mv('up', 3), mv('left')];
  assert.deepEqual(fastSteps(c, -1, c, [0, 0, 0, 1]), [true, true, true, true]);
});
