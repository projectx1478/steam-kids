// engine-seesaw-gen: シーソーのれんしゅう用の面生成（Issue #611）。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seesawCandidates, generateSeesawRun, SEESAW_STAGES, SEESAW_RUN_STAGES, SEESAW_GEN_VER } from '../js/engine-seesaw-gen.js';
import { solutions, balance, difficulty } from '../js/engine-seesaw.js';

const inRange = (v, [min, max]) => v >= min && v <= max;
const allCodes = Array.from({ length: 1000 }, (_, n) => String(n).padStart(3, '0'));
const boardOf = (s) => JSON.stringify([s.notches, s.left.map((w) => [w.robots, w.pos]), s.mover.robots]);

test('SEESAW_GEN_VER は 1、段の並びは A,A,B,B,C', () => {
  assert.equal(SEESAW_GEN_VER, 1);
  assert.deepEqual(SEESAW_RUN_STAGES, ['A', 'A', 'B', 'B', 'C']);
});

test('段の候補数が設計と一致（面／開始位置を除く盤）：A 49/19・B 113/31・C 56/14', () => {
  const counts = Object.fromEntries(
    ['A', 'B', 'C'].map((st) => [st, [seesawCandidates(st).length, new Set(seesawCandidates(st).map((c) => c.key)).size]])
  );
  assert.deepEqual(counts, { A: [49, 19], B: [113, 31], C: [56, 14] });
});

test('素朴な答えで外れる面の数：A 21・B 81・C 52', () => {
  const miss = (st) => seesawCandidates(st).filter((c) => !c.naiveHit).length;
  assert.deepEqual([miss('A'), miss('B'), miss('C')], [21, 81, 52]);
});

test('候補は決まった順（刻み→左の組→右の体数→開始）で、何度呼んでも同じ', () => {
  const a = seesawCandidates('B');
  const keys = a.map((c) => [c.notches, JSON.stringify(c.left.map((w) => [w.pos, w.robots])), c.moverRobots, c.start]);
  const sorted = [...keys].sort((x, y) => x[0] - y[0] || x[2] - y[2] || x[3] - y[3]);
  // 刻みは昇順（左の組の辞書順は生成順で固定）
  assert.deepEqual(keys.map((k) => k[0]), sorted.map((k) => k[0]));
  assert.equal(seesawCandidates('B'), a);
});

test('全1000番号：各面は解ちょうど1つ・開始で傾く・段の範囲内、5面はd非減少で盤の重複なし', () => {
  for (const code of allCodes) {
    const run = generateSeesawRun(SEESAW_RUN_STAGES, code);
    assert.equal(run.length, 5, code);
    let prevD = 0;
    run.forEach((spec, i) => {
      const cond = SEESAW_STAGES[SEESAW_RUN_STAGES[i]];
      const found = solutions(spec);
      assert.equal(found.length, 1, `${code}[${i}] 解の数`);
      assert.notEqual(balance(spec, spec.mover.start).tilt, 0, `${code}[${i}] 開始で傾く`);
      assert.ok(inRange(spec.notches, cond.notches), `${code}[${i}] 刻み`);
      assert.ok(inRange(spec.left.length, cond.groups), `${code}[${i}] 左の組数`);
      assert.ok(inRange(spec.mover.robots, cond.mover), `${code}[${i}] 右の体数`);
      const d = difficulty(spec);
      assert.ok(inRange(d, cond.d), `${code}[${i}] d=${d}`);
      assert.ok(d >= prevD, `${code}[${i}] d非減少`);
      prevD = d;
      if (i >= 1) assert.notEqual(found[0], spec.left[spec.left.length - 1].pos, `${code}[${i}] 素朴な答えで外れる`);
    });
    assert.equal(new Set(run.map(boardOf)).size, 5, `${code} 盤の重複`);
  }
});

test('同じ番号→同じ5面、番号が違えば（ほとんどの組で）違う5面', () => {
  assert.deepEqual(generateSeesawRun(SEESAW_RUN_STAGES, '123'), generateSeesawRun(SEESAW_RUN_STAGES, '123'));
  const distinct = new Set(allCodes.map((c) => JSON.stringify(generateSeesawRun(SEESAW_RUN_STAGES, c))));
  assert.ok(distinct.size > 500, `distinct=${distinct.size}`);
});

test('generateSeesawRun: 未対応の段はthrow', () => {
  assert.throws(() => generateSeesawRun(['Z'], '000'));
});
