// 移行元: .claude/verify/scenarios/repeat-box-engine.mjs（ブラウザ不要）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, chipCount } from '../js/engine-grid.js';

const spec = { grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, walls: [] };

test('engine-grid: くりかえしの箱{box,times}の経路・stepOwner・innerOwner・チップ数(Issue #66)', () => {
  const boxed = simulate([{ box: ['right', 'down'], times: 4 }], spec);
  const flat = simulate(['right', 'down', 'right', 'down', 'right', 'down', 'right', 'down'], spec);
  const mixed = simulate(['right', { box: ['down'], times: 2 }, { dir: 'right', times: 2 }], spec);

  assert.deepEqual(boxed.path, flat.path, '箱の経路は展開したフラット命令と一致');
  assert.equal(boxed.reachedGoal, true, '箱でゴールに到達');
  assert.deepEqual(boxed.stepOwner, Array(8).fill(0), 'stepOwnerは箱の外側index(すべて0)');
  assert.deepEqual(boxed.innerOwner, [0, 1, 0, 1, 0, 1, 0, 1], 'innerOwnerは箱内index(0,1の繰り返し)');
  assert.deepEqual(mixed.stepOwner, [0, 1, 1, 2, 2], '混在: stepOwner');
  assert.deepEqual(mixed.innerOwner, [-1, 0, 0, -1, -1], '混在: innerOwner(箱の外は-1)');
  assert.deepEqual(
    [chipCount(['right']), chipCount([{ dir: 'up', times: 3 }]), chipCount([{ box: ['up', 'down'], times: 2 }, 'left'])],
    [1, 1, 4],
    'チップ数: 単発1・まとめ1・箱=箱1+中2 と単発1'
  );

  const wall = simulate([{ box: ['left'], times: 2 }], spec);
  assert.equal(wall.blockedAt.every((i) => i === 0) && wall.blockedAt.length > 0, true, '箱内で盤外に当たるとblockedAtは箱のindex');
});
