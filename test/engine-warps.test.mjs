// #64 段1: ワープのエンジン（入口→出口で止まる・再ワープしない・まとめ命令・BFS統合・warps無しは不変）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps, shortestPath } from '../js/engine-grid.js';

// x=2の列は全部壁。穴 A(1,1) と B(3,2) が pair 1。
const wallCol = [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
const holes = [{ x: 1, y: 1, pair: 1 }, { x: 3, y: 2, pair: 1 }];
const base = { grid: { cols: 5, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 2 }, walls: wallCol, warps: holes };
const last = (r) => r.path[r.path.length - 1];

test('warps: 入口に入ると出口へ移って止まり、warpedが出口のマスだけtrue', () => {
  const r = simulate(['right'], base);
  assert.deepEqual(r.path, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 2 }], '入口を経て出口へ');
  assert.deepEqual(r.warped, [false, true]);
  assert.equal(r.blockedAt.length, 0);
  assert.deepEqual(last(simulate(['right', 'right'], base)), { x: 4, y: 2 }, '次の手で出口から続けて進める');
});

test('warps: 同じ手の中で出口から再ワープしない・後の手で出口に入り直すと逆向きにワープ', () => {
  const r = simulate(['right', 'up', 'down'], base);
  assert.deepEqual(r.path, [
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 1 },
  ]);
  assert.deepEqual(r.warped, [false, true, false, false, true]);
  assert.equal(r.stepOwner.join(), '0,0,1,2,2');
});

test('warps: まとめ命令は1手ずつ展開し、途中のワープの出口から残りを進む', () => {
  const r = simulate([{ dir: 'right', times: 2 }], base);
  assert.deepEqual(last(r), { x: 4, y: 2 });
  assert.equal(r.reachedGoal, true);
  assert.deepEqual(r.warped, [false, true, false]);
});

test('warps: 最短手数・最短経路にワープ移動が入る（ワープ自体は手数に数えない）', () => {
  assert.equal(shortestSteps(base), 2);
  assert.deepEqual(shortestPath(base), ['right', 'right']);
  assert.equal(shortestSteps({ ...base, warps: [] }), Infinity, '穴が無ければ壁で到達不能');
  assert.equal(shortestSteps({ ...base, warps: undefined }), Infinity);
});

test('warps: warpsが無い盤の挙動は変わらない（warpedは全部false）', () => {
  const plain = { grid: { cols: 5, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
  const r = simulate(['right', 'right', 'right', 'right'], plain);
  assert.equal(r.reachedGoal, true);
  assert.deepEqual(r.warped, [false, false, false, false]);
  assert.equal(shortestSteps(plain), 4);
});
