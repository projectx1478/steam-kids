// #397 段2: 盤面エディタの cellPx（マス大きさ）の丸め・範囲。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCellPx, wheelCellPx, zoomPercent, CELL_PX_MIN, CELL_PX_MAX, CELL_PX_DEFAULT, SAMPLE_SPEC, EMPTY_SPEC, EDITOR_MAX_SIZE, pendingSwitches, switchModeOptions, switchGroupOptions, pendingGroupSwitches, pendingKeys, pendingBridges, pendingPaint, selectionHint } from '../tools/editor/editor-view.js';
import { analyzeSpec } from '../tools/editor/validate-worker.mjs';

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

test('editor-view: EMPTY_SPEC はサイズ内でクリア可（#512）', () => {
  assert.ok(EMPTY_SPEC.grid.cols <= EDITOR_MAX_SIZE && EMPTY_SPEC.grid.rows <= EDITOR_MAX_SIZE);
  const r = analyzeSpec(EMPTY_SPEC);
  assert.equal(r.clearable, true);
  assert.equal((r.messages || []).length, 0);
});

test('editor-view: EMPTY_SPEC.walls は配列（#514 起動時に renderGrid が walls.map で落ちない）', () => {
  assert.ok(Array.isArray(EMPTY_SPEC.walls));
});

test('editor-view: pendingSwitches は targets が空で group も無いスイッチだけ', () => {
  assert.deepEqual(pendingSwitches(SAMPLE_SPEC), []);
  assert.deepEqual(pendingSwitches({ switches: [{ x: 1, y: 2, targets: [] }, { x: 0, y: 0, group: 'g' }, { x: 3, y: 3 }] }), [{ index: 0, x: 1, y: 2 }, { index: 2, x: 3, y: 3 }]);
  assert.deepEqual(pendingSwitches({}), []);
});

test('editor-view: switchModeOptions は共有・toggle（氷・クッション）をグレーにし、mode 混在はグレーにしない（#530）', () => {
  const dis = (spec, i) => switchModeOptions(spec, i).map((o) => o.disabled);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [] }] }, 0), [false, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0, mode: 'close' }] }, 0), [false, false, false]); // 相手が close でも open・toggle を選べる
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, 0), [false, false, false]); // 相手が open でも close・toggle を選べる
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [{ x: 5, y: 5 }] }, { x: 1, y: 0, targets: [{ x: 5, y: 5 }] }] }, 0), [false, true, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'toggle' }] }, 0), [false, false, false]); // 単独なら戻せる
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'toggle' }, { x: 1, y: 0, mode: 'toggle' }] }, 0), [false, false, false]); // toggle 同士でも open・close を選べる
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }], ice: [{ x: 0, y: 0 }] }, 0), [false, false, true]); // 氷の上は toggle 不可
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }], cushion: [{ x: 0, y: 0 }] }, 0), [false, false, true]); // クッションの上も
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, group: 'a' }] }, 0), [false, false, false]); // group 付きでも close・toggle を選べる
  assert.ok(switchModeOptions({ switches: [{ x: 0, y: 0, targets: [{ x: 5, y: 5 }] }, { x: 1, y: 0, targets: [{ x: 5, y: 5 }] }] }, 0)[1].reason.length > 0);
});

test('editor-view: switchGroupOptions は targets あり・他が使用中の group をグレーにする', () => {
  const dis = (spec, i) => switchGroupOptions(spec, i).map((o) => o.disabled);
  assert.deepEqual(switchGroupOptions({ switches: [{ x: 0, y: 0 }] }, 0).map((o) => o.value), ['', 'a', 'b', 'c', 'd']);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [] }] }, 0), [false, false, false, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'close' }] }, 0), [false, false, false, false, false]); // close・toggle でも group を付けられる（#530）
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, mode: 'toggle' }] }, 0), [false, false, false, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, targets: [{ x: 3, y: 3 }] }] }, 0), [false, true, true, true, true]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0 }, { x: 1, y: 0, group: 'b' }] }, 0), [false, false, true, false, false]);
  assert.deepEqual(dis({ switches: [{ x: 0, y: 0, group: 'b' }] }, 0), [false, false, false, false, false]); // 自分の group は選べる
  assert.ok(switchGroupOptions({ switches: [{ x: 0, y: 0, targets: [{ x: 3, y: 3 }] }] }, 0)[1].reason.length > 0);
  assert.ok(switchGroupOptions({ switches: [{ x: 0, y: 0, group: 'zz' }] }, 0).some((o) => o.value === 'zz')); // 盤にある別名も並ぶ
});

test('editor-view: group のスイッチでも close・toggle はグレーにならない。pendingGroupSwitches は壁の無い group だけ', () => {
  assert.deepEqual(switchModeOptions({ switches: [{ x: 0, y: 0, group: 'a' }] }, 0).map((o) => o.disabled), [false, false, false]);
  const spec = { switches: [{ x: 0, y: 0, group: 'a' }, { x: 1, y: 0, group: 'b' }, { x: 2, y: 0, targets: [] }], groupWalls: [{ x: 3, y: 3, group: 'b' }] };
  assert.deepEqual(pendingGroupSwitches(spec), [{ index: 0, x: 0, y: 0 }]);
  assert.deepEqual(pendingGroupSwitches({}), []);
});

test('editor-view: pendingKeys はかぎの無いドア・ドアの無いかぎ', () => {
  assert.deepEqual(pendingKeys(SAMPLE_SPEC), []);
  assert.deepEqual(pendingKeys({}), []);
  const spec = { keys: [{ x: 0, y: 0, color: 'red' }, { x: 1, y: 0, color: 'blue' }], doors: [{ x: 2, y: 0, color: 'red' }, { x: 3, y: 0, color: 'blue' }, { x: 4, y: 0, color: 'blue' }] };
  assert.deepEqual(pendingKeys(spec), []);
  assert.deepEqual(pendingKeys({ doors: [{ x: 2, y: 0, color: 'red' }] }), [{ kind: 'doors', index: 0, x: 2, y: 0 }]);
  assert.deepEqual(pendingKeys({ keys: [{ x: 1, y: 1, color: 'red' }], doors: [{ x: 2, y: 0, color: 'blue' }] }), [{ kind: 'doors', index: 0, x: 2, y: 0 }, { kind: 'keys', index: 0, x: 1, y: 1 }]);
});

test('editor-view: pendingBridges は上下左右に水が無い橋だけ', () => {
  assert.deepEqual(pendingBridges(SAMPLE_SPEC), []);
  assert.deepEqual(pendingBridges({}), []);
  assert.deepEqual(pendingBridges({ bridge: [{ x: 1, y: 1 }] }), [{ index: 0, x: 1, y: 1 }]);
  assert.deepEqual(pendingBridges({ water: [{ x: 2, y: 2 }], bridge: [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 1 }] }), [{ index: 1, x: 1, y: 1 }]); // 斜めは隣でない
});

test('editor-view: pendingPaint は目標に含まれない start・goal だけ', () => {
  const base = { start: { x: 0, y: 0 }, goal: { x: 3, y: 3 } };
  assert.deepEqual(pendingPaint(base), []); // paint 未使用
  assert.deepEqual(pendingPaint({ ...base, paint: [] }), []);
  assert.deepEqual(pendingPaint({ ...base, paint: [{ x: 1, y: 0 }] }), [{ kind: 'start', x: 0, y: 0 }, { kind: 'goal', x: 3, y: 3 }]);
  assert.deepEqual(pendingPaint({ ...base, paint: [{ x: 0, y: 0 }] }), [{ kind: 'goal', x: 3, y: 3 }]);
  assert.deepEqual(pendingPaint({ ...base, paint: [{ x: 0, y: 0 }, { x: 3, y: 3 }] }), []);
});

test('editor-view: selectionHint は選択中のスイッチ・かぎ・ドア・周期ドアの案内を返す', () => {
  const spec = { switches: [{ x: 1, y: 1 }, { x: 2, y: 2, group: 'g1' }], keys: [{ x: 3, y: 3, color: 'red' }], doors: [{ x: 4, y: 4, color: 'red' }], periodic: [{ x: 0, y: 0, period: 2 }] };
  assert.equal(selectionHint(spec, 'switches', { x: 1, y: 1 }, null), 'スイッチ (1,1) を選択中：空きマスを押すと壁をつなぎます（はずすにはスイッチをもう一度押す）');
  assert.equal(selectionHint(spec, 'switches', { x: 2, y: 2 }, null), 'スイッチ (2,2) を選択中：空きマスを押すとgroup「g1」の壁をつなぎます（はずすにはスイッチをもう一度押す）');
  assert.equal(selectionHint(spec, 'keys', null, { kind: 'keys', x: 3, y: 3 }), 'かぎ (3,3) を選択中：空きマスを押すと新しいかぎを置きます（もう一度押すと選択解除）');
  assert.equal(selectionHint(spec, 'doors', null, { kind: 'doors', x: 4, y: 4 }), 'ドア (4,4) を選択中：空きマスを押すと新しいドアを置きます（もう一度押すと選択解除）');
  assert.equal(selectionHint(spec, 'periodic', null, { kind: 'periodic', x: 0, y: 0 }), '周期ドア (0,0) を選択中：空きマスを押すと新しい周期ドアを置きます（もう一度押すと選択解除）');
});

test('editor-view: selectionHint は未選択・別パレット・実在しない選択で空', () => {
  const spec = { switches: [{ x: 1, y: 1 }], keys: [], doors: [] };
  assert.equal(selectionHint(spec, 'switches', null, null), '');
  assert.equal(selectionHint(spec, 'walls', { x: 1, y: 1 }, null), '');
  assert.equal(selectionHint(spec, 'switches', { x: 9, y: 9 }, null), '');
  assert.equal(selectionHint(spec, 'keys', null, { kind: 'keys', x: 3, y: 3 }), '');
  assert.equal(selectionHint(spec, 'doors', null, { kind: 'keys', x: 3, y: 3 }), '');
});
