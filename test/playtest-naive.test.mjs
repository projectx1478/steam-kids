// tools/playtest/naive.mjs（Issue #766）：「素直な手」（ゴールへまっすぐ）の組み立てと、解けない最初の面の選択。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, isRunCleared } from '../js/engine-grid.js';
import { naiveCommands, pickNaiveFailPlay } from '../tools/playtest/naive.mjs';

const cmd01 = JSON.parse(readFileSync('lessons/cmd-01-susumu.json', 'utf-8'));
const plays = cmd01.steps.filter((s) => s.kind === 'play');
const [p1, , p3] = plays;
const board = (o) => ({ kind: 'play', grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, ...o });

test('naiveCommands: cmd-01 p1 の横→縦は left×2 up×2', () => {
  assert.deepEqual(naiveCommands(p1, 'xy'), ['left', 'left', 'up', 'up']);
});

test('naiveCommands: cmd-01 p3 の横→縦は right×4 up×4 で、クリアにならない', () => {
  const cmds = naiveCommands(p3, 'xy');
  assert.deepEqual(cmds, ['right', 'right', 'right', 'right', 'up', 'up', 'up', 'up']);
  assert.equal(isRunCleared(simulate(cmds, p3)), false);
});

test('pickNaiveFailPlay: cmd-01 では p3（index 2）', () => {
  assert.deepEqual(pickNaiveFailPlay(plays), { index: 2, commands: naiveCommands(p3, 'xy') });
});

test('pickNaiveFailPlay: 壁の無い 3×3 だけなら index -1', () => {
  assert.deepEqual(pickNaiveFailPlay([board({})]), { index: -1, commands: null });
});

test('naiveCommands: 使えない方向／goal 無し／maxCommands の切り詰め', () => {
  assert.equal(naiveCommands(board({ start: { x: 2, y: 0 }, goal: { x: 0, y: 0 }, allowedCommands: ['up', 'right'] }), 'xy'), null);
  assert.equal(naiveCommands({ ...board({}), goal: undefined }, 'xy'), null);
  assert.equal(naiveCommands(board({ maxCommands: 3 }), 'xy').length, 3);
  assert.equal(naiveCommands(board({ goal: { x: 0, y: 0 } }), 'xy'), null); // 結果が空
});
