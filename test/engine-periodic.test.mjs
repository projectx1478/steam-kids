// periodic（周期ドア）：turnとperiodによるblocksの切替・stateKey・tickの不変更新（Issue #310）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodic, phaseColors, OPEN_COUNT, MARK_SHAPE } from '../js/gimmicks/periodic.js';
import { GIMMICKS } from '../js/gimmicks/index.js';
import { simulate, isRunCleared, shortestSteps, shortestChips, shortestPath } from '../js/engine-grid.js';

const spec = { periodic: [{ x: 1, y: 0, period: 2 }, { x: 2, y: 0, period: 3 }, { x: 3, y: 0, period: 4 }] };
const at = (p, s, n) => {
  let st = s;
  for (let i = 0; i < n; i++) st = periodic.tick(st);
  return periodic.blocks(st, p, spec);
};

test('periodic: initState・blocksがturnとperiodで切り替わる', () => {
  const s = periodic.initState(spec);
  assert.equal(s.turn, 0);
  assert.deepEqual([at({ x: 1, y: 0 }, s, 0), at({ x: 1, y: 0 }, s, 1), at({ x: 1, y: 0 }, s, 2)], [false, true, false], 'period2＝開1閉1');
  assert.deepEqual([0, 1, 2, 3].map((n) => at({ x: 2, y: 0 }, s, n)), [false, true, true, false], 'period3＝開1閉2');
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => at({ x: 3, y: 0 }, s, n)), [false, false, true, true, false], 'period4＝開2閉2');
  assert.equal(at({ x: 0, y: 0 }, s, 1), false, 'ドア以外は通れる');
  assert.equal(periodic.blocks(periodic.initState({}), { x: 1, y: 0 }, {}), false, 'ドア無し盤は何も塞がない');
});

test('periodic: stateKeyはドア無しで定数・有りでturnの最小公倍数での余り', () => {
  const none = periodic.initState({});
  assert.equal(periodic.stateKey(none), periodic.stateKey(periodic.tick(none)));
  const s = periodic.initState(spec);
  const keys = [];
  let st = s;
  for (let i = 0; i < 13; i++) { keys.push(periodic.stateKey(st)); st = periodic.tick(st); }
  assert.equal(new Set(keys).size, 12, 'lcm(2,3,4)=12で一巡');
  assert.equal(keys[0], keys[12]);
});

test('periodic: tickは不変更新', () => {
  const s = periodic.initState(spec);
  const t = periodic.tick(s);
  assert.equal(s.turn, 0);
  assert.equal(t.turn, 1);
  assert.notEqual(s, t);
});

test('phaseColors: 周期2・3・4の色の並び（青＝開、黄・赤＝閉）', () => {
  assert.deepEqual(phaseColors(2), ['blue', 'red']);
  assert.deepEqual(phaseColors(3), ['blue', 'yellow', 'red']);
  assert.deepEqual(phaseColors(4), ['blue', 'blue', 'yellow', 'red']);
  assert.deepEqual(phaseColors(5), [], '範囲外は空');
  // 青の数＝開の手番数、青以外は閉（blocksと一致）
  for (const period of [2, 3, 4]) {
    const st = periodic.initState({ periodic: [{ x: 0, y: 0, period }] });
    let t = st;
    phaseColors(period).forEach((c, i) => {
      assert.equal(periodic.blocks(t, { x: 0, y: 0 }), c !== 'blue', `period${period} 手番${i}`);
      t = periodic.tick(t);
    });
    assert.equal(phaseColors(period).filter((c) => c === 'blue').length, OPEN_COUNT[period]);
  }
});

test('MARK_SHAPE: 色ごとの形（青●・黄▲・赤■）と周期2・3・4の形の並び', () => {
  assert.deepEqual(MARK_SHAPE, { blue: 'circle', yellow: 'triangle', red: 'square' });
  const shapes = (p) => phaseColors(p).map((c) => MARK_SHAPE[c]);
  assert.deepEqual(shapes(2), ['circle', 'square']);
  assert.deepEqual(shapes(3), ['circle', 'triangle', 'square']);
  assert.deepEqual(shapes(4), ['circle', 'circle', 'triangle', 'square']);
});

test('periodic: GIMMICKSに登録されている', () => {
  assert.ok(GIMMICKS.includes(periodic));
});

const board = (extra) => ({ grid: { cols: 6, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [], periodic: [{ x: 5, y: 1, period: 4 }], ...extra });
// periodicの既定ドア（盤の隅・period4）はturnを進める基準用（ドア無しだとcycle=1でturnが0固定になる）。

test('simulate: 氷の滑走全体で1手、次の手のturnAtは1', () => {
  const r = simulate(['right', 'right'], board({ ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }));
  assert.deepEqual(r.turnAt, [0, 1]);
  assert.deepEqual(r.path.slice(1, 4), [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], '1手目で3マス滑走');
});

test('simulate: repeatBox展開後に各方向1手', () => {
  const r = simulate([{ box: ['right', 'down'], times: 2 }, 'left'], board());
  assert.deepEqual(r.turnAt, [0, 1, 2, 3, 0], 'period4のcycle=4で丸める');
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
  const r = simulate(['left', 'right', 'right'], board({ periodic: [{ x: 1, y: 0, period: 2 }] }));
  assert.deepEqual(r.blockedAt, [0, 1], '手番0の壁衝突と、手番1（閉）のドア衝突');
  assert.deepEqual(r.turnAt, [0, 1, 0], 'period2のcycle=2で丸める');
  assert.deepEqual(r.path[r.path.length - 1], { x: 1, y: 0 });
});

test('simulate: 氷の滑走中は手の開始時のturnで判定（途中でturnは進まない）', () => {
  const r = simulate(['right'], board({ ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }], periodic: [{ x: 3, y: 0, period: 2 }] }));
  assert.deepEqual(r.blockedAt, [], 'turn0のままなので3マス目のドアは開いている');
  assert.deepEqual(r.path[r.path.length - 1], { x: 3, y: 0 });
});

// 探索（shortestSteps／shortestChips／shortestPath）とsimulateの手番が一致すること（Issue #310 段1-3）。
// 基準は、simulateで全命令列を総当たりして最初にクリアする手数（最小チップ数）。
const DIRS = ['up', 'down', 'left', 'right'];
function bruteForce(spec, maxLen) {
  const runs = (c) => c.reduce((n, d, i) => n + (i === 0 || d !== c[i - 1] ? 1 : 0), 0);
  let steps = Infinity;
  let chips = Infinity;
  const walk = (cmds) => {
    if (cmds.length > 0 && isRunCleared(simulate(cmds, spec))) {
      steps = Math.min(steps, cmds.length);
      chips = Math.min(chips, runs(cmds));
    }
    if (cmds.length >= maxLen) return;
    for (const d of DIRS) walk([...cmds, d]);
  };
  walk([]);
  return { steps, chips };
}
const pboard = (cols, rows, goalX, doors) => ({ grid: { cols, rows }, start: { x: 0, y: 0 }, goal: { x: goalX, y: 0 }, walls: [], periodic: doors });
const alwaysOpen = (spec) => ({ ...spec, periodic: [] });

// 手番0では必ず開くので、ドアは2手目以降に入る位置に置く。
for (const [name, spec, expectSteps] of [
  ['閉じた手番に当たるので寄り道が要る（period2）', pboard(4, 2, 3, [{ x: 2, y: 0, period: 2 }]), 5],
  ['寄り道で開く手番に合わせる（period3）', pboard(4, 2, 3, [{ x: 2, y: 0, period: 3 }]), 5],
  ['period4（開2閉2）で寄り道が要る', pboard(5, 2, 4, [{ x: 3, y: 0, period: 4 }]), 6],
  ['寄り道なしだと失敗する一本道（到達不能）', pboard(4, 1, 3, [{ x: 2, y: 0, period: 2 }]), Infinity],
]) {
  test(`探索とsimulateの手数が一致: ${name}`, () => {
    const bf = bruteForce(spec, 6);
    assert.equal(bf.steps, expectSteps, 'simulateの総当たり');
    assert.equal(shortestSteps(spec), expectSteps, 'shortestSteps');
    assert.equal(shortestChips(spec), bf.chips, 'shortestChips');
    const path = shortestPath(spec);
    if (expectSteps === Infinity) { assert.equal(path, null); return; }
    assert.equal(path.length, expectSteps, 'shortestPath');
    assert.ok(isRunCleared(simulate(path, spec)), 'shortestPathの解をsimulateが通す');
    assert.ok(shortestSteps(alwaysOpen(spec)) < expectSteps, 'ドアを無視した最短より長い');
  });
}

test('探索: ドアを無視すると最短3手、周期ドアでは5手', () => {
  const spec = pboard(4, 2, 3, [{ x: 2, y: 0, period: 3 }]);
  assert.equal(shortestSteps(alwaysOpen(spec)), 3);
  assert.equal(shortestSteps(spec), 5);
});

test('makeMover: 周期ドアの無い盤ではafterが元のstatesと同じ参照（手番の処理を飛ばす）', async () => {
  const { makeMover } = await import('../js/engine-grid.js');
  const plain = { grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [], items: [], ice: [] };
  const states = Object.fromEntries(GIMMICKS.map((g) => [g.key, g.initState(plain)]));
  const r = makeMover(plain)({ x: 0, y: 0 }, 'right', states);
  assert.equal(r.after, r.steps[r.steps.length - 1].states, 'after は手の最後のstatesそのもの');
  const r2 = makeMover(plain)({ x: 2, y: 0 }, 'right', states);
  assert.equal(r2.after, states, '動けない手も元のstatesのまま');
});

test('gimmicksKey: 周期ドアの無い盤のキーにperiodicの項が入らない', () => {
  assert.equal(periodic.stateKey(periodic.initState({})), '');
  const plain = pboard(4, 2, 3, []);
  assert.equal(shortestSteps(plain), 3);
  assert.equal(shortestSteps(pboard(4, 2, 3, [{ x: 2, y: 0, period: 3 }])), 5, '周期ドア盤の最短は変わらない');
});
