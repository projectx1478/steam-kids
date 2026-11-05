// 条件分岐 {if,then} のエンジン（Issue #291）。simulate・makeSensor・chipCount・shortestOfStep。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, boardSpec, chipCount, shortestOfStep, isRunCleared } from '../js/engine-grid.js';

const board = (n) => JSON.parse(readFileSync(`test/fixtures/cond/291-A-${n}.json`, 'utf-8'));

test('engine-cond: 合格盤 A-1〜3 の solution がクリアする', () => {
  for (const n of [1, 2, 3]) {
    const play = board(n);
    assert.equal(isRunCleared(simulate(play.solution, boardSpec(play))), true, `A-${n}`);
  }
});

test('engine-cond: 真偽の評価・condSkipped・forceCond・チップ数', () => {
  const play = board(1);
  const spec = boardSpec(play);
  const r = simulate(play.solution, spec);
  assert.deepEqual(r.condSkipped, [{ chip: 2, at: 4 }], '2枚目（隣が空き）だけ偽で飛ばされる');
  assert.deepEqual(r.stepOwner, [0, 1, 1, 1, 3], '真のカードは then の手が同じ stepOwner');
  assert.deepEqual(r.innerOwner, [-1, 0, 1, 2, -1]);
  assert.equal(simulate(play.solution, spec, { forceCond: false }).reachedGoal, false, '常に偽は届かない');
  assert.equal(isRunCleared(simulate(play.solution, spec, { forceCond: true })), false, '常に真はクリアしない');
  assert.equal(chipCount(play.solution), 4, '条件カードは中身込みで1チップ');
  assert.equal(shortestOfStep(play), undefined, 'condBlock は最短を出さない');
});

test('engine-cond: 条件が無い列には condSkipped を付けない', () => {
  const play = board(1);
  const r = simulate(['right', 'right'], boardSpec(play));
  assert.equal('condSkipped' in r, false);
});

test('engine-cond: センサーは壁・盤外が真、空きが偽', () => {
  const spec = boardSpec(board(1));
  const skipped = (cmds) => simulate(cmds, spec).condSkipped.length;
  assert.equal(skipped(['right', { if: 'right', then: ['up'] }]), 0, '隣が壁＝真');
  assert.equal(skipped([{ if: 'left', then: ['up'] }]), 0, '隣が盤外＝真');
  assert.equal(skipped([{ if: 'right', then: ['up'] }]), 1, '隣が空き＝偽');
});
