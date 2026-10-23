// 「ぜんぶけす」取り消しの純関数テスト（Issue #549）。js/undo-clear.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearUnlocked } from '../js/ui-commands.js';
import { snapshotUnlocked, restoreUnlocked, undoRemaining, UNDO_CLEAR_MS } from '../js/undo-clear.js';

const mv = (dir, times = 1) => ({ dir, times });

test('消して戻すと同じ配列の中身が元に戻る（参照は同じ）', () => {
  const commands = [mv('right', 2), { box: [mv('up')], times: 3 }, mv('down')];
  const ref = commands;
  const before = JSON.parse(JSON.stringify(commands));
  const snap = snapshotUnlocked(commands, 0);
  clearUnlocked(commands, 0);
  assert.equal(commands.length, 0);
  assert.equal(restoreUnlocked(commands, snap, 0), 3);
  assert.equal(commands, ref);
  assert.deepEqual(commands, before);
});

test('複製なので、消した後の変更や復元後の変更が互いに影響しない', () => {
  const commands = [{ box: [mv('up')], times: 2 }];
  const snap = snapshotUnlocked(commands, 0);
  commands[0].box.push(mv('down'));
  assert.equal(snap[0].box.length, 1);
  clearUnlocked(commands, 0);
  restoreUnlocked(commands, snap, 0);
  commands[0].box.push(mv('left'));
  assert.equal(snap[0].box.length, 1);
});

test('止まった間（lockedCount>0）は前の部分を変えず後ろだけ戻す', () => {
  const commands = [mv('right'), { pause: true }, mv('down'), mv('left')];
  const snap = snapshotUnlocked(commands, 2);
  assert.deepEqual(snap, [mv('down'), mv('left')]);
  clearUnlocked(commands, 2);
  assert.equal(commands.length, 2);
  assert.equal(restoreUnlocked(commands, snap, 2), 2);
  assert.deepEqual(commands, [mv('right'), { pause: true }, mv('down'), mv('left')]);
});

test('消した後に命令が足されていたら戻さない', () => {
  const commands = [mv('right')];
  const snap = snapshotUnlocked(commands, 0);
  clearUnlocked(commands, 0);
  commands.push(mv('up'));
  assert.equal(restoreUnlocked(commands, snap, 0), 0);
  assert.deepEqual(commands, [mv('up')]);
});

test('空の複製は戻さない', () => {
  const commands = [];
  assert.equal(restoreUnlocked(commands, snapshotUnlocked(commands, 0), 0), 0);
  assert.equal(restoreUnlocked(commands, null, 0), 0);
});

test('undoRemaining: 5秒で1→0、範囲外は丸める', () => {
  assert.equal(UNDO_CLEAR_MS, 5000);
  assert.equal(undoRemaining(0), 1);
  assert.equal(undoRemaining(2500), 0.5);
  assert.equal(undoRemaining(5000), 0);
  assert.equal(undoRemaining(9000), 0);
  assert.equal(undoRemaining(-10), 1);
});
