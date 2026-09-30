// 移行元: .claude/verify/scenarios/g-keys-engine.mjs（ブラウザ不要）
// keys（かぎとドア）：未所持の色のドアは壁と同じ失敗、所持後は通れる。BFSはかぎ所持を状態に含む（Issue #62）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps } from '../js/engine-grid.js';

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
