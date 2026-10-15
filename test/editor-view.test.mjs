// #397 段2: 盤面エディタの cellPx（マス大きさ）の丸め・範囲。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCellPx, wheelCellPx, zoomPercent, CELL_PX_MIN, CELL_PX_MAX, CELL_PX_DEFAULT, SAMPLE_SPEC, EDITOR_MAX_SIZE, pendingSwitches, switchModeOptions, switchGroupOptions, pendingGroupSwitches } from '../tools/editor/editor-view.js';

test('editor-view: clampCellPx は正の整数で範囲内に収める', () => {
  assert.equal(clampCellPx(64), 64);
  assert.equal(clampCellPx(63.6), 64);
  assert.equal(clampCellPx(0), CELL_PX_MIN);
  assert.equal(clampCellPx(-5), CELL_PX_MIN);
  assert.equal(clampCellPx(1e6), CELL_PX_MAX);
  assert.equal(clampCellPx(NaN), CELL_PX_DEFAULT);
  assert.equal(clampCellPx('abc'), CELL_PX_DEFAULT);
});

test('editor-view: wheelCellPx は上で拡大・下で縮小し、端で止まる', () => {
  assert.ok(wheelCellPx(64, -100) > 64);
  assert.ok(wheelCellPx(64, 100) < 64);
  assert.equal(wheelCellPx(64, 0), 64);
  assert.equal(wheelCellPx(CELL_PX_MAX, -100), CELL_PX_MAX);
  assert.equal(wheelCellPx(CELL_PX_MIN, 100), CELL_PX_MIN);
  assert.ok(wheelCellPx(CELL_PX_MIN, -100) > CELL_PX_MIN); // 小さくても最低 1px は動く
});

test('editor-view: zoomPercent と例盤面のサイズ', () => {
  assert.equal(zoomPercent(CELL_PX_DEFAULT), 100);
  assert.equal(zoomPercent(CELL_PX_MAX), 200);
  assert.ok(SAMPLE_SPEC.grid.cols <= EDITOR_MAX_SIZE && SAMPLE_SPEC.grid.rows <= EDITOR_MAX_SIZE);
});

test('editor-view: pendingSwitches は targets が空で group も無いスイッチだけ', () => {
  assert.deepEqual(pendingSwitches(SAMPLE_SPEC), []);
  assert.deepEqual(pendingSwitches({ switches: [{ x: 1, y: 2, targets: [] }, { x: 0, y: 0, group: 'g' }, { x: 3, y: 3 }] }), [{ index: 0, x: 1, y: 2 }, { index: 2, x: 3, y: 3 }]);
  assert.deepEqual(pendingSwitches({}), []);
});

test('editor-view: switchModeOptions は併用禁止・共有・toggle の選択肢をグレーにする', () => {
  const dis = (spec, i) => switchModeOptions(spec, i).map((o) => o.disabled);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [] }] }, 0), [false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0, mode: 'close' }] }, 0), [true, false]); // 相手が close → open 不可
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, 0), [false, true]); // 相手が open → close 不可
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [{ x: 5, y: 5 }] }, { x: 1, y: 0, targets: [{ x: 5, y: 5 }] }] }, 0), [false, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'toggle' }] }, 0), [true, true]);
  assert.ok(switchModeOptions({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, 0)[1].reason.length > 0);
});

test('editor-view: switchGroupOptions は close・toggle・targets あり・他が使用中の group をグレーにする', () => {
  const dis = (spec, i) => switchGroupOptions(spec, i).map((o) => o.disabled);
  assert.deepEqual(switchGroupOptions({ switches: [{ x: 0, y: 0 }] }, 0).map((o) => o.value), ['', 'a', 'b', 'c', 'd']);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [] }] }, 0), [false, false, false, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'close' }] }, 0), [false, true, true, true, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'toggle' }] }, 0), [false, true, true, true, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [{ x: 3, y: 3 }] }] }, 0), [false, true, true, true, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0, group: 'b' }] }, 0), [false, false, true, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, group: 'b' }] }, 0), [false, false, false, false, false]); // 自分の group は選べる
  assert.ok(switchGroupOptions({ switches: [{ x: 0, y: 0, mode: 'close' }] }, 0)[1].reason.length > 0);
  assert.ok(switchGroupOptions({ switches: [{ x: 0, y: 0, group: 'zz' }] }, 0).some((o) => o.value === 'zz')); // 盤にある別名も並ぶ
});

test('editor-view: group のスイッチでは close がグレー。pendingGroupSwitches は壁の無い group だけ', () => {
  assert.deepEqual(switchModeOptions({ switches: [{ x: 0, y: 0, group: 'a' }] }, 0).map((o) => o.disabled), [false, true]);
  const spec = { switches: [{ x: 0, y: 0, group: 'a' }, { x: 1, y: 0, group: 'b' }, { x: 2, y: 0, targets: [] }], groupWalls: [{ x: 3, y: 3, group: 'b' }] };
  assert.deepEqual(pendingGroupSwitches(spec), [{ index: 0, x: 0, y: 0 }]);
  assert.deepEqual(pendingGroupSwitches({}), []);
});
