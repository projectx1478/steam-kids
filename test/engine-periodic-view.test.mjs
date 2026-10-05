// simulateが描画・失敗文言用に返す moveOf・periodicBump（Issue #310 段3）。diagnoseの'periodic'判定はこの値を使う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/engine-grid.js';

const base = { grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] };
const door = { periodic: [{ x: 1, y: 0, period: 2, open: [1] }] };

test('periodicBump: 閉じた周期ドアへの衝突だけtrue・moveOfは手ごとに進む', () => {
  const r = simulate(['right', 'right'], { ...base, ...door });
  // 1手目は手番0で閉（衝突も1手＝手番1へ）、2手目は手番1で開いて通れる。
  assert.deepEqual(r.bumped, [true, false]);
  assert.deepEqual(r.periodicBump, [true, false]);
  assert.deepEqual(r.moveOf, [0, 1]);
});

test('periodicBump: 開いている手番では通れてfalse、壁・盤外の衝突はfalse', () => {
  const ok = simulate(['left', 'right', 'right'], { ...base, start: { x: 1, y: 0 }, goal: { x: 4, y: 0 }, periodic: [{ x: 2, y: 0, period: 2, open: [0] }] });
  assert.deepEqual(ok.bumped, [false, false, false]);
  assert.deepEqual(ok.periodicBump, [false, false, false]);
  assert.deepEqual(ok.moveOf, [0, 1, 2]);
  const wall = simulate(['left'], { ...base, ...door });
  assert.deepEqual([wall.bumped, wall.periodicBump], [[true], [false]]);
});

test('moveOf: 氷の滑走は複数マスでも同じ手', () => {
  const r = simulate(['right', 'right'], { ...base, ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }], periodic: [{ x: 4, y: 0, period: 2, open: [0] }] });
  assert.equal(r.moveOf.length, r.path.length - 1);
  assert.ok(r.moveOf.every((m, i) => i === 0 || m >= r.moveOf[i - 1]));
});
