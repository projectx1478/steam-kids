// #662: 上書き（editor-state.test.mjs から分割）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, erase, undo, togglePaint, canUndo as canUndoState } from '../tools/editor/editor-state.js';

const snap = (v) => JSON.parse(JSON.stringify(v));

// ---- 上書き（#647）：既存要素の上へ別のタイルを置くと、erase 相当で消してから置く。1手。 ----
const ow = (extra = {}) => createState({ grid: { cols: 6, rows: 4 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 3 }, ...extra });
const hasAt = (arr, x, y) => (arr || []).some((c) => c.x === x && c.y === y);

test('editor-state(上書き): 壁・SIMPLE_LISTS の上へ別タイル。1手で元に戻る', () => {
  const s = ow({ walls: [{ x: 2, y: 1 }], items: [{ x: 3, y: 1 }], ice: [{ x: 4, y: 1 }] });
  const original = snap(s.spec);
  assert.equal(place(s, 'items', 2, 1).ok, true);
  assert.equal(hasAt(s.spec.walls, 2, 1), false);
  assert.equal(hasAt(s.spec.items, 2, 1), true);
  assert.equal(s.history.length, 2);
  assert.equal(place(s, 'wall', 3, 1).ok, true); // items → wall
  assert.equal(s.spec.items.some((c) => c.x === 3), false);
  assert.equal(place(s, 'cushion', 4, 1).ok, true); // ice → cushion
  assert.equal(s.spec.ice, undefined);
  assert.equal(undo(s).ok, true);
  assert.equal(undo(s).ok, true);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec, original);
});

test('editor-state(上書き): 水を消すと隣の橋も消える・水0件で waterMode も消える・同じ1手', () => {
  const s = ow({ water: [{ x: 2, y: 1 }], bridge: [{ x: 3, y: 1 }], waterMode: 'bump' });
  const original = snap(s.spec);
  assert.equal(place(s, 'wall', 2, 1).ok, true);
  assert.equal(s.spec.water, undefined);
  assert.equal(s.spec.waterMode, undefined);
  assert.equal(s.spec.bridge, undefined); // 水の無くなった橋
  assert.ok(hasAt(s.spec.walls, 2, 1));
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec, original);
  // 水が残るなら橋は残る
  const t = ow({ water: [{ x: 2, y: 1 }, { x: 4, y: 1 }], bridge: [{ x: 3, y: 1 }], waterMode: 'bump' });
  assert.equal(place(t, 'wall', 2, 1).ok, true);
  assert.deepEqual(t.spec.bridge, [{ x: 3, y: 1 }]);
  assert.equal(t.spec.waterMode, 'bump');
});

test('editor-state(上書き): bridge・周期ドア・切替壁の上へ別タイル', () => {
  const s = ow({ bridge: [{ x: 1, y: 1 }], periodic: [{ x: 2, y: 1, period: 3 }], switches: [{ x: 1, y: 3, color: 'blue', group: 'a' }], groupWalls: [{ x: 3, y: 1, group: 'a' }] });
  assert.equal(place(s, 'items', 1, 1).ok, true);
  assert.equal(s.spec.bridge, undefined);
  assert.equal(place(s, 'items', 2, 1).ok, true);
  assert.equal(s.spec.periodic, undefined);
  assert.equal(place(s, 'items', 3, 1).ok, true);
  assert.equal(s.spec.groupWalls, undefined);
  assert.equal(s.spec.items.length, 3);
});

test('editor-state(上書き): ワープはそのマスの分だけ消す（相手は残る）。別の組なら置き換わる', () => {
  const s = ow({ warps: [{ x: 1, y: 1, pair: 1 }, { x: 3, y: 1, pair: 1 }] });
  assert.equal(place(s, 'wall', 1, 1).ok, true);
  assert.deepEqual(s.spec.warps, [{ x: 3, y: 1, pair: 1 }]);
  assert.equal(place(s, 'warps2', 3, 1).ok, true);
  assert.deepEqual(s.spec.warps, [{ x: 3, y: 1, pair: 2 }]);
  assert.equal(place(s, 'wall', 3, 1).ok, true);
  assert.equal(s.spec.warps, undefined);
});

test('editor-state(上書き): スイッチ本体を上書きすると group の壁が床に戻る。対象マスは targets だけ外れる', () => {
  const s = ow({ switches: [{ x: 1, y: 3, color: 'blue', group: 'a' }], groupWalls: [{ x: 3, y: 1, group: 'a' }] });
  assert.equal(place(s, 'items', 1, 3).ok, true);
  assert.equal(s.spec.switches, undefined);
  assert.equal(s.spec.groupWalls, undefined); // 床に戻る
  assert.ok(hasAt(s.spec.items, 1, 3));
  // targets のみ（壁なし）
  const t = ow({ switches: [{ x: 1, y: 3, color: 'red', targets: [{ x: 2, y: 2 }] }] });
  assert.equal(place(t, 'items', 2, 2).ok, true);
  assert.deepEqual(t.spec.switches[0].targets, []);
  assert.ok(hasAt(t.spec.items, 2, 2));
  // targets＋壁の同居：壁だけ消えて置く。targets は残る
  const u = ow({ walls: [{ x: 2, y: 2 }], switches: [{ x: 1, y: 3, color: 'red', targets: [{ x: 2, y: 2 }] }] });
  assert.equal(place(u, 'items', 2, 2).ok, true);
  assert.equal(hasAt(u.spec.walls, 2, 2), false);
  assert.deepEqual(u.spec.switches[0].targets, [{ x: 2, y: 2 }]);
  assert.ok(hasAt(u.spec.items, 2, 2));
});

test('editor-state(上書き): 鍵・ドアはそのマスの分だけ。0件で keyMode が消える。鍵↔ドアの置き換えでは keyMode を残す', () => {
  const s = ow({ keys: [{ x: 1, y: 1, color: 'red' }], doors: [{ x: 2, y: 1, color: 'red' }], keyMode: 'remote' });
  assert.equal(place(s, 'wall', 1, 1).ok, true);
  assert.equal(s.spec.keys, undefined);
  assert.deepEqual(s.spec.doors, [{ x: 2, y: 1, color: 'red' }]); // 相手は残る
  assert.equal(s.spec.keyMode, 'remote');
  assert.equal(place(s, 'wall', 2, 1).ok, true);
  assert.equal(s.spec.doors, undefined);
  assert.equal(s.spec.keyMode, undefined);
  const t = ow({ keys: [{ x: 1, y: 1, color: 'red' }], keyMode: 'remote' });
  assert.equal(place(t, 'doors', 1, 1).ok, true); // 鍵→ドア
  assert.equal(t.spec.keys, undefined);
  assert.deepEqual(t.spec.doors, [{ x: 1, y: 1, color: 'red' }]);
  assert.equal(t.spec.keyMode, 'remote');
});

test('editor-state(上書き): paint は残して置く。壁＋paint は paint 以外を消して置き paint を残す', () => {
  const s = ow({ paint: [{ x: 2, y: 1 }] });
  assert.equal(place(s, 'wall', 2, 1).ok, true); // paint のみ → paint を残して壁を置く（壁＋paint ができる）
  assert.ok(hasAt(s.spec.walls, 2, 1));
  assert.ok(hasAt(s.spec.paint, 2, 1));
  assert.equal(place(s, 'items', 2, 1).ok, true); // 壁＋paint → 壁を消して置く、paint は残る
  assert.equal(hasAt(s.spec.walls, 2, 1), false);
  assert.ok(hasAt(s.spec.items, 2, 1));
  assert.ok(hasAt(s.spec.paint, 2, 1));
  assert.equal(place(s, 'items', 2, 1).ok, true); // 同種（paint が重なっていても）は何もしない
  assert.equal(s.history.length, 3);
  // togglePaint が壁に置けない挙動は変わらない
  const t = ow({ walls: [{ x: 2, y: 1 }] });
  assert.equal(togglePaint(t, 2, 1).ok, false);
});

test('editor-state(上書き): start・goal は上書きできない。同種は履歴に積まない。盤外は拒否', () => {
  const s = ow({ walls: [{ x: 2, y: 1 }] });
  const before = snap(s);
  assert.equal(place(s, 'wall', 0, 0).ok, false);
  assert.equal(place(s, 'items', 5, 3).ok, false);
  assert.equal(place(s, 'goal', 2, 1).ok, false); // 置く側は壁の上に置けない
  assert.equal(place(s, 'wall', 6, 0).ok, false);
  assert.equal(place(s, 'wall', 0, -1).ok, false);
  assert.deepEqual(s, before);
  assert.equal(place(s, 'wall', 2, 1).ok, true);
  assert.equal(canUndoState(s), false);
  assert.equal(s.history.length, 1);
  assert.deepEqual(s, before);
});
