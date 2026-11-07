// engine-seesaw-gen: シーソーのれんしゅう用の面生成（Issue #611）。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seesawCandidates, generateSeesawRun, SEESAW_STAGES, SEESAW_RUN_STAGES, SEESAW_GEN_VER } from '../js/engine-seesaw-gen.js';
import { solutionPairs, balance, difficulty } from '../js/engine-seesaw.js';

const inRange = (v, [min, max]) => v >= min && v <= max;
const allCodes = Array.from({ length: 1000 }, (_, n) => String(n).padStart(3, '0'));
const boardOf = (s) => JSON.stringify([s.notches, s.left.map((w) => [w.robots, w.pos]), s.mover.robots, s.mover.maxRobots ?? null, s.mover.fixedPos ?? null]);

test('SEESAW_GEN_VER は 2、段の並びは A,A,B,R,R,X,X,X', () => {
  assert.equal(SEESAW_GEN_VER, 2);
  assert.deepEqual(SEESAW_RUN_STAGES, ['A', 'A', 'B', 'R', 'R', 'X', 'X', 'X']);
  assert.deepEqual(Object.keys(SEESAW_STAGES), ['A', 'B', 'R', 'X']);
});

test('段の候補数（面／開始位置を除く盤／非naiveHitの面）：A 49/19/21・B 70/19/52・R 25/25/16・X 29/29/11', () => {
  const rows = ['A', 'B', 'R', 'X'].map((st) => {
    const c = seesawCandidates(st);
    return [st, c.length, new Set(c.map((x) => x.key)).size, c.filter((x) => !x.naiveHit).length];
  });
  console.log('seesawCandidates（段, 面, 盤, 非naiveHit）:', JSON.stringify(rows));
  rows.forEach(([st, , , miss]) => assert.ok(miss > 0, `${st} の pool が空`));
  assert.deepEqual(rows, [['A', 49, 19, 21], ['B', 70, 19, 52], ['R', 25, 25, 16], ['X', 29, 29, 11]]);
});

test('候補は決まった順（刻み→左の組→右の体数→開始）で、何度呼んでも同じ', () => {
  const a = seesawCandidates('B');
  const keys = a.map((c) => [c.notches, JSON.stringify(c.left.map((w) => [w.pos, w.robots])), c.moverRobots, c.start]);
  const sorted = [...keys].sort((x, y) => x[0] - y[0] || x[2] - y[2] || x[3] - y[3]);
  // 刻みは昇順（左の組の辞書順は生成順で固定）
  assert.deepEqual(keys.map((k) => k[0]), sorted.map((k) => k[0]));
  assert.equal(seesawCandidates('B'), a);
});

test('全1000番号：各面は解の個数・開始で傾く・段の範囲内、8面はd非減少で盤の重複なし、1面目以外は素朴な答えで外れる', () => {
  for (const code of allCodes) {
    const run = generateSeesawRun(SEESAW_RUN_STAGES, code);
    assert.equal(run.length, 8, code);
    let prevD = 0;
    run.forEach((spec, i) => {
      const stage = SEESAW_RUN_STAGES[i];
      const cond = SEESAW_STAGES[stage];
      const pairs = solutionPairs(spec);
      assert.equal(pairs.length, 1, `${code}[${i}] 解の数`);
      assert.notEqual(balance(spec, spec.mover.start).tilt, 0, `${code}[${i}] 開始で傾く`);
      assert.ok(inRange(spec.notches, cond.notches), `${code}[${i}] 刻み`);
      assert.ok(inRange(spec.left.length, cond.groups), `${code}[${i}] 左の組数`);
      assert.ok(inRange(spec.mover.robots, cond.mover), `${code}[${i}] 右の体数`);
      const d = difficulty(spec);
      assert.ok(inRange(d, cond.d), `${code}[${i}] d=${d}`);
      assert.ok(d >= prevD, `${code}[${i}] d非減少`);
      prevD = d;
      const outer = spec.left[spec.left.length - 1];
      const hit = pairs[0];
      if (stage === 'R') {
        assert.equal(spec.mover.maxRobots, 3);
        assert.equal(spec.mover.fixedPos, spec.mover.start);
        assert.ok(hit.robots >= 2, `${code}[${i}] 答えは2体以上`);
      }
      if (i >= 1) {
        const naive = stage === 'R' ? hit.robots === outer.robots : stage === 'X' ? hit.pos === outer.pos || hit.robots === outer.robots : hit.pos === outer.pos;
        assert.equal(naive, false, `${code}[${i}] 素朴な答えで外れる`);
      }
    });
    assert.equal(new Set(run.map(boardOf)).size, 8, `${code} 盤の重複`);
  }
});

test('同じ番号→同じ8面、番号が違えば（ほとんどの組で）違う8面', () => {
  assert.deepEqual(generateSeesawRun(SEESAW_RUN_STAGES, '123'), generateSeesawRun(SEESAW_RUN_STAGES, '123'));
  const distinct = new Set(allCodes.map((c) => JSON.stringify(generateSeesawRun(SEESAW_RUN_STAGES, c))));
  assert.ok(distinct.size > 500, `distinct=${distinct.size}`);
});

test('generateSeesawRun: 未対応の段はthrow', () => {
  assert.throws(() => generateSeesawRun(['Z'], '000'));
});
