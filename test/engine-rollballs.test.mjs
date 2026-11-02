// 転がす球（rollBalls・pits）のエンジン：転がす・埋まる・動かせない・stateKey・最短・詰みの検査（Issue #287）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, shortestSteps, findDeadStates, boardSpec } from '../js/engine-grid.js';
import { rollBalls } from '../js/gimmicks/rollballs.js';

const lesson = JSON.parse(readFileSync('lessons/roll-01-korogasu.json', 'utf-8'));
const board1 = lesson.steps.find((s) => s.stepId === 'p1');
const board2 = lesson.steps.find((s) => s.stepId === 'p2');
const board3 = {"grid":{"cols":6,"rows":5},"start":{"x":0,"y":1},"goal":{"x":4,"y":4},"walls":[{"x":1,"y":0},{"x":2,"y":0},{"x":1,"y":2},{"x":2,"y":2},{"x":3,"y":2},{"x":5,"y":2},{"x":0,"y":3},{"x":1,"y":3},{"x":2,"y":3},{"x":3,"y":3},{"x":5,"y":3}],"rollBalls":[{"x":1,"y":1},{"x":4,"y":2}],"pits":[{"x":2,"y":1},{"x":4,"y":3}],"allowedCommands":["up","down","left","right"],"maxCommands":9};
const board4 = {"grid":{"cols":5,"rows":4},"start":{"x":0,"y":0},"goal":{"x":2,"y":3},"walls":[{"x":0,"y":2},{"x":1,"y":2},{"x":3,"y":2},{"x":4,"y":2}],"rollBalls":[{"x":2,"y":1}],"pits":[{"x":2,"y":2}],"allowedCommands":["up","down","left","right"],"maxCommands":7};

// 5x3の空き盤：start(0,1)・goal(4,1)。
const open = (extra) => ({ grid: { cols: 5, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [], ...extra });

test('球をゴール方向へ転がす：球が1マス動きロボットはそのマスへ入る', () => {
  const r = simulate(['right', 'right'], open({ rollBalls: [{ x: 1, y: 1 }], pits: [{ x: 4, y: 0 }] }));
  assert.deepEqual(r.path.at(-1), { x: 2, y: 1 });
  assert.deepEqual(r.rolls, [{ from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, fill: null }, { from: { x: 2, y: 1 }, to: { x: 3, y: 1 }, fill: null }]);
  assert.deepEqual(r.blockedAt, []);
});

test('球は1マスで止まる（転がり続けない）', () => {
  const r = simulate(['right', 'right', 'right'], open({ rollBalls: [{ x: 1, y: 1 }], pits: [{ x: 4, y: 0 }] }));
  assert.deepEqual(r.rolls.map((x) => x && x.to), [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]);
});

test('転がし先がおとし穴：球は消え穴が埋まって通れる', () => {
  const r = simulate(['right', 'right', 'right'], open({ rollBalls: [{ x: 1, y: 1 }], pits: [{ x: 2, y: 1 }] }));
  assert.equal(r.rolls[0].fill, 0);
  assert.deepEqual(r.path.at(-1), { x: 3, y: 1 });
  assert.deepEqual(r.blockedAt, []);
});

test('動かせない：転がし先が壁・盤外・他の球', () => {
  const wall = simulate(['right'], open({ rollBalls: [{ x: 1, y: 1 }], pits: [{ x: 4, y: 0 }], walls: [{ x: 2, y: 1 }] }));
  assert.deepEqual(wall.blockedAt, [0]);
  assert.deepEqual(wall.rolls, [{ from: { x: 1, y: 1 }, stuck: true }]);
  assert.deepEqual(wall.path.at(-1), { x: 0, y: 1 });
  assert.deepEqual(wall.bumped, [true]);
  const edge = simulate(['up', 'right', 'down'], { grid: { cols: 3, rows: 3 }, start: { x: 1, y: 1 }, goal: { x: 2, y: 2 }, walls: [], rollBalls: [{ x: 1, y: 0 }], pits: [{ x: 2, y: 0 }] });
  assert.deepEqual(edge.blockedAt, [0]);
  const pair = simulate(['right'], open({ rollBalls: [{ x: 1, y: 1 }, { x: 2, y: 1 }], pits: [{ x: 4, y: 0 }, { x: 4, y: 2 }] }));
  assert.deepEqual(pair.blockedAt, [0]);
  assert.deepEqual(pair.rolls[0], { from: { x: 1, y: 1 }, stuck: true });
});

test('埋まっていないおとし穴へ入る手は壁と同じ失敗', () => {
  const r = simulate(['right'], open({ rollBalls: [{ x: 3, y: 0 }], pits: [{ x: 1, y: 1 }] }));
  assert.deepEqual(r.blockedAt, [0]);
  assert.deepEqual(r.rolls, [null]);
});

test('rollsはpathの添字と揃う／球の無い盤では全null', () => {
  const r = simulate(['right', 'right', 'right', 'right', 'right'], board1);
  assert.equal(r.rolls.length, r.path.length - 1);
  assert.equal(r.rolls[1].fill, 0);
  const plain = simulate(['right', 'right', 'up'], open({}));
  assert.equal(plain.rolls.length, plain.path.length - 1);
  assert.ok(plain.rolls.every((x) => x === null));
});

test('stateKey：球の無い盤は空、ある盤は rb:位置/埋まりビット', () => {
  assert.equal(rollBalls.initState(open({})), null);
  assert.equal(rollBalls.stateKey(null), '');
  assert.equal(rollBalls.stateKey(rollBalls.initState(open({ rollBalls: [{ x: 2, y: 1 }], pits: [{ x: 3, y: 1 }] }))), 'rb:2,1/0');
  assert.equal(rollBalls.stateKey({ balls: [{ x: 3, y: 0 }, { x: 1, y: 2 }], filled: [true, false] }), 'rb:1,2;3,0/1');
  assert.equal(rollBalls.stateKey({ balls: [null, { x: 1, y: 2 }], filled: [true, false] }), 'rb:1,2/1');
});

test('最短手数：盤①5・盤②6・盤③7・盤④5', () => {
  assert.equal(shortestSteps(board1), 5);
  assert.equal(shortestSteps(board2), 6);
  assert.equal(shortestSteps(board3), 7);
  assert.equal(shortestSteps(board4), 5);
});

test('solutionでクリアできる', () => {
  for (const b of [board1, board2]) assert.equal(simulate(b.solution, boardSpec(b)).reachedGoal, true);
});

test('詰みの検査：盤①〜③は詰みなし、盤④は詰みに届く', () => {
  for (const b of [board1, board2, board3]) {
    const r = findDeadStates(b);
    assert.equal(r.dead, 0);
    assert.equal(r.truncated, false);
  }
  const trap = findDeadStates(board4);
  assert.equal(trap.dead, 18);
  assert.ok(trap.sample.length > 0);
});

test('詰みの検査：maxNodesで打ち切るとtruncated', () => {
  assert.equal(findDeadStates(board3, { maxNodes: 5 }).truncated, true);
});
