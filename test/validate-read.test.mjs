// 「めいれいを よむ」面（play.read。Issue #723 の試作）の検証。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRead } from '../tools/lib/validate/read.mjs';
import { validateLesson } from '../tools/lib/validate/lesson.mjs';

const lesson = JSON.parse(readFileSync(new URL('../lessons/cmd-08-yomu.json', import.meta.url), 'utf-8'));
const plays = lesson.steps.filter((s) => s.kind === 'play');
const rulesOf = (play) => {
  const out = [];
  checkRead(play, (rule) => out.push(rule), '');
  return out;
};

test('cmd-08-yomu：3面とも read の検査を通る', () => {
  assert.equal(plays.length, 3);
  for (const play of plays) assert.deepEqual(rulesOf(play), []);
  assert.deepEqual(validateLesson('cmd-08-yomu.json', lesson), []);
});

test('止まるマスが重なる命令列は通らない', () => {
  const play = structuredClone(plays[0]);
  play.read.programs[1] = [...play.read.programs[0]];
  assert.deepEqual(rulesOf(play), ['readの止まるマス']);
});

test('壁（盤の外）にぶつかる命令列は通らない', () => {
  const play = structuredClone(plays[0]);
  play.read.programs[2] = ['left', 'up', 'up'];
  assert.ok(rulesOf(play).includes('readの衝突'));
});

test('1本目の止まるマスが goal と違えば通らない／本数と長さ', () => {
  const moved = structuredClone(plays[0]);
  moved.goal = { x: 0, y: 0 };
  assert.deepEqual(rulesOf(moved), ['readの止まるマス']);
  const two = structuredClone(plays[0]);
  two.read.programs.pop();
  assert.deepEqual(rulesOf(two), ['readの形']);
  const short = structuredClone(plays[0]);
  short.read.programs[1] = ['up', 'up'];
  assert.deepEqual(rulesOf(short), ['readの長さ']);
});

test('氷の面：止まるマスは滑った先になる（p3 の1本目）', () => {
  assert.deepEqual(plays[2].goal, { x: 4, y: 0 });
});
