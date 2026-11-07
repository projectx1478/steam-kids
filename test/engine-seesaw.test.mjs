// predict-slider（シーソー）のてこ計算。おもさ×きょりの符号・解の個数・難易度（Issue #150）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balance, solutions, solutionPairs, difficulty, allowedPositions, solutionSets, moversOf, MAX_MULTI_SOLUTIONS } from '../js/engine-seesaw.js';

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

test('teko-05: p3・p4 は位置だけ・重さだけでは解けない', () => {
  const lesson = JSON.parse(readFileSync(new URL('../lessons/teko-05-ryouhou.json', import.meta.url), 'utf8'));
  for (const id of ['p3', 'p4']) {
    const { seesaw } = lesson.steps.find((s) => s.stepId === id);
    const pairs = solutionPairs(seesaw);
    assert.ok(pairs.length > 0, `${id}: 解がある`);
    assert.equal(pairs.filter((p) => p.robots === seesaw.mover.robots).length, 0, `${id}: 位置だけで解ける`);
    assert.equal(pairs.filter((p) => p.pos === seesaw.mover.start).length, 0, `${id}: 重さだけで解ける`);
  }
});

// 右の固定ロボット（right。Issue #689 段1）
const refBalance = (s, pos, robots = s.mover.robots) => {
  const torqueL = s.left.reduce((sum, w) => sum + w.robots * w.pos, 0);
  const torqueR = robots * pos;
  return { torqueL, torqueR, tilt: torqueL > torqueR ? -1 : torqueL < torqueR ? 1 : 0 };
};

test('engine-seesaw: right・side が無い従来の面は、1000番号の生成結果で旧式の計算と同じ', async () => {
  const { generateSeesawRun, SEESAW_RUN_STAGES } = await import('../js/engine-seesaw-gen.js');
  for (let n = 0; n < 1000; n += 1) {
    const run = generateSeesawRun(SEESAW_RUN_STAGES, String(n).padStart(3, '0'));
    for (const s of run) {
      const oldSolutions = [];
      const oldPairs = [];
      const poses = s.mover.fixedPos ? [s.mover.fixedPos] : Array.from({ length: s.notches }, (_, k) => k + 1);
      const robotsList = s.mover.maxRobots ? Array.from({ length: s.mover.maxRobots }, (_, k) => k + 1) : [s.mover.robots];
      for (let pos = 1; pos <= s.notches; pos += 1) {
        assert.deepEqual(balance(s, pos), refBalance(s, pos));
        if (refBalance(s, pos).tilt === 0) oldSolutions.push(pos);
      }
      for (const pos of poses) for (const robots of robotsList) if (refBalance(s, pos, robots).tilt === 0) oldPairs.push({ pos, robots });
      assert.deepEqual(solutions(s), oldSolutions);
      assert.deepEqual(solutionPairs(s), oldPairs);
      assert.equal(difficulty(s), s.left.reduce((sum, w) => sum + w.robots * w.pos, 0));
    }
  }
});

test('engine-seesaw: right があるとトルクに足され、解は[4]の1件（689-ok-right-both の side を外した形）', () => {
  const r = { notches: 4, left: [{ robots: 3, pos: 2 }], right: [{ robots: 1, pos: 2 }], mover: { robots: 1, start: 1 } };
  assert.deepEqual(balance(r, 1), { torqueL: 6, torqueR: 3, tilt: -1 });
  assert.deepEqual(solutions(r), [4]);
  assert.deepEqual(solutionPairs(r), [{ pos: 4, robots: 1 }]);
  assert.equal(difficulty(r), 4, '|6-2|');
});

test('engine-seesaw: allowedPositions は right のいる刻みを除く。占有された刻みは解にならない', () => {
  const r = { notches: 4, left: [{ robots: 3, pos: 2 }], right: [{ robots: 1, pos: 2 }], mover: { robots: 2, start: 1 } };
  assert.deepEqual(allowedPositions(r), [1, 3, 4]);
  assert.deepEqual(allowedPositions(spec), [1, 2, 3, 4]);
  assert.deepEqual(solutions(r), [], 'pos2 でつりあう計算だが占有');
  assert.equal(balance(r, 2).tilt, 0);
  assert.deepEqual(difficulty({ ...r, right: [{ robots: 6, pos: 4 }] }), 18, '|6-24|');
});

// side:"both"（Issue #689 段2）：689-ok-right-both と同形。
const bothSpec = { notches: 4, left: [{ robots: 3, pos: 2 }], right: [{ robots: 1, pos: 2 }], mover: { robots: 1, start: -1, side: 'both' } };

test('engine-seesaw: side:"both" の符号付きトルク。負のposはtorqueLへ足され、解は[4]', () => {
  assert.deepEqual(balance(bothSpec, -1), { torqueL: 7, torqueR: 2, tilt: -1 });
  assert.deepEqual(balance(bothSpec, 4), { torqueL: 6, torqueR: 6, tilt: 0 });
  assert.deepEqual(solutions(bothSpec), [4]);
  assert.deepEqual(solutionPairs(bothSpec), [{ pos: 4, robots: 1 }]);
  // 左が軽く右が重い面は、負の刻みが解になる（L=1 + 1×3 = R=2×2 でpos −3）。
  const lightLeft = { notches: 4, left: [{ robots: 1, pos: 1 }], right: [{ robots: 2, pos: 2 }], mover: { robots: 1, start: 1, side: 'both' } };
  assert.deepEqual(solutions(lightLeft), [-3]);
});

test('engine-seesaw: side:"both" の allowedPositions は 0 と占有（right は +pos、left は −pos）を飛ぶ', () => {
  assert.deepEqual(allowedPositions(bothSpec), [-4, -3, -1, 1, 3, 4]);
  assert.deepEqual(allowedPositions({ ...bothSpec, mover: { robots: 1, start: 1, side: 'both' }, left: [{ robots: 1, pos: 1 }], right: [] }), [-4, -3, -2, 1, 2, 3, 4], '1から◀で0と、−1（左の固定ロボットで占有）を飛んで−2');
  assert.deepEqual(allowedPositions({ ...bothSpec, mover: { robots: 1, start: 1 } }), [1, 3, 4], 'side 省略は従来どおり 1〜notches（rightの占有だけ除く）');
  assert.deepEqual(allowedPositions({ ...bothSpec, mover: { robots: 1, start: 1, side: 'right' } }), [1, 3, 4]);
});

// 動かすロボット2組（Issue #689 段3）：689-ok-array-len2 と同形。
const multiSpec = { notches: 4, left: [{ robots: 3, pos: 2 }, { robots: 1, pos: 1 }], mover: [{ robots: 1, start: 1 }, { robots: 2, start: 2 }] };

test('engine-seesaw: moversOf は単体を長さ1の配列にし、配列はそのまま返す', () => {
  assert.deepEqual(moversOf(spec), [spec.mover]);
  assert.equal(moversOf(multiSpec), multiSpec.mover);
  assert.equal(MAX_MULTI_SOLUTIONS, 3);
});

test('engine-seesaw: balance の配列形は単体形と同じ式で、複数組のトルクを足す', () => {
  assert.deepEqual(balance(spec, [{ pos: 4, robots: 1 }]), balance(spec, 4));
  assert.deepEqual(balance(multiSpec, [{ pos: 3, robots: 1 }, { pos: 2, robots: 2 }]), { torqueL: 7, torqueR: 7, tilt: 0 });
  assert.equal(balance(multiSpec, [{ pos: 1, robots: 1 }, { pos: 2, robots: 2 }]).tilt, -1);
  // 負の位置（side:"both"）は左へ足す
  const neg = { notches: 4, left: [{ robots: 1, pos: 1 }], mover: [{ robots: 1, start: 1, side: 'both' }, { robots: 2, start: 2 }] };
  assert.deepEqual(balance(neg, [{ pos: -1, robots: 1 }, { pos: 1, robots: 2 }]), { torqueL: 2, torqueR: 2, tilt: 0 });
});

test('engine-seesaw: solutionSets は2組のつりあう [pos1, pos2] を昇順で返す', () => {
  assert.deepEqual(solutionSets(multiSpec), [[1, 3], [3, 2]]);
  assert.deepEqual(solutionSets({ ...multiSpec, notches: 6, left: [{ robots: 5, pos: 2 }, { robots: 1, pos: 1 }] }), [[1, 5], [3, 4], [5, 3]]);
  assert.deepEqual(solutionSets({ ...multiSpec, notches: 2 }), [], '解なし');
  // 1×p1 + 2×p2 = 9 は [1,4] と [3,3]。同じ刻みの [3,3] は置けないので除く。
  assert.deepEqual(solutionSets({ notches: 4, left: [{ robots: 3, pos: 3 }], mover: multiSpec.mover }), [[1, 4]]);
});

test('engine-seesaw: allowedPositions は もう1組のいる刻みを飛ばす', () => {
  assert.deepEqual(allowedPositions(multiSpec, 0, [1, 2]), [1, 3, 4]);
  assert.deepEqual(allowedPositions(multiSpec, 1, [3, 2]), [1, 2, 4]);
  assert.deepEqual(allowedPositions(multiSpec, 0), [1, 2, 3, 4], 'placements なしは従来どおり');
});
