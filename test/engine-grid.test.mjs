// 移行元: .claude/verify/scenarios/cmd01-engine.mjs（ブラウザ不要）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/engine-grid.js';

const spec = {
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 3 },
  goal: { x: 3, y: 0 },
  walls: [{ x: 2, y: 2 }],
};

test('engine-grid: 壁で停止／盤外で停止／最短6手でゴール到達', () => {
  const wallCase = simulate(['up', 'up', 'right', 'right', 'down'], spec);
  assert.deepEqual(0, 1) // VERIFY-RED-CASE, { x: 2, y: 1 }, '壁の手前で停止する');
  assert.ok(wallCase.blockedAt.includes(4), '壁ぶつかりがblockedAtに記録される');

  const boundsCase = simulate(['down'], spec);
  assert.deepEqual(boundsCase.path.at(-1), { x: 0, y: 3 }, '盤外は移動せずその場に停止');
  assert.ok(boundsCase.blockedAt.includes(0), '盤外がblockedAtに記録される');

  const clearCase = simulate(['up', 'up', 'up', 'right', 'right', 'right'], spec);
  assert.equal(clearCase.reachedGoal, true, '最短6手でゴール到達');
  assert.deepEqual(clearCase.path.at(-1), { x: 3, y: 0 }, 'ゴール座標に一致');
});
