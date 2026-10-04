// 移行元: .claude/verify/scenarios/g-switches-engine.mjs（ブラウザ不要）
// switches：踏む前の対象は壁と同じ失敗、踏めば通れる。BFSは踏んだスイッチを状態に含む（Issue #63）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps } from '../js/engine-grid.js';

const base = { grid: { cols: 5, rows: 2 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
const gate = { ...base, walls: [{ x: 2, y: 0 }], switches: [{ x: 0, y: 0, targets: [{ x: 2, y: 1 }] }] };
const last = (r) => r.path[r.path.length - 1];

test('engine-grid: switchesの通行可否・滑走中の衝突・BFS・複数スイッチ(Issue #63)', () => {
  const closed = simulate(['right', 'right', 'right'], gate);
  assert.deepEqual(closed.blockedAt, [1, 2], '踏まずに対象へ当たると失敗(blockedAt)');
  assert.deepEqual(last(closed), { x: 1, y: 1 }, '対象の手前で止まる');

  const opened = simulate(['up', 'down', 'right', 'right', 'right', 'right'], gate);
  assert.deepEqual([opened.blockedAt, opened.reachedGoal], [[], true], 'スイッチを踏めば対象を通れる');

  const slide = simulate(['right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual([slide.blockedAt, last(slide)], [[0], { x: 1, y: 1 }], 'こおりの滑走で未解除の対象に当たると失敗');
  const slideOpen = simulate(['up', 'down', 'right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual([slideOpen.blockedAt, last(slideOpen)], [[], { x: 2, y: 1 }], '踏んだ後は滑走で対象の上まで進む');

  const two = {
    ...base,
    switches: [{ x: 0, y: 0, targets: [{ x: 1, y: 1 }] }, { x: 2, y: 0, targets: [{ x: 3, y: 1 }] }],
  };
  const half = simulate(['up', 'down', 'right', 'right', 'right'], two);
  assert.deepEqual(half.blockedAt, [4], '片方のスイッチだけでは2つ目の対象で失敗');

  const dist = [shortestSteps(gate), shortestSteps({ ...gate, switches: [{ x: 4, y: 0, targets: [{ x: 2, y: 1 }] }] }), shortestSteps(two)];
  assert.deepEqual(dist.slice(0, 2), [6, Infinity], '最短はスイッチ経由(6手)・スイッチに届かなければ到達不能');
  assert.equal(dist[2], 6, 'スイッチ2つを踏む最短は6手');
});

test('engine-grid: 同じ対象を共有する2スイッチはAND(片方では開かない・両方で開く)(Issue #250)', () => {
  const and = {
    grid: { cols: 5, rows: 3 },
    start: { x: 0, y: 1 },
    goal: { x: 4, y: 1 },
    walls: [{ x: 2, y: 0 }, { x: 2, y: 2 }],
    switches: [{ x: 1, y: 0, targets: [{ x: 2, y: 1 }] }, { x: 1, y: 2, targets: [{ x: 2, y: 1 }] }],
  };
  const one = simulate(['right', 'up', 'down', 'right', 'right', 'right'], and);
  assert.deepEqual([one.blockedAt, one.reachedGoal], [[3, 4, 5], false], '片方だけ踏んでも共有の対象で失敗');
  const both = simulate(['right', 'up', 'down', 'down', 'up', 'right', 'right', 'right'], and);
  assert.deepEqual([both.blockedAt, both.reachedGoal], [[], true], '両方踏めば通れる');
  assert.equal(shortestSteps(and), 8, '両方を踏む最短は8手');});

test('engine-grid: 氷上スイッチは滑走中の通過で作動し、対象が氷上でも壁扱いは変わらない(Issue #249)', () => {
  const onIce = {
    grid: { cols: 5, rows: 3 },
    start: { x: 0, y: 0 },
    goal: { x: 4, y: 2 },
    walls: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 4, y: 1 }],
    ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    switches: [{ x: 2, y: 0, targets: [{ x: 3, y: 2 }] }],
  };
  const r = simulate(['right', 'down', 'down', 'right'], onIce);
  assert.deepEqual([r.blockedAt, r.reachedGoal], [[], true], '氷上を滑って通過するだけでスイッチが作動する');
  assert.deepEqual(last(simulate(['right'], onIce)), { x: 3, y: 0 }, '氷の先の通常マスで止まる');
  const noSwitch = simulate(['right', 'down', 'down', 'right'], { ...onIce, switches: [] , walls: [...onIce.walls, { x: 3, y: 2 }] });
  assert.equal(noSwitch.reachedGoal, false, 'スイッチが無ければ対象は壁のまま');
});
