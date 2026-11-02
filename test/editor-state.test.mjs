// #397 段4: 盤面エディタの状態管理（置く・消す・動かす・元に戻す・やり直し、拒否値）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occupants, createState, setCellPx, setGrid, shrinkLoss, place, erase, move, undo, redo, COMPLEX_KEYS, HISTORY_MAX } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC, EDITOR_MAX_SIZE } from '../tools/editor/editor-view.js';

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