// 「とめる」の実行モデル（#395 段2）の純関数テスト。js/ui-commands.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/engine-grid.js';
import { isPause, stripPauses, nextPauseIndex, countChips, stepsBefore, planRun, isLockedIndex, clearUnlocked } from '../js/ui-commands.js';

const P = { pause: true };
const mv = (dir, times = 1) => ({ dir, times });
const spec = { grid: { cols: 6, rows: 6 }, start: { x: 0, y: 0 }, goal: { x: 3, y: 2 }, walls: [] };

test('stripPauses: 「とめる」を除き、元の添字を対応づける', () => {
  const cmds = [mv('right', 2), P, mv('down'), P, mv('right')];
  const { cmds: stripped, origIndex } = stripPauses(cmds);
  assert.equal(stripped.length, 3);
  assert.deepEqual(origIndex, [0, 2, 4]);
  assert.equal(isPause(P), true);
  assert.equal(isPause('right'), false);
});

test('countChips: 「とめる」は maxCommands に数えない', () => {
  assert.equal(countChips([mv('right'), P, mv('down')]), 2);
});

test('止まり位置から続ける: 先頭部分の終点が続きの開始地点になる', () => {
  const cmds = [mv('right', 2), P, mv('down', 2), mv('right')];
  const plan = planRun(cmds, spec, 0);
  assert.equal(plan.nextPause, 1);
  assert.equal(plan.startIndex, 0);
  assert.equal(plan.stopIndex, 2);
  const { path } = simulate(stripPauses(cmds).cmds, spec);
  assert.deepEqual(path[plan.stopIndex], { x: 2, y: 0 });
  // 止まった後(lockedCount=2)：開始は止まった地点、次の「とめる」は無いので最後まで。
  const cont = planRun(cmds, spec, 2);
  assert.equal(cont.startIndex, 2);
  assert.equal(cont.nextPause, -1);
  assert.equal(cont.stopIndex, null);
  assert.deepEqual(path[cont.startIndex], { x: 2, y: 0 });
  assert.equal(path.length - 1, 5);
});

test('止まり位置からの1コマ: 続きの区間は止まった地点から後ろを1手ずつ、次の「とめる」の手前まで', () => {
  const cmds = [mv('right', 2), P, mv('down'), P, mv('down'), mv('right')];
  const plan = planRun(cmds, spec, 2);
  assert.equal(plan.startIndex, 2);
  assert.equal(plan.nextPause, 3);
  assert.equal(plan.stopIndex, 3);
  // 止まる前の部分でも従来どおり（先頭から次の「とめる」まで）
  const first = planRun(cmds, spec, 0);
  assert.equal(first.startIndex, 0);
  assert.equal(first.stopIndex, 2);
});

test('「とめる」が無ければ従来と同じ（先頭から最後まで）', () => {
  const cmds = [mv('right', 2), mv('down')];
  assert.deepEqual(planRun(cmds, spec, 0), { nextPause: -1, startIndex: 0, stopIndex: null });
  assert.equal(nextPauseIndex(cmds), -1);
});

test('先頭が「とめる」・連続する「とめる」は手数0で止まる', () => {
  const cmds = [P, P, mv('right')];
  assert.equal(planRun(cmds, spec, 0).stopIndex, 0);
  assert.equal(planRun(cmds, spec, 1).stopIndex, 0);
  assert.equal(stepsBefore(cmds, spec, 2), 0);
});

test('前を変更不可: lockedCount 未満は取り消せず、ぜんぶけすは後ろだけ', () => {
  const cmds = [mv('right'), P, mv('down'), mv('right')];
  assert.equal(isLockedIndex(0, 2), true);
  assert.equal(isLockedIndex(1, 2), true);
  assert.equal(isLockedIndex(2, 2), false);
  assert.equal(clearUnlocked(cmds, 2), 2);
  assert.equal(cmds.length, 2);
  assert.equal(isPause(cmds[1]), true);
  assert.equal(clearUnlocked(cmds, 2), 0);
});

test('最初に戻す: lockedCount=0 なら命令を残したまま先頭から計画される', () => {
  const cmds = [mv('right', 2), P, mv('down')];
  const restarted = planRun(cmds, spec, 0);
  assert.equal(restarted.startIndex, 0);
  assert.equal(restarted.nextPause, 1);
  assert.equal(cmds.length, 3);
});
