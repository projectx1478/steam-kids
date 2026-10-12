// #397 段4: 盤面エディタの状態管理（置く・消す・動かす・元に戻す・やり直し、拒否値）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, setCellPx, setGrid, place, erase, move, undo, redo, HISTORY_MAX } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC, EDITOR_MAX_SIZE } from '../tools/editor/editor-view.js';

const fresh = () => createState(SAMPLE_SPEC);
const snap = (v) => JSON.parse(JSON.stringify(v));

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

test('editor-state: 重なりの拒否（状態は変わらない）', () => {
  const s = fresh();
  const before = snap(s);
  assert.equal(place(s, 'wall', 1, 0).ok, false); // 壁の上に壁
  assert.equal(place(s, 'items', 1, 0).ok, false); // 壁の上にアイテム
  assert.equal(place(s, 'start', 4, 4).ok, false); // ゴールの上
  assert.equal(place(s, 'wall', 9, 9).ok, false); // 盤外
  assert.deepEqual(s, before);
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

test('editor-state: 組・設定が要る要素は置けない・消せない・動かせない', () => {
  const s = fresh();
  for (const key of ['keys', 'switches', 'paint', 'periodic']) assert.equal(place(s, key, 2, 1).ok, false, key);
  assert.equal(erase(s, 0, 2).ok, false); // かぎ
  assert.equal(move(s, 2, 2, 2, 1).ok, false); // ドア
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
  assert.deepEqual(s.spec.grid, { cols: 6, rows: 6 });
});
