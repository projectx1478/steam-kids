// 移行元: .claude/verify/scenarios/g-keys-engine.mjs（ブラウザ不要）
// keys（かぎとドア）：未所持の色のドアは壁と同じ失敗、所持後は通れる。BFSはかぎ所持を状態に含む（Issue #62）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps } from '../js/engine-grid.js';
import { keys } from '../js/gimmicks/keys.js';

const base = { grid: { cols: 5, rows: 2 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
const gate = { ...base, walls: [{ x: 2, y: 0 }], keys: [{ x: 0, y: 0, color: 'red' }], doors: [{ x: 2, y: 1, color: 'red' }] };
const last = (r) => r.path[r.path.length - 1];

test('engine-grid: keysのドア通行可否・滑走中のドア衝突・BFS・色ごとの対応(Issue #62)', () => {
  const closed = simulate(['right', 'right', 'right'], gate);
  assert.deepEqual(closed.blockedAt, [1, 2], 'かぎ無しでドアに当たると失敗(blockedAt)');
  assert.deepEqual(last(closed), { x: 1, y: 1 }, 'ドアの手前で止まる');

  const opened = simulate(['up', 'down', 'right', 'right', 'right', 'right'], gate);
  assert.deepEqual([opened.blockedAt, opened.reachedGoal], [[], true], 'かぎを取ればドアを通れる');

  const wrong = simulate(['up', 'down', 'right', 'right'], { ...gate, keys: [{ x: 0, y: 0, color: 'blue' }], doors: [{ x: 2, y: 1, color: 'red' }] });
  assert.deepEqual(wrong.blockedAt, [3], '違う色のかぎでは開かない');

  const slide = simulate(['right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual([slide.blockedAt, last(slide)], [[0], { x: 1, y: 1 }], 'こおりの滑走で閉じたドアに当たると失敗');
  const slideOpen = simulate(['up', 'down', 'right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual([slideOpen.blockedAt, last(slideOpen)], [[], { x: 2, y: 1 }], 'かぎ所持後は滑走でドアの上まで進む');

  const dist = [shortestSteps(gate), shortestSteps({ ...gate, keys: [] }), shortestSteps({ ...gate, walls: [{ x: 3, y: 0 }, { x: 3, y: 1 }] })];
  assert.deepEqual(dist, [6, Infinity, Infinity], '最短はかぎ経由(6手)・かぎ無しは到達不能・道が無ければ到達不能');
});

// keyMode（Issue #391）：onStep の描画だけが remote／carry で違い、通行可否・最短手数は同じ。
function onStepHarness(spec) {
  const timers = [];
  const origSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push(ms); return 0; };
  const keyEls = new Map(spec.keys.map((k) => [`${k.x},${k.y}`, { style: {}, remove() { this.removed = true; } }]));
  const doorCells = new Map(spec.doors.map((d) => [`${d.x},${d.y}`, { dataset: { doorOpen: 'false' }, querySelector: () => null }]));
  const view = { gimmickEls: { keys: { keyEls, doorCells } } };
  const run = {};
  return {
    keyEls, doorCells, timers,
    step: (x, y) => keys.onStep({ pos: { x, y }, spec, view, run }),
    done: () => { globalThis.setTimeout = origSetTimeout; },
  };
}
const doorOpen = (h, x, y) => h.doorCells.get(`${x},${y}`).dataset.doorOpen;

test('keys onStep: carry は取っても閉じたまま、扉のマスへ進入したとき開き、開いたら開いたまま(Issue #391)', () => {
  const h = onStepHarness({ ...gate, keyMode: 'carry' });
  try {
    assert.equal(h.step(0, 0), 'key', 'かぎを取ると key を返す');
    assert.equal(doorOpen(h, 2, 1), 'false', '取っても扉は閉じたまま');
    assert.deepEqual(h.timers, [400], '扉の音は鳴らさない（かぎが消える400msのみ）');
    assert.equal(h.step(1, 1), undefined);
    assert.equal(doorOpen(h, 2, 1), 'false', '扉の手前では閉じたまま');
    assert.equal(h.step(2, 1), undefined);
    assert.equal(doorOpen(h, 2, 1), 'true', '扉のマスへ進入すると開く');
    assert.deepEqual(h.timers, [400, 250], '開く音は250ms後');
    h.step(3, 1);
    h.step(2, 1);
    assert.equal(doorOpen(h, 2, 1), 'true', '開いた扉は開いたまま');
    assert.deepEqual(h.timers, [400, 250], '2回目の進入では音を鳴らさない');
  } finally { h.done(); }
});

test('keys onStep: keyMode 省略は carry と同じ(Issue #391)', () => {
  const h = onStepHarness(gate);
  try {
    h.step(0, 0);
    assert.equal(doorOpen(h, 2, 1), 'false');
  } finally { h.done(); }
});

test('keys onStep: remote はかぎを取った瞬間に扉が開く（従来どおり）(Issue #391)', () => {
  const h = onStepHarness({ ...gate, keyMode: 'remote' });
  try {
    assert.equal(h.step(0, 0), 'key');
    assert.equal(doorOpen(h, 2, 1), 'true', '取った瞬間に開く');
    assert.deepEqual(h.timers, [400, 250]);
  } finally { h.done(); }
});

test('keys: carry でも通行可否・最短手数は remote と同じ。かぎ無しで扉に当たると bumped(Issue #391)', () => {
  const carry = { ...gate, keyMode: 'carry' };
  const remote = { ...gate, keyMode: 'remote' };
  assert.equal(shortestSteps(carry), shortestSteps(remote));
  const bump = simulate(['right', 'right', 'right'], carry);
  assert.deepEqual(bump.blockedAt, [1, 2], 'carry でもかぎ無しで扉に当たると失敗');
  const ok = simulate(['up', 'down', 'right', 'right', 'right', 'right'], carry);
  assert.deepEqual([ok.blockedAt, ok.reachedGoal], [[], true]);
});
