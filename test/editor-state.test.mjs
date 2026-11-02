// #397 段4: 盤面エディタの状態管理（置く・消す・動かす・元に戻す・やり直し、拒否値）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occupants, createState, setCellPx, setGrid, shrinkLoss, place, erase, move, undo, redo, toggleTarget, setSwitchColor, setSwitchMode, setSwitchGroup, setTargetInitial, setMaxPauses, COMPLEX_KEYS, HISTORY_MAX, setKeyColor, setDoorColor, setKeyMode, setPeriodicPeriod, setWaterMode, togglePaint, canUndo as canUndoState, addTutorialStep, setStepText, setTutorialScript, tutorialReach } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC, EDITOR_MAX_SIZE, pendingSwitches, switchModeOptions, switchGroupOptions, pendingGroupSwitches, pendingKeys, pendingBridges } from '../tools/editor/editor-view.js';
import { analyzeSpec } from '../tools/editor/validate-worker.mjs';

const fresh = () => createState(SAMPLE_SPEC);
const snap = (v) => JSON.parse(JSON.stringify(v));
const hasAt = (arr, x, y) => (arr || []).some((c) => c.x === x && c.y === y);

test('editor-state: 置く→消す→元に戻す で元の spec と一致', () => {
  const s = fresh();
  const original = snap(s.spec);
  assert.equal(place(s, 'wall', 4, 4).ok, false); // ゴールの上
  assert.equal(place(s, 'wall', 2, 1).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
  assert.equal(erase(s, 2, 1).ok, true);
  assert.deepEqual(s.spec.walls, original.walls);
  assert.equal(undo(s).ok, true);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec, original);
  assert.equal(redo(s).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
});

test('editor-state: 重なりの拒否（状態は変わらない）。同種は何もしない、別種は上書き（#647）', () => {
  const s = fresh();
  const before = snap(s);
  assert.equal(place(s, 'wall', 1, 0).ok, true); // 壁の上に壁＝同種は何もしない
  assert.deepEqual(s, before); // 履歴にも積まない
  assert.equal(place(s, 'start', 4, 4).ok, false); // ゴールの上
  assert.equal(place(s, 'wall', 4, 4).ok, false); // ゴールの上へは上書き不可
  assert.equal(place(s, 'start', 1, 0).ok, false); // start・goal を置く側は壁の上に置けない
  assert.equal(place(s, 'wall', 9, 9).ok, false); // 盤外
  assert.deepEqual(s, before);
  assert.equal(place(s, 'items', 1, 0).ok, true); // 壁の上にアイテム＝壁を消して置く
  assert.ok(!s.spec.walls.some((c) => c.x === 1 && c.y === 0));
  assert.ok(s.spec.items.some((c) => c.x === 1 && c.y === 0));
});

test('editor-state: スタート・ゴールは各1個（置くと移る）、消せない', () => {
  const s = fresh();
  assert.equal(place(s, 'start', 0, 1).ok, true);
  assert.deepEqual(s.spec.start, { x: 0, y: 1 });
  assert.equal(erase(s, 0, 1).ok, false);
  assert.equal(erase(s, 4, 4).ok, false);
});

test('editor-state: 動かす（移動先に要素があれば拒否）', () => {
  const s = fresh();
  const before = snap(s.spec);
  assert.equal(move(s, 1, 0, 1, 1).ok, false); // 壁→壁
  assert.equal(move(s, 1, 0, 0, 0).ok, false); // 壁→スタート
  assert.deepEqual(s.spec, before);
  assert.equal(move(s, 1, 0, 2, 1).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
  assert.ok(!s.spec.walls.some((c) => c.x === 1 && c.y === 0));
  assert.equal(move(s, 0, 0, 0, 1).ok, true); // スタートも動く
  assert.deepEqual(s.spec.start, { x: 0, y: 1 });
  assert.equal(move(s, 3, 3, 3, 3).ok, false); // 同じマスは移動先に要素がある扱い
});

test('editor-state: COMPLEX_KEYS は空（paint も置ける。#523 段4）', () => {
  assert.deepEqual(COMPLEX_KEYS, []);
  const s = fresh();
  assert.equal(place(s, 'nothing', 2, 1).reason, 'nothing は置けない');
});

test('editor-state: 周期ドア（置く・period 変更・消す・動かす・undo/redo）', () => {
  const s = fresh();
  const original = snap(s.spec); // SAMPLE_SPEC は (4,2) に period 3 を持つ
  assert.equal(place(s, 'periodic', 4, 2).ok, true); // 同種は何もしない
  assert.deepEqual(s.spec, original);
  assert.equal(place(s, 'periodic', 9, 9).ok, false); // 盤外
  assert.equal(place(s, 'periodic', 2, 1).ok, true);
  assert.deepEqual(s.spec.periodic.at(-1), { x: 2, y: 1, period: 3 }); // 既定 3・初期位相なし
  for (const n of [2, 4, 3]) {
    assert.equal(setPeriodicPeriod(s, 2, 1, n).ok, true);
    assert.equal(s.spec.periodic.find((c) => c.x === 2 && c.y === 1).period, n);
  }
  assert.equal(setPeriodicPeriod(s, 2, 1, 5).ok, false);
  assert.equal(setPeriodicPeriod(s, 2, 1, '2').ok, false);
  assert.equal(setPeriodicPeriod(s, 0, 3, 2).ok, false); // 周期ドアが無いマス
  const len = s.history.length;
  assert.equal(setPeriodicPeriod(s, 2, 1, 3).ok, true); // 同値は履歴に積まない
  assert.equal(s.history.length, len);
  assert.equal(move(s, 2, 1, 3, 2).ok, true);
  assert.deepEqual(s.spec.periodic.at(-1), { x: 3, y: 2, period: 3 });
  assert.equal(move(s, 3, 2, 1, 0).ok, false); // 移動先に壁
  assert.equal(erase(s, 3, 2).ok, true);
  assert.equal(erase(s, 4, 2).ok, true);
  assert.equal('periodic' in s.spec, false); // 空になればキーごと消す
  while (canUndoState(s)) undo(s);
  assert.deepEqual(s.spec, original);
  assert.equal(redo(s).ok, true);
  assert.equal(s.spec.periodic.length, 2);
});

test('editor-state: ワープ（warps1/warps2）は1個ずつ置く・同マスは NG・消す・動かす・空で warps キー削除', () => {
  const s = fresh();
  const free = [];
  for (let y = 0; y < s.spec.grid.rows && free.length < 5; y++) for (let x = 0; x < s.spec.grid.cols && free.length < 5; x++) if (occupants(s.spec, x, y).length === 0) free.push({ x, y });
  assert.ok(free.length >= 5);
  const [a, b, c, d, e] = free;
  assert.equal(s.spec.warps, undefined);
  assert.equal(place(s, 'warps1', a.x, a.y).ok, true);
  assert.deepEqual(s.spec.warps, [{ x: a.x, y: a.y, pair: 1 }]);
  assert.equal(place(s, 'warps1', a.x, a.y).ok, true); // 同じ穴は何もしない
  assert.deepEqual(s.spec.warps, [{ x: a.x, y: a.y, pair: 1 }]);
  assert.equal(place(s, 'warps2', a.x, a.y).ok, true); // 同マスの別の組は上書き
  assert.deepEqual(s.spec.warps, [{ x: a.x, y: a.y, pair: 2 }]);
  assert.equal(place(s, 'warps1', a.x, a.y).ok, true); // 元の組に戻す
  assert.equal(place(s, 'warps1', b.x, b.y).ok, true);
  assert.equal(place(s, 'warps2', c.x, c.y).ok, true);
  assert.equal(place(s, 'warps2', d.x, d.y).ok, true);
  assert.deepEqual(s.spec.warps.map((w) => w.pair), [1, 1, 2, 2]);
  assert.equal(place(s, 'warps1', 99, 99).ok, false); // 盤外
  assert.equal(move(s, c.x, c.y, a.x, a.y).ok, false); // 移動先に要素
  assert.equal(move(s, c.x, c.y, e.x, e.y).ok, true);
  assert.deepEqual(s.spec.warps[2], { x: e.x, y: e.y, pair: 2 }); // pair は保たれる
  assert.equal(erase(s, e.x, e.y).ok, true); // 1個ずつ消える
  assert.equal(s.spec.warps.length, 3);
  for (const w of [a, b, d]) assert.equal(erase(s, w.x, w.y).ok, true);
  assert.equal('warps' in s.spec, false); // 空になったらキーごと消える
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.warps.length, 1);
});

test('editor-state: 単純なギミック（items・ice・cushion・water）は置ける。空になった配列は消える', () => {
  for (const key of ['items', 'ice', 'cushion', 'water']) {
    const s = createState({ grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [] });
    assert.equal(place(s, key, 1, 1).ok, true, key);
    assert.deepEqual(s.spec[key], [{ x: 1, y: 1 }]);
  }
  const t = createState({ grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [] });
  assert.equal(place(t, 'water', 1, 1).ok, true);
  assert.deepEqual(t.spec.water, [{ x: 1, y: 1 }]);
  assert.equal(erase(t, 1, 1).ok, true);
  assert.equal('water' in t.spec, false);
});

test('editor-state: cellPx は整数のみ・8〜128', () => {
  const s = fresh();
  for (const bad of [63.5, NaN, Infinity, '64', null, undefined, 7, 0, -1, 129, 1000]) {
    assert.equal(setCellPx(s, bad).ok, false, String(bad));
    assert.equal(s.cellPx, 64);
  }
  assert.equal(setCellPx(s, 8).ok, true);
  assert.equal(setCellPx(s, 128).ok, true);
  assert.equal(s.cellPx, 128);
});

test('editor-state: 範囲外の undo/redo は何もしない', () => {
  const s = fresh();
  assert.equal(undo(s).ok, false);
  assert.equal(redo(s).ok, false);
  assert.equal(s.cursor, 0);
  place(s, 'wall', 2, 1);
  assert.equal(redo(s).ok, false);
  assert.equal(s.cursor, 1);
  undo(s);
  assert.equal(undo(s).ok, false);
  assert.equal(s.cursor, 0);
  assert.equal(s.history.length, 2);
});

test('editor-state: 途中で戻って新しい編集をすると cursor より後ろは破棄', () => {
  const s = fresh();
  place(s, 'wall', 2, 1);
  place(s, 'wall', 3, 2);
  undo(s);
  undo(s);
  assert.equal(place(s, 'ice', 1, 3).ok, true);
  assert.equal(s.history.length, 2);
  assert.equal(s.cursor, 1);
  assert.equal(redo(s).ok, false);
});

test('editor-state: history は100まで。超えたら先頭から捨てる', () => {
  assert.equal(HISTORY_MAX, 100);
  const t = createState({ grid: { cols: 6, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [] });
  const firstSnapshot = snap(t.history[0]);
  for (let i = 0; i < 150; i++) assert.equal((i % 2 === 0 ? place(t, 'wall', 2, 0) : erase(t, 2, 0)).ok, true);
  assert.equal(t.history.length, HISTORY_MAX);
  assert.equal(t.cursor, HISTORY_MAX - 1);
  // 先頭（元の spec）は捨てられている。150回目の後は壁なし(偶数回目の消す)だが、先頭は 51 件目の状態
  assert.notDeepEqual(t.history[0], firstSnapshot);
  assert.deepEqual(t.history[0], { grid: { cols: 6, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [{ x: 2, y: 0 }] });
  // 戻れるのは 99 回まで
  let n = 0;
  while (undo(t).ok) n++;
  assert.equal(n, HISTORY_MAX - 1);
});

test('editor-state: EDITOR_MAX_SIZE を超える盤面の変更は拒否', () => {
  const s = fresh();
  assert.equal(setGrid(s, EDITOR_MAX_SIZE + 1, 5).ok, false);
  assert.equal(setGrid(s, 5, EDITOR_MAX_SIZE + 1).ok, false);
  assert.equal(setGrid(s, 0, 5).ok, false);
  assert.equal(setGrid(s, 5.5, 5).ok, false);
  assert.equal(setGrid(s, 3, 3).ok, false); // ゴールなど要素が盤外になる
  assert.deepEqual(s.spec.grid, { cols: 5, rows: 5 });
  assert.equal(setGrid(s, EDITOR_MAX_SIZE, EDITOR_MAX_SIZE).ok, true);
  assert.deepEqual(s.spec.grid, { cols: 20, rows: 20 });
  assert.equal(EDITOR_MAX_SIZE, 20);
});

test('editor-state: setGrid は同サイズなら履歴に積まない', () => {
  const s = fresh();
  const len = s.history.length;
  const cursor = s.cursor;
  assert.equal(setGrid(s, 5, 5).ok, true);
  assert.equal(s.history.length, len);
  assert.equal(s.cursor, cursor);
  assert.equal(setGrid(s, 6, 5).ok, true);
  assert.equal(s.history.length, len + 1);
});

test('editor-state: 5×5→7×6→元に戻す→5×5、はみ出す縮小は拒否して spec 不変', () => {
  const s = fresh();
  assert.equal(setGrid(s, 7, 6).ok, true);
  assert.deepEqual(s.spec.grid, { cols: 7, rows: 6 });
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec.grid, { cols: 5, rows: 5 });
  const len = s.history.length;
  const r = setGrid(s, 3, 3);
  assert.equal(r.ok, false);
  assert.ok(r.reason);
  assert.deepEqual(s.spec.grid, { cols: 5, rows: 5 });
  assert.equal(s.history.length, len);
});

// ---- #647 段3: 縮小で盤外の要素を消す ----
const big = (extra) => createState({ grid: { cols: 6, rows: 6 }, start: { x: 0, y: 0 }, goal: { x: 1, y: 0 }, ...extra });

test('editor-state: 縮小 盤外の各要素が消えて1手で戻る（件数はドライランで数える）', () => {
  const extra = {
    walls: [{ x: 5, y: 0 }, { x: 1, y: 1 }],
    items: [{ x: 4, y: 4 }],
    ice: [{ x: 0, y: 5 }],
    cushion: [{ x: 5, y: 5 }],
    water: [{ x: 4, y: 1 }],
    bridge: [{ x: 5, y: 1 }],
    warps: [{ x: 4, y: 2, pair: 'a' }, { x: 1, y: 2, pair: 'a' }],
    keys: [{ x: 4, y: 3, color: 'red' }],
    doors: [{ x: 1, y: 3, color: 'red' }],
    keyMode: 'consume',
    periodic: [{ x: 5, y: 2, period: 2 }],
    switches: [{ x: 5, y: 3, group: 'g', targets: [{ x: 2, y: 2 }] }],
    groupWalls: [{ x: 4, y: 5, group: 'g' }],
    paint: [{ x: 5, y: 4 }],
  };
  const s = big(extra);
  const before = snap(s.spec);
  const len = s.history.length;
  const loss = shrinkLoss(s, 4, 4);
  assert.deepEqual(snap(s.spec), before); // ドライランは state 不変
  assert.equal(s.history.length, len);
  assert.equal(loss.ok, true);
  assert.equal(loss.count, 12);
  assert.equal(setGrid(s, 4, 4).ok, true);
  assert.equal(s.history.length, len + 1); // commit は1回
  assert.deepEqual(s.spec.grid, { cols: 4, rows: 4 });
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    if ((x >= 4 || y >= 4)) assert.equal(occupants(s.spec, x, y).length, 0, `${x},${y}`);
  }
  // 盤内は残る（ワープ・鍵ドアの片方、盤内の壁）
  assert.deepEqual(s.spec.walls, [{ x: 1, y: 1 }]);
  assert.deepEqual(s.spec.warps, [{ x: 1, y: 2, pair: 'a' }]);
  assert.deepEqual(s.spec.doors, [{ x: 1, y: 3, color: 'red' }]);
  assert.equal(s.spec.keys, undefined);
  assert.equal(s.spec.paint, undefined);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(snap(s.spec), before);
});

test('editor-state: 縮小 同居（壁＋目標マス・氷＋スイッチ対象）も盤外から消える', () => {
  const s = big({ walls: [{ x: 5, y: 5 }], paint: [{ x: 5, y: 5 }], ice: [{ x: 4, y: 0 }], switches: [{ x: 0, y: 2, targets: [{ x: 4, y: 0 }] }] });
  assert.equal(shrinkLoss(s, 4, 4).count, 4);
  assert.equal(setGrid(s, 4, 4).ok, true);
  assert.equal(s.spec.ice, undefined);
  assert.deepEqual(s.spec.switches[0].targets, []);
  assert.equal(s.spec.paint, undefined);
  assert.deepEqual(s.spec.walls, []);
});

test('editor-state: 縮小 start・goal が盤外なら拒否して state 不変、盤外が空なら件数0で拡大は不変', () => {
  const s = big({ walls: [{ x: 5, y: 5 }], goal: { x: 5, y: 0 } });
  const before = snap(s.spec);
  const len = s.history.length;
  assert.equal(shrinkLoss(s, 4, 4).ok, false);
  assert.equal(setGrid(s, 4, 4).ok, false);
  assert.deepEqual(snap(s.spec), before);
  assert.equal(s.history.length, len);
  const t = big({});
  assert.equal(shrinkLoss(t, 4, 4).count, 0);
  assert.equal(shrinkLoss(t, 8, 8).count, 0);
  assert.equal(setGrid(t, 8, 8).ok, true);
});

// ---- スイッチ（#404 段A）。盤は床だけの 5×1。----
const row = () => createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
const line = (spec) => analyzeSpec({ ...spec, maxCommands: 20 });

test('editor-state: スイッチを置くと接続待ち（targets 空）。validate は落ちる', () => {
  const s = row();
  assert.equal(place(s, 'switches', 1, 0).ok, true);
  assert.deepEqual(s.spec.switches, [{ x: 1, y: 0, color: 'blue', targets: [] }]);
  assert.deepEqual(pendingSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
  const r = line(s.spec);
  assert.equal(r.clearable, false);
  assert.ok(r.messages.some((m) => m.includes('targetsが空')));
  assert.equal(place(s, 'switches', 1, 0).ok, false); // 重なり
});

test('editor-state: 壁のタップで targets をトグル（1手ずつ history に入る）。つないだ盤は validate を通る', () => {
  const s = createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [{ x: 2, y: 1 }] }); // (2,0) だけが通り道
  place(s, 'switches', 1, 0);
  const n = s.history.length;
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.deepEqual(pendingSwitches(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true); // もう一度で外す
  assert.deepEqual(s.spec.switches[0].targets, []);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.equal(toggleTarget(s, 1, 0, 4, 0).ok, false); // ゴールの上
  assert.equal(toggleTarget(s, 1, 0, 1, 0).ok, false); // スイッチ自身
  assert.equal(toggleTarget(s, 3, 1, 3, 0).ok, false); // スイッチが無い
});

test('editor-state: close と open は併用できる（#530）。close は対象を共有できない。close の盤は validate を通る', () => {
  const s = createState({ grid: { cols: 5, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
  place(s, 'switches', 1, 0);
  place(s, 'switches', 1, 2); // 選択を外して2つ目
  assert.deepEqual(switchModeOptions(s.spec, 1).map((o) => o.disabled), [false, false, false]); // 相手が open でも close・toggle を選べる
  assert.equal(setSwitchMode(s, 1, 2, 'bogus').ok, false);
  assert.equal(setSwitchMode(s, 1, 2, 'close').ok, true);
  assert.equal(s.spec.switches[1].mode, 'close');
  assert.equal(setSwitchMode(s, 1, 2, 'open').ok, true); // 混在から戻せる
  // 混在の盤は validate の mode 併用では落ちない
  const both = JSON.parse(JSON.stringify(s.spec));
  both.switches[0].mode = 'close';
  both.switches[0].targets = [{ x: 2, y: 0 }];
  both.switches[1].targets = [{ x: 2, y: 2 }];
  assert.ok(!line(both).messages.some((m) => m.includes('併用できない')));
  // 1つだけなら close にできる
  const t = createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
  place(t, 'switches', 1, 0);
  toggleTarget(t, 1, 0, 3, 0);
  assert.equal(setSwitchMode(t, 1, 0, 'close').ok, true);
  assert.equal(t.spec.switches[0].mode, 'close');
  assert.equal(place(t, 'switches', 2, 0).ok, true); // 新しいスイッチは close を引き継ぐ
  assert.equal(t.spec.switches[1].mode, 'close');
  assert.equal(setSwitchMode(t, 1, 0, 'open').ok, true); // 混在になっても open へ変えられる
  assert.equal(setSwitchMode(t, 1, 0, 'close').ok, true);
  assert.equal(toggleTarget(t, 2, 0, 3, 0).ok, false); // close は対象を共有できない
  assert.equal(setSwitchColor(t, 1, 0, 'red').ok, true);
  assert.equal(t.spec.switches[0].color, 'red');
  assert.equal(setSwitchColor(t, 1, 0, 'green').ok, false);
});

test('editor-state: open 同士は壁を共有できる（最大2）。氷の上にスイッチは置ける', () => {
  const s = createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 1 }, walls: [], ice: [{ x: 0, y: 1 }] });
  assert.equal(place(s, 'switches', 0, 1).ok, true); // 氷の上
  place(s, 'switches', 1, 1);
  place(s, 'switches', 2, 1);
  assert.equal(toggleTarget(s, 0, 1, 3, 1).ok, true);
  assert.equal(toggleTarget(s, 1, 1, 3, 1).ok, true);
  assert.equal(toggleTarget(s, 2, 1, 3, 1).ok, false); // 3つ目
  assert.equal(erase(s, 3, 1).ok, true); // 壁を消すと持ち主全員から外れる
  assert.deepEqual(s.spec.switches.map((c) => c.targets.length), [0, 0, 0]);
  assert.equal(erase(s, 0, 1).ok, true); // スイッチだけ消え、氷は残る
  assert.deepEqual(s.spec.ice, [{ x: 0, y: 1 }]);
  assert.equal(s.spec.switches.length, 2);
});

test('editor-state: スイッチ本体＋氷のマスは、別タイルの上書きで氷も消え1手で戻る（#647）', () => {
  const s = createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 1 }, walls: [], ice: [{ x: 0, y: 1 }] });
  place(s, 'switches', 0, 1);
  const before = snap(s.spec);
  assert.equal(place(s, 'wall', 0, 1).ok, true);
  assert.equal(hasAt(s.spec.ice, 0, 1), false);
  assert.equal(hasAt(s.spec.switches, 0, 1), false);
  assert.equal(hasAt(s.spec.walls, 0, 1), true);
  assert.equal(undo(s).ok, true); // 1手で戻る
  assert.deepEqual(snap(s.spec), before);
  assert.equal(place(s, 'ice', 0, 1).ok, true); // 氷を置く操作は従来どおり（同種なので何もしない）
  assert.deepEqual(snap(s.spec), before);
});

test('editor-state: スイッチと対象を動かす／消す', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  toggleTarget(s, 1, 0, 3, 0);
  assert.equal(move(s, 3, 0, 2, 0).ok, true); // 対象の壁
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.equal(move(s, 1, 0, 2, 0).ok, false); // 対象の上
  assert.equal(move(s, 1, 0, 1, 0).ok, false);
  assert.equal(move(s, 1, 0, 3, 0).ok, true);
  assert.deepEqual([s.spec.switches[0].x, s.spec.switches[0].y], [3, 0]);
  assert.equal(erase(s, 3, 0).ok, true);
  assert.equal('switches' in s.spec, false);
});

// ---- #404 段B: group・groupWalls ----
const gboard = () => createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [{ x: 2, y: 1 }] }); // (2,0) だけが通り道

test('editor-state(group): group を付けて壁をトグル。つないだ盤は validate を通り、壁が無い間は落ちる', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'a').ok, true);
  assert.deepEqual(s.spec.switches, [{ x: 1, y: 0, color: 'blue', group: 'a' }]); // targets は持たない
  assert.deepEqual(pendingGroupSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
  assert.equal(line(s.spec).clearable, false); // 対応する groupWalls が無い
  const n = s.history.length;
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.deepEqual(pendingGroupSwitches(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(line(s.spec).clearable, true);
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true); // もう一度で外す
  assert.equal('groupWalls' in s.spec, false);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.equal(toggleTarget(s, 1, 0, 4, 0).ok, false); // ゴールの上
  assert.equal(toggleTarget(s, 1, 0, 2, 1).ok, false); // 壁の上
});

test('editor-state(group): place(groupWalls)・erase・move と、スイッチを消すと壁も消える', () => {
  const s = gboard();
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, false); // スイッチが無い
  place(s, 'switches', 1, 0);
  setSwitchGroup(s, 1, 0, 'a');
  assert.equal(place(s, 'groupWalls', 2, 0, 'b').ok, false); // b のスイッチが無い
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, true);
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, false); // 重なり
  assert.equal(place(s, 'groupWalls', 3, 0, 'a').ok, true);
  assert.equal(move(s, 3, 0, 2, 0).ok, false); // 移動先に壁
  assert.equal(move(s, 3, 0, 3, 1).ok, true);
  assert.deepEqual(s.spec.groupWalls.map((w) => [w.x, w.y]), [[2, 0], [3, 1]]);
  assert.equal(erase(s, 3, 1).ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.equal(erase(s, 1, 0).ok, true); // スイッチを消すと壁は床に戻る（持ち主がいないと validate が落ちるため）
  assert.equal('groupWalls' in s.spec, false);
  assert.equal('switches' in s.spec, false);
});

test('editor-state(group): 併用禁止（targets・同じ group）は拒否。state は変わらない。close・toggle との併用は許可（#530）', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  place(s, 'switches', 3, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'a').ok, true);
  assert.equal(setSwitchGroup(s, 3, 0, 'a').ok, false); // 同じ group は1スイッチだけ
  assert.equal(setSwitchGroup(s, 3, 0, 'bogus').ok, false);
  assert.equal(setSwitchGroup(s, 4, 1, 'b').ok, false); // スイッチが無い
  const before = snap(s.spec);
  toggleTarget(s, 3, 0, 2, 0); // 3,0 は targets 方式
  assert.equal(setSwitchGroup(s, 3, 0, 'b').ok, false); // targets と group
  assert.equal(setSwitchGroup(s, 3, 0, 'b').reason.includes('targets'), true);
  undo(s);
  assert.deepEqual(s.spec, before);
  const t = gboard();
  place(t, 'switches', 1, 0);
  setSwitchMode(t, 1, 0, 'close');
  assert.equal(setSwitchGroup(t, 1, 0, 'a').ok, true); // close と group は併用できる
  assert.equal(t.spec.switches[0].group, 'a');
  assert.equal(setSwitchMode(t, 1, 0, 'open').ok, true);
  assert.equal(setSwitchMode(t, 1, 0, 'close').ok, true); // group を付けたまま mode を変えられる
  const m = gboard();
  m.spec.switches = [{ x: 1, y: 0, mode: 'toggle', color: 'blue', targets: [] }];
  assert.equal(setSwitchGroup(m, 1, 0, 'a').ok, true); // toggle と group も併用できる
  // targets と group の併用は validate も落ちる
  const bad = snap(s.spec);
  bad.switches[0].targets = [{ x: 2, y: 0 }];
  bad.groupWalls = [{ x: 2, y: 0, group: 'a' }];
  assert.equal(line(bad).clearable, false);
  assert.ok(line(bad).messages.length > 0);
});

test('editor-state(group): group を変える／なしに戻す。壁が付いていく・床に戻る', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  setSwitchGroup(s, 1, 0, 'a');
  toggleTarget(s, 1, 0, 2, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'b').ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'b' }]);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(setSwitchGroup(s, 1, 0, '').ok, true);
  assert.equal('groupWalls' in s.spec, false);
  assert.deepEqual(s.spec.switches[0].targets, []);
  assert.deepEqual(pendingSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
});

// ---- toggle（#404 段C）----
test('editor-state(toggle): mode を toggle にして壁を複数つなぎ、壁ごとに initial を closed/open にできる', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, true);
  assert.equal(s.spec.switches[0].mode, 'toggle');
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(toggleTarget(s, 1, 0, 3, 0).ok, true); // 複数壁
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'open').ok, true);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }, { x: 3, y: 0, initial: 'open' }]);
  const n = s.history.length;
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'closed').ok, true); // closed は既定なので initial を持たない
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.switches[0].targets[1], { x: 3, y: 0 });
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'bogus').ok, false);
  assert.equal(setTargetInitial(s, 1, 0, 4, 0, 'open').ok, false); // つながっていない壁
  assert.equal(setTargetInitial(s, 3, 0, 3, 0, 'open').ok, false); // スイッチが無い
  setTargetInitial(s, 1, 0, 3, 0, 'open');
  assert.equal(move(s, 3, 0, 3, 0).ok, false);
  assert.equal(setSwitchMode(s, 1, 0, 'open').ok, true); // 単独なら open に戻せる。initial は toggle だけなので消える
  assert.equal(s.spec.switches[0].mode, undefined);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }, { x: 3, y: 0 }]);
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'open').ok, false); // toggle でないと initial は付けられない
  undo(s);
  assert.equal(s.spec.switches[0].mode, 'toggle');
});

test('editor-state(toggle): 他の mode と併用できる（#530）。toggle は対象を共有できない。validate も mode 併用では落とさない', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  place(s, 'switches', 3, 0);
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, true); // 相手が open でも toggle にできる
  assert.equal(s.spec.switches[0].mode, 'toggle');
  const t = row();
  place(t, 'switches', 1, 0);
  setSwitchMode(t, 1, 0, 'toggle');
  place(t, 'switches', 3, 0); // 2つ目は先のスイッチと同じ mode（toggle）で置く
  assert.equal(t.spec.switches[1].mode, 'toggle');
  assert.equal(setSwitchMode(t, 3, 0, 'close').ok, true); // toggle と close
  assert.equal(setSwitchMode(t, 3, 0, 'open').ok, true);
  assert.equal(toggleTarget(t, 1, 0, 2, 0).ok, true);
  assert.equal(toggleTarget(t, 3, 0, 2, 0).ok, false); // toggle は対象を共有できない（相手が open でも）
  const mixed = snap(t.spec);
  assert.ok(!line(mixed).messages.some((m) => m.includes('併用できない')));
  const g = row();
  place(g, 'switches', 1, 0);
  setSwitchGroup(g, 1, 0, 'a');
  assert.equal(setSwitchMode(g, 1, 0, 'toggle').ok, true); // group と toggle
  const h = row();
  place(h, 'switches', 1, 0);
  setSwitchMode(h, 1, 0, 'toggle');
  assert.equal(setSwitchGroup(h, 1, 0, 'a').ok, true);
});

test('editor-state(toggle): 氷・クッションの上には置けない・動かせない・変えられない。validate も落ちる', () => {
  const base = () => createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [], ice: [{ x: 1, y: 0 }], cushion: [{ x: 3, y: 0 }] });
  const s = base();
  assert.equal(place(s, 'switches', 1, 0).ok, true); // open なら氷の上に置ける
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, false); // 氷の上は toggle に変えられない
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').reason.includes('氷'), true);
  const t = base();
  place(t, 'switches', 2, 0);
  assert.equal(setSwitchMode(t, 2, 0, 'toggle').ok, true);
  assert.equal(place(t, 'switches', 1, 0).ok, false); // 2つ目も toggle。氷の上は不可
  assert.equal(place(t, 'switches', 3, 0).ok, false); // クッションの上は不可
  const before = snap(t.spec);
  assert.equal(move(t, 2, 0, 1, 0).ok, false); // toggle を氷の上へ
  assert.equal(move(t, 2, 0, 3, 0).ok, false); // クッションの上へ
  assert.deepEqual(t.spec, before);
  assert.equal(move(t, 2, 0, 2, 0).ok, false); // 動かさない（同じマス）は重なりで拒否のまま
  const bad = snap(t.spec);
  bad.switches[0].x = 1;
  bad.switches[0].targets = [{ x: 2, y: 0 }];
  const r = line(bad);
  assert.equal(r.clearable, false);
  assert.ok(r.messages.some((m) => m.includes('氷の上')));
});

test('editor-state: setMaxPauses は設定・undo/redo でき、0 でキーを消し、負数・小数・非数は拒否する', () => {
  const s = fresh();
  assert.equal(s.spec.maxPauses, undefined);
  assert.equal(setMaxPauses(s, 2).ok, true);
  assert.equal(s.spec.maxPauses, 2);
  assert.equal(setMaxPauses(s, 100).ok, true); // 上限なし
  assert.equal(s.spec.maxPauses, 100);
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.maxPauses, 2);
  assert.equal(redo(s).ok, true);
  assert.equal(s.spec.maxPauses, 100);
  assert.equal(setMaxPauses(s, 0).ok, true);
  assert.equal('maxPauses' in s.spec, false);
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.maxPauses, 100);
  const before = snap(s.spec);
  const cursor = s.cursor;
  for (const bad of [-1, 1.5, NaN, Infinity, '2', null, undefined]) {
    assert.equal(setMaxPauses(s, bad).ok, false, String(bad));
  }
  assert.deepEqual(s.spec, before);
  assert.equal(s.cursor, cursor);
  const z = fresh();
  assert.equal(setMaxPauses(z, 0).ok, true); // 既に 0 なら履歴を積まない
  assert.equal(z.cursor, 0);
});

// ---- かぎ・ドア（#523 段1）。盤は床だけの 5×1（start 左端・goal 右端）。----
test('editor-state(keys): かぎ・ドアを置く（既定 red）→ 判定を通る。重なりは拒否', () => {
  const s = row();
  assert.equal(place(s, 'keys', 1, 0).ok, true);
  assert.deepEqual(s.spec.keys, [{ x: 1, y: 0, color: 'red' }]);
  assert.deepEqual(pendingKeys(s.spec), [{ kind: 'keys', index: 0, x: 1, y: 0 }]); // ドアが無いかぎ
  assert.equal(place(s, 'doors', 2, 0).ok, true);
  assert.deepEqual(s.spec.doors, [{ x: 2, y: 0, color: 'red' }]);
  assert.deepEqual(pendingKeys(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(line(s.spec).clearable, true);
  assert.equal(place(s, 'keys', 1, 0).ok, true); // かぎの上にかぎ＝何もしない
  assert.deepEqual(s.spec.keys, [{ x: 1, y: 0, color: 'red' }]);
  assert.equal(place(s, 'keys', 2, 0).ok, true); // ドアの上にかぎ＝ドアを消して置く
  assert.equal(s.spec.doors, undefined);
  assert.deepEqual(s.spec.keys.map((k) => k.x), [1, 2]);
  assert.equal(place(s, 'keys', 0, 0).ok, false); // start の上
  assert.equal(place(s, 'doors', 9, 0).ok, false); // 盤外
});

test('editor-state(keys): ドアだけ・色ちがいは接続待ち。validate の「対応する色のかぎが無い」と一致', () => {
  const s = row();
  place(s, 'doors', 2, 0);
  assert.deepEqual(pendingKeys(s.spec), [{ kind: 'doors', index: 0, x: 2, y: 0 }]);
  assert.ok(line(s.spec).messages.some((m) => m.includes('対応する色のかぎが無い')));
  place(s, 'keys', 1, 0);
  assert.equal(setKeyColor(s, 1, 0, 'blue').ok, true);
  assert.equal(s.spec.keys[0].color, 'blue');
  assert.equal(pendingKeys(s.spec).length, 2); // かぎ（blue）にドアが無く、ドア（red）にかぎが無い
  assert.ok(line(s.spec).messages.some((m) => m.includes('対応する色のかぎが無い')));
  assert.equal(setDoorColor(s, 2, 0, 'blue').ok, true);
  assert.deepEqual(pendingKeys(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
});

test('editor-state(keys): 色変更の拒否（不正な色・無い物）と同じ色は履歴を積まない', () => {
  const s = row();
  place(s, 'keys', 1, 0);
  const n = s.history.length;
  assert.equal(setKeyColor(s, 1, 0, 'green').ok, false);
  assert.equal(setKeyColor(s, 3, 0, 'blue').ok, false);
  assert.equal(setDoorColor(s, 1, 0, 'blue').ok, false); // かぎの座標はドアではない
  assert.equal(setKeyColor(s, 1, 0, 'red').ok, true);
  assert.equal(s.history.length, n);
});

test('editor-state(keys): 消去・移動。かぎ・ドアが無くなると keyMode も消える', () => {
  const s = row();
  place(s, 'keys', 1, 0);
  place(s, 'doors', 2, 0);
  setKeyMode(s, 'remote');
  assert.equal(move(s, 2, 0, 3, 0).ok, true);
  assert.deepEqual(s.spec.doors, [{ x: 3, y: 0, color: 'red' }]);
  assert.equal(move(s, 1, 0, 3, 0).ok, false); // 移動先に要素がある
  assert.equal(move(s, 1, 0, 0, 0).ok, false); // start の上
  assert.equal(erase(s, 3, 0).ok, true);
  assert.equal('doors' in s.spec, false);
  assert.equal(s.spec.keyMode, 'remote'); // かぎが残っている間は keyMode も残る
  assert.equal(erase(s, 1, 0).ok, true);
  assert.equal('keys' in s.spec, false);
  assert.equal('keyMode' in s.spec, false);
  assert.equal(erase(s, 1, 0).ok, false);
});

test('editor-state(keys): keyMode は carry が既定（キーを持たない）。remote のとき持つ。かぎ・ドアの無い盤では拒否', () => {
  const s = row();
  assert.equal(setKeyMode(s, 'remote').ok, false);
  assert.equal(setKeyMode(s, 'bogus').ok, false);
  place(s, 'keys', 1, 0);
  place(s, 'doors', 2, 0);
  const n = s.history.length;
  assert.equal(setKeyMode(s, 'carry').ok, true); // 既に carry（省略）
  assert.equal(s.history.length, n);
  assert.equal(setKeyMode(s, 'remote').ok, true);
  assert.equal(s.spec.keyMode, 'remote');
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(setKeyMode(s, 'carry').ok, true);
  assert.equal('keyMode' in s.spec, false);
});

test('editor-state(keys): 置く・色・keyMode・移動・消去は元に戻す／やり直しで整合する', () => {
  const s = row();
  const states = [snap(s.spec)];
  const step = (r) => { assert.equal(r.ok, true); states.push(snap(s.spec)); };
  step(place(s, 'keys', 1, 0));
  step(place(s, 'doors', 2, 0));
  step(setKeyColor(s, 1, 0, 'blue'));
  step(setDoorColor(s, 2, 0, 'blue'));
  step(setKeyMode(s, 'remote'));
  step(move(s, 2, 0, 3, 0));
  step(erase(s, 3, 0));
  for (let i = states.length - 2; i >= 0; i--) { assert.equal(undo(s).ok, true); assert.deepEqual(s.spec, states[i]); }
  for (let i = 1; i < states.length; i++) { assert.equal(redo(s).ok, true); assert.deepEqual(s.spec, states[i]); }
});

test('editor-state(keys): 読み込んだ盤のかぎ・ドアも消せる・動かせる（SAMPLE_SPEC）', () => {
  const s = fresh();
  assert.equal(move(s, 0, 2, 0, 1).ok, true); // かぎ
  assert.deepEqual(s.spec.keys, [{ x: 0, y: 1, color: 'red' }]);
  assert.equal(erase(s, 2, 2).ok, true); // ドア
  assert.equal('doors' in s.spec, false);
  assert.equal(s.spec.keyMode, 'remote'); // かぎが残る
});

// ---- 水の橋・waterMode（#523 段3）----
const wrow = () => createState({ grid: { cols: 6, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [] });

test('editor-state(bridge): 置く・消す・動かす。水が無くても置ける（接続待ち）', () => {
  const s = wrow();
  assert.equal(place(s, 'bridge', 2, 1).ok, true);
  assert.deepEqual(s.spec.bridge, [{ x: 2, y: 1 }]);
  assert.deepEqual(pendingBridges(s.spec), [{ index: 0, x: 2, y: 1 }]);
  assert.equal(place(s, 'bridge', 2, 1).ok, true); // 同種は何もしない
  assert.deepEqual(s.spec.bridge, [{ x: 2, y: 1 }]);
  assert.equal(place(s, 'bridge', 0, 0).ok, false); // start の上
  assert.equal(place(s, 'bridge', 9, 9).ok, false); // 盤外
  assert.equal(place(s, 'water', 3, 1).ok, true);
  assert.deepEqual(pendingBridges(s.spec), []);
  assert.equal(move(s, 2, 1, 2, 2).ok, true);
  assert.deepEqual(s.spec.bridge, [{ x: 2, y: 2 }]);
  assert.equal(move(s, 2, 2, 3, 1).ok, false); // 移動先が水
  assert.equal(erase(s, 2, 2).ok, true);
  assert.equal('bridge' in s.spec, false);
});

test('editor-state(bridge): 水を消したとき、隣に水が残る橋は残り、残らない橋は消える', () => {
  const s = wrow();
  place(s, 'water', 2, 1);
  place(s, 'water', 4, 1);
  place(s, 'bridge', 3, 1); // 両隣が水
  place(s, 'bridge', 1, 1); // 左の水だけが隣
  place(s, 'bridge', 0, 2); // 元から水の隣でない（接続待ち）
  assert.equal(erase(s, 2, 1).ok, true);
  assert.deepEqual(s.spec.bridge, [{ x: 3, y: 1 }, { x: 0, y: 2 }]); // (3,1) は (4,1) が残る。(1,1) は消える。接続待ちの橋は触らない
  assert.deepEqual(s.spec.water, [{ x: 4, y: 1 }]);
  assert.equal(erase(s, 4, 1).ok, true);
  assert.deepEqual(s.spec.bridge, [{ x: 0, y: 2 }]); // (3,1) も隣の水が無くなって消える
  assert.equal('water' in s.spec, false);
});

test('editor-state(bridge): 水が全部無くなると waterMode も消える。水が残る間は waterMode も残る', () => {
  const s = wrow();
  place(s, 'water', 2, 1);
  place(s, 'water', 3, 1);
  assert.equal(setWaterMode(s, 'bump').ok, true);
  erase(s, 2, 1);
  assert.equal(s.spec.waterMode, 'bump');
  erase(s, 3, 1);
  assert.equal('waterMode' in s.spec, false);
});

test('editor-state(waterMode): cushion が既定（キーを持たない）。bump のとき持つ。水の無い盤・不正値は拒否', () => {
  const s = wrow();
  assert.equal(setWaterMode(s, 'bump').ok, false);
  place(s, 'water', 2, 1);
  assert.equal(setWaterMode(s, 'bogus').ok, false);
  assert.equal(setWaterMode(s, 'cushion').ok, true); // 既に cushion（省略）
  assert.equal(s.history.length, s.cursor + 1);
  assert.equal(setWaterMode(s, 'bump').ok, true);
  assert.equal(s.spec.waterMode, 'bump');
  assert.equal(setWaterMode(s, 'cushion').ok, true);
  assert.equal('waterMode' in s.spec, false);
});

test('editor-state(bridge): 置く・消す・waterMode は元に戻す／やり直しで整合する', () => {
  const s = wrow();
  const states = [snap(s.spec)];
  const step = (r) => { assert.equal(r.ok, true); states.push(snap(s.spec)); };
  step(place(s, 'water', 2, 1));
  step(place(s, 'bridge', 1, 1));
  step(setWaterMode(s, 'bump'));
  step(move(s, 1, 1, 1, 2));
  step(erase(s, 2, 1));
  for (let i = states.length - 2; i >= 0; i--) { assert.equal(undo(s).ok, true); assert.deepEqual(s.spec, states[i]); }
  for (let i = 1; i < states.length; i++) { assert.equal(redo(s).ok, true); assert.deepEqual(s.spec, states[i]); }
});

test('editor-state(paint): 目標のトグル。start・goal と重なってよく、他の要素とは重ならない', () => {
  const s = createState({ grid: { cols: 4, rows: 4 }, start: { x: 0, y: 0 }, goal: { x: 3, y: 3 }, walls: [{ x: 1, y: 1 }] });
  assert.equal(togglePaint(s, 9, 9).ok, false); // 盤外
  assert.equal(togglePaint(s, 1, 1).ok, false); // 壁
  assert.equal(togglePaint(s, 0, 0).ok, true); // start と重なる
  assert.equal(togglePaint(s, 3, 3).ok, true); // goal と重なる
  assert.equal(place(s, 'paint', 1, 0).ok, true); // place 経由も同じ
  assert.deepEqual(s.spec.paint, [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 1, y: 0 }]);
  assert.deepEqual(s.spec.start, { x: 0, y: 0 });
  assert.equal(togglePaint(s, 1, 0).ok, true); // もう一度で外す
  assert.equal(s.spec.paint.length, 2);
  assert.equal(place(s, 'wall', 3, 3).ok, false); // 目標のあるマスに壁は置けない
  assert.equal(place(s, 'items', 3, 3).ok, false);
  assert.equal(togglePaint(s, 0, 0).ok, true);
  assert.equal(togglePaint(s, 3, 3).ok, true);
  assert.equal('paint' in s.spec, false); // 空になったらキーごと消す
});

test('editor-state(paint): 消す・動かす（start・goal と重なるマスを含む）', () => {
  const s = createState({ grid: { cols: 4, rows: 4 }, start: { x: 0, y: 0 }, goal: { x: 3, y: 3 }, walls: [], paint: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 3 }] });
  assert.equal(erase(s, 0, 0).ok, false); // start と重なるマスは消しゴムで消せない（ぬりマスで外す）
  assert.equal(erase(s, 1, 0).ok, true);
  assert.equal(s.spec.paint.length, 2);
  assert.equal(place(s, 'paint', 1, 0).ok, true);
  assert.equal(move(s, 1, 0, 2, 0).ok, true); // 目標だけのマスは目標を動かす
  assert.deepEqual(s.spec.paint.at(-1), { x: 2, y: 0 });
  assert.equal(move(s, 2, 0, 3, 3).ok, false); // 目標のあるマスへは動かせない
  assert.equal(move(s, 2, 0, 3, 2).ok, true);
  assert.equal(move(s, 3, 2, 3, 3).ok, false);
  assert.equal(move(s, 0, 0, 0, 1).ok, true); // start と重なるマスでは start が動く（目標は残る）
  assert.deepEqual(s.spec.start, { x: 0, y: 1 });
  assert.ok(s.spec.paint.some((c) => c.x === 0 && c.y === 0));
  assert.equal(move(s, 0, 1, 3, 3).ok, false); // goal は重ねてよいが、goal 自身がいるマスは不可
  assert.equal(move(s, 0, 1, 0, 0).ok, true); // start を目標のマスへ（重なってよい）
  assert.deepEqual(s.spec.start, { x: 0, y: 0 });
});
