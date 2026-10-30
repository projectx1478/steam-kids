// predict-slider（シーソー）のてこ計算。おもさ×きょりの符号・解の個数・難易度（Issue #150）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, solutions, solutionPairs, difficulty } from '../js/engine-seesaw.js';

const spec = { notches: 4, left: [{ robots: 2, pos: 2 }], mover: { robots: 1, start: 1 } };

test('engine-seesaw: balanceのトルクと傾きの符号表', () => {
  assert.deepEqual(balance(spec, 1), { torqueL: 4, torqueR: 1, tilt: -1 });
  assert.deepEqual(balance(spec, 4), { torqueL: 4, torqueR: 4, tilt: 0 });
  assert.equal(balance({ ...spec, notches: 6 }, 5).tilt, 1, '右が重いと右がさがる');
});

test('engine-seesaw: 複数の重りはトルクを合計する', () => {
  const two = { notches: 6, left: [{ robots: 1, pos: 2 }, { robots: 1, pos: 4 }], mover: { robots: 1, start: 1 } };
  assert.equal(balance(two, 6).tilt, 0);
  assert.equal(difficulty(two), 6);
});

test('engine-seesaw: solutionsはつりあう刻みだけを昇順で返す', () => {
  assert.deepEqual(solutions(spec), [4]);
  assert.deepEqual(solutions({ notches: 4, left: [{ robots: 2, pos: 2 }], mover: { robots: 2, start: 1 } }), [2]);
  assert.deepEqual(solutions({ notches: 2, left: [{ robots: 1, pos: 2 }], mover: { robots: 3, start: 1 } }), []);
});

test('engine-seesaw: balanceの第3引数で重さを変えられる（省略は mover.robots）', () => {
  assert.deepEqual(balance(spec, 2, 2), { torqueL: 4, torqueR: 4, tilt: 0 });
  assert.deepEqual(balance(spec, 2), balance(spec, 2, spec.mover.robots));
});

test('engine-seesaw: solutionPairsは fixedPos・maxRobots の組み合わせで組を数える', () => {
  const left = [{ robots: 1, pos: 2 }];
  // 位置だけ（maxRobots なし）：robots は mover.robots だけ。solutions と同じ
  assert.deepEqual(solutionPairs(spec), [{ pos: 4, robots: 1 }]);
  // 重さだけ（fixedPos あり）
  assert.deepEqual(solutionPairs({ notches: 3, left, mover: { robots: 1, maxRobots: 3, fixedPos: 1, start: 1 } }), [{ pos: 1, robots: 2 }]);
  // 両方
  assert.deepEqual(solutionPairs({ notches: 2, left, mover: { robots: 1, maxRobots: 3, start: 1 } }), [
    { pos: 1, robots: 2 },
    { pos: 2, robots: 1 },
  ]);
  assert.deepEqual(solutionPairs({ notches: 4, left: [{ robots: 1, pos: 4 }], mover: { robots: 1, maxRobots: 3, start: 1 } }), [
    { pos: 2, robots: 2 },
    { pos: 4, robots: 1 },
  ]);
  // 解なし
  assert.deepEqual(solutionPairs({ notches: 3, left: [{ robots: 1, pos: 3 }, { robots: 1, pos: 2 }], mover: { robots: 1, maxRobots: 2, fixedPos: 2, start: 2 } }), []);
  // solutions の返り値は変わらない（重さは mover.robots 固定）
  assert.deepEqual(solutions({ notches: 2, left, mover: { robots: 1, maxRobots: 3, start: 1 } }), [2]);
});
