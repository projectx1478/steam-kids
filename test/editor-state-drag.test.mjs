// #662: ドラッグ連続配置（editor-state.test.mjs から分割）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, erase, undo, redo, HISTORY_MAX } from '../tools/editor/editor-state.js';
import { isDragKey, lineCells, dragBegin, dragStep, dragEnd, dragCancel } from '../tools/editor/editor-state.js';

const snap = (v) => JSON.parse(JSON.stringify(v));

// ---- #647 段4: ドラッグ連続配置 ----

const emptyState = () => createState({ grid: { cols: 6, rows: 6 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 5 }, walls: [] });
const dragLine = (s, key, cells) => { const d = dragBegin(s, key); for (const c of cells) dragStep(s, d, c.x, c.y); return d; };

test('lineCells: 斜め・飛びを Bresenham で埋める（両端含む）', () => {
  assert.deepEqual(lineCells(0, 0, 3, 0), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  assert.deepEqual(lineCells(2, 2, 2, 2), [{ x: 2, y: 2 }]);
  assert.deepEqual(lineCells(3, 1, 0, 1).map((c) => c.x), [3, 2, 1, 0]);
  const diag = lineCells(0, 0, 3, 3);
  assert.equal(diag.length, 4);
  assert.deepEqual(diag[3], { x: 3, y: 3 });
});

test('isDragKey: 単純タイルと消しゴムだけ', () => {
  for (const k of ['wall', 'walls', 'items', 'ice', 'cushion', 'water', 'bridge', 'eraser']) assert.equal(isDragKey(k), true, k);
  for (const k of ['start', 'goal', 'switches', 'keys', 'doors', 'periodic', 'paint', 'warps1', 'groupWalls']) assert.equal(isDragKey(k), false, k);
});

test('ドラッグで置く: 3マスを1手に畳み、1回の undo で戻る', () => {
  const s = emptyState();
  const before = snap(s.spec);
  const d = dragLine(s, 'wall', lineCells(1, 2, 3, 2));
  assert.equal(dragEnd(s, d), 3);
  assert.equal(s.spec.walls.length, 3);
  assert.equal(s.history.length, 2);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec, before);
  assert.equal(redo(s).ok, true);
  assert.equal(s.spec.walls.length, 3);
});

test('ドラッグ: 既存の履歴を残し、盤外は置かず戻ったマスから続く', () => {
  const s = emptyState();
  place(s, 'wall', 4, 4);
  const d = dragBegin(s, 'ice');
  for (const [x, y] of [[0, 1], [-1, 1], [7, 1], [1, 1], [2, 1]]) dragStep(s, d, x, y);
  assert.equal(dragEnd(s, d), 3);
  assert.deepEqual(s.spec.ice.map((c) => c.x), [0, 1, 2]);
  assert.equal(s.history.length, 3);
  undo(s);
  assert.equal(s.spec.ice, undefined);
  assert.equal(s.spec.walls.length, 1);
});

test('ドラッグ: 消しゴムで連続して消せる・1手で戻る', () => {
  const s = emptyState();
  for (const x of [1, 2, 3]) place(s, 'wall', x, 2);
  const n = s.history.length;
  const d = dragLine(s, 'eraser', lineCells(1, 2, 3, 2));
  assert.equal(dragEnd(s, d), 3);
  assert.equal((s.spec.walls || []).length, 0);
  assert.equal(s.history.length, n + 1);
  undo(s);
  assert.equal(s.spec.walls.length, 3);
});

test('ドラッグ: 同種の上は数えず、スタートの上は置けない', () => {
  const s = emptyState();
  place(s, 'wall', 1, 1);
  const n = s.history.length;
  const d = dragLine(s, 'wall', [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  assert.equal(dragEnd(s, d), 1);
  assert.equal(s.spec.walls.length, 2);
  assert.equal(s.history.length, n + 1);
});

test('ドラッグ: 何も置けなければ履歴は増えない', () => {
  const s = emptyState();
  const d = dragLine(s, 'wall', [{ x: 9, y: 9 }]);
  assert.equal(dragEnd(s, d), 0);
  assert.equal(s.history.length, 1);
});

test('ドラッグ: cancel は開始時の状態に戻し履歴に積まない', () => {
  const s = emptyState();
  place(s, 'wall', 4, 4);
  const before = snap(s);
  const d = dragLine(s, 'wall', lineCells(0, 2, 3, 2));
  assert.equal(s.spec.walls.length, 5);
  dragCancel(s, d);
  assert.deepEqual(s, before);
});

test('ドラッグ: 100手を超えても畳みで履歴の上限を守る', () => {
  const s = emptyState();
  for (let i = 0; i < HISTORY_MAX + 5; i += 1) { place(s, 'wall', i % 2 ? 2 : 3, 2); erase(s, i % 2 ? 2 : 3, 2); }
  const d = dragLine(s, 'water', lineCells(0, 1, 5, 1));
  dragEnd(s, d);
  assert.ok(s.history.length <= HISTORY_MAX);
  assert.equal(s.cursor, s.history.length - 1);
  assert.equal(s.spec.water.length, 6);
});
