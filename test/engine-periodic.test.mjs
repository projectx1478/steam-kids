// periodic（周期ドア）：turnとopenによるblocksの切替・stateKey・tickの不変更新（Issue #310）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodic } from '../js/gimmicks/periodic.js';
import { GIMMICKS } from '../js/gimmicks/index.js';
import { simulate } from '../js/engine-grid.js';

const spec = { periodic: [{ x: 1, y: 0, period: 2, open: [0] }, { x: 2, y: 0, period: 3, open: [1, 2] }] };
const at = (p, s, n) => {
  let st = s;
  for (let i = 0; i < n; i++) st = periodic.tick(st);
  return periodic.blocks(st, p, spec);
};

test('periodic: initState・blocksがturnとopenで切り替わる', () => {
  const s = periodic.initState(spec);
  assert.equal(s.turn, 0);
  assert.deepEqual([at({ x: 1, y: 0 }, s, 0), at({ x: 1, y: 0 }, s, 1), at({ x: 1, y: 0 }, s, 2)], [false, true, false], 'period2 open[0]');
  assert.deepEqual([0, 1, 2, 3].map((n) => at({ x: 2, y: 0 }, s, n)), [true, false, false, true], 'period3 open[1,2]');
  assert.equal(at({ x: 0, y: 0 }, s, 1), false, 'ドア以外は通れる');
  assert.equal(periodic.blocks(periodic.initState({}), { x: 1, y: 0 }, {}), false, 'ドア無し盤は何も塞がない');
});

test('periodic: stateKeyはドア無しで定数・有りでturnの最小公倍数での余り', () => {
  const none = periodic.initState({});
  assert.equal(periodic.stateKey(none), periodic.stateKey(periodic.tick(none)));
  const s = periodic.initState(spec);
  const keys = [];
  let st = s;
  for (let i = 0; i < 7; i++) { keys.push(periodic.stateKey(st)); st = periodic.tick(st); }
  assert.equal(new Set(keys).size, 6, 'lcm(2,3)=6で一巡');
  assert.equal(keys[0], keys[6]);
});

test('periodic: tickは不変更新', () => {
  const s = periodic.initState(spec);
  const t = periodic.tick(s);
  assert.equal(s.turn, 0);
  assert.equal(t.turn, 1);
  assert.notEqual(s, t);
});

test('periodic: GIMMICKSに登録されている', () => {
  assert.ok(GIMMICKS.includes(periodic));
});

const board = (extra) => ({ grid: { cols: 6, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [], periodic: [{ x: 5, y: 1, period: 8, open: [0] }], ...extra });
// periodicの既定ドア（盤の隅・period8）はturnを進める基準用（ドア無しだとcycle=1でturnが0固定になる）。

test('simulate: 氷の滑走全体で1手、次の手のturnAtは1', () => {
  const r = simulate(['right', 'right'], board({ ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }));
  assert.deepEqual(r.turnAt, [0, 1]);
  assert.deepEqual(r.path.slice(1, 4), [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], '1手目で3マス滑走');
});

test('simulate: repeatBox展開後に各方向1手', () => {
  const r = simulate([{ box: ['right', 'down'], times: 2 }, 'left'], board());
  assert.deepEqual(r.turnAt, [0, 1, 2, 3, 4]);
});

test('simulate: 壁衝突の手も1手（動けなくてもturnは進む）', () => {
  const r = simulate(['left', 'right'], board());
  assert.deepEqual(r.turnAt, [0, 1]);
  assert.deepEqual(r.blockedAt, [0]);
});

test('simulate: クッションで止まる手も1手', () => {
  const r = simulate(['right', 'down'], board({ cushion: [{ x: 1, y: 0 }] }));
  assert.deepEqual(r.turnAt, [0, 1]);
  assert.deepEqual(r.blockedAt, []);
  assert.deepEqual(r.path[r.path.length - 1], { x: 0, y: 1 });
});

test('simulate: 閉じている周期ドアへ入る手は失敗(blockedAt)、開く手番では入れる', () => {
  const r = simulate(['right', 'right'], board({ periodic: [{ x: 1, y: 0, period: 2, open: [1] }] }));
  assert.deepEqual(r.blockedAt, [0]);
  assert.deepEqual(r.turnAt, [0, 1]);
  assert.deepEqual(r.path[r.path.length - 1], { x: 1, y: 0 });
});

test('simulate: 氷の滑走中は手の開始時のturnで判定（途中でturnは進まない）', () => {
  const r = simulate(['right'], board({ ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }], periodic: [{ x: 3, y: 0, period: 2, open: [0] }] }));
  assert.deepEqual(r.blockedAt, [], 'turn0のままなので3マス目のドアは開いている');
  assert.deepEqual(r.path[r.path.length - 1], { x: 3, y: 0 });
});
