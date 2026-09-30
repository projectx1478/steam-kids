// 移行元: .claude/verify/scenarios/items-engine.mjs（ブラウザ不要）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/engine-grid.js';

const spec = {
  grid: { cols: 3, rows: 1 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 0 },
  walls: [],
  items: [{ x: 1, y: 0 }],
};

test('engine-grid: play.itemsの回収・pickups・remainingItems(Issue #60)', () => {
  const collected = simulate(['right', 'right'], spec);
  assert.equal(collected.remainingItems.length, 0, '全item回収でremainingItemsが空');
  assert.deepEqual(collected.pickups, [[0], []], 'itemに乗った手のpickupsにインデックス0が入る');
  assert.equal(collected.reachedGoal, true, 'reachedGoalはtrue');

  // 1行盤面でupは盤外なのでstart(0,0)に留まり、item(1,0)を踏まない
  const skipped = simulate(['up'], spec);
  assert.deepEqual(skipped.remainingItems, spec.items, 'item未回収時はremainingItemsに残る');

  const dup = simulate(['right', 'right'], { ...spec, items: [{ x: 1, y: 0 }, { x: 1, y: 0 }] });
  assert.equal(dup.remainingItems.length, 0, '同一マスの複数itemも1回の通過でまとめて回収');
});
