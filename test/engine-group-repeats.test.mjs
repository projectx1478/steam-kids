// 移行元: .claude/verify/scenarios/group-repeats-engine.mjs のエンジン部分（ブラウザ不要）。
// 表示ラベルの検証（renderCommandQueue・DOM依存）は group-repeats-ui シナリオ（E2E）に残す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/engine-grid.js';

const spec = {
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 3 },
  goal: { x: 3, y: 0 },
  walls: [{ x: 2, y: 2 }],
};

test('engine-grid: まとめ命令({dir,times})の経路・stepOwner(Issue #48)', () => {
  const grouped = simulate([{ dir: 'up', times: 3 }, { dir: 'right', times: 3 }], spec);
  const flat = simulate(['up', 'up', 'up', 'right', 'right', 'right'], spec);
  assert.deepEqual(grouped.path, flat.path, 'まとめ命令とフラット命令で経路が一致');
  assert.equal(grouped.reachedGoal, true, 'まとめ命令でもゴールに到達');
  assert.deepEqual(grouped.stepOwner, [0, 0, 0, 1, 1, 1], 'stepOwnerが元のチップindex(0が3回・1が3回)を指す');

  const blockedCase = simulate([{ dir: 'down', times: 5 }], spec);
  assert.deepEqual(blockedCase.path.at(-1), { x: 0, y: 3 }, '盤外へのまとめ命令はその場で停止');
  assert.deepEqual(blockedCase.blockedAt, [0, 0, 0, 0, 0], 'blockedAtは元のチップindex(0)を記録');
});
