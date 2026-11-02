// validate-lessons: rollBalls・pits の入力検査と、必須性・詰みの検査（Issue #287）。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLesson } from '../tools/lib/validate/lesson.mjs';

const base = JSON.parse(readFileSync('lessons/roll-01-korogasu.json', 'utf-8'));
const FILE = 'roll-01-korogasu.json';
const board4 = { grid: { cols: 5, rows: 4 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 3 }, walls: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }], rollBalls: [{ x: 2, y: 1 }], pits: [{ x: 2, y: 2 }], solution: ['right', 'right', 'down', 'down', 'down'], maxCommands: 7 };

// p1 を書き換えた roll-01 を validate して、エラー文の配列を返す。
function check(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson, lesson.steps.find((s) => s.stepId === 'p1'));
  return validateLesson(FILE, lesson);
}
const has = (errs, rule, text) => errs.some((e) => e.includes(`: ${rule}: `) && (!text || e.includes(text)));

test('roll-01-korogasu はそのまま合格', () => {
  assert.deepEqual(validateLesson(FILE, JSON.parse(JSON.stringify(base))), []);
});

test('個数：3個以上／おとし穴が球より多い／片方だけ', () => {
  assert.ok(has(check((l, p) => { p.rollBalls = [{ x: 2, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 2 }]; }), '盤面の妥当性', '3個以上'));
  assert.ok(has(check((l, p) => { p.pits = [{ x: 3, y: 1 }, { x: 4, y: 0 }]; }), '盤面の妥当性', 'より多い'));
  assert.ok(has(check((l, p) => { p.pits = []; }), '盤面の妥当性', 'pits が空'));
  assert.ok(has(check((l, p) => { p.rollBalls = []; }), '盤面の妥当性', 'rollBalls が空'));
});

test('座標：盤外・整数でない・重複・重なり', () => {
  assert.ok(has(check((l, p) => { p.pits = [{ x: 9, y: 1 }]; }), '盤面の妥当性', '盤外'));
  assert.ok(has(check((l, p) => { p.pits = [{ x: 3.5, y: 1 }]; }), '盤面の妥当性', '整数'));
  assert.ok(has(check((l, p) => { p.rollBalls = [{ x: 2, y: 1 }, { x: 2, y: 1 }]; p.pits = [{ x: 3, y: 1 }, { x: 4, y: 0 }]; }), '盤面の妥当性', '座標重複'));
  assert.ok(has(check((l, p) => { p.pits = [{ x: 2, y: 0 }]; }), '盤面の妥当性', '壁と重なる'));
  assert.ok(has(check((l, p) => { p.rollBalls = [{ x: 0, y: 1 }]; }), '盤面の妥当性', 'startと重なる'));
  assert.ok(has(check((l, p) => { p.rollBalls = [{ x: 5, y: 1 }]; }), '盤面の妥当性', 'goalと重なる'));
  assert.ok(has(check((l, p) => { p.pits = [{ x: 2, y: 1 }]; }), '盤面の妥当性', 'pits[0] がrollBallsと重なる'));
});

test('併用禁止：他ギミック・repeatBox・groupRepeats', () => {
  assert.ok(has(check((l, p) => { p.items = [{ x: 4, y: 1 }]; }), '盤面の妥当性', 'items は同じ盤に置けない'));
  assert.ok(has(check((l, p) => { p.ice = [{ x: 4, y: 1 }]; }), '盤面の妥当性', 'ice は同じ盤に置けない'));
  assert.ok(has(check((l, p) => { p.groupRepeats = true; }), '盤面の妥当性', 'groupRepeats'));
  assert.ok(has(check((l, p) => { p.repeatBox = true; }), '盤面の妥当性', 'repeatBox'));
});

test('置き場所：tutorial と intro.demo には書けない', () => {
  const tut = JSON.parse(JSON.stringify(base));
  const p1 = tut.steps.find((s) => s.stepId === 'p1');
  tut.steps.splice(1, 0, { ...JSON.parse(JSON.stringify(p1)), stepId: 't1', kind: 'tutorial', script: [{ tap: 'run' }] });
  assert.ok(has(validateLesson(FILE, tut), 'rollBallsの置き場所', 'tutorial'));
  const demo = JSON.parse(JSON.stringify(base));
  demo.steps[0].demo = { grid: p1.grid, start: p1.start, goal: p1.goal, walls: p1.walls, rollBalls: p1.rollBalls, pits: p1.pits, commands: p1.solution };
  assert.ok(has(validateLesson(FILE, demo), 'rollBallsの置き場所', 'demo'));
});

test('転がす球の必須性：球を外しても届く盤はNG', () => {
  const errs = check((l, p) => { p.walls = p.walls.filter((w) => w.y !== 0); });
  assert.ok(has(errs, '転がす球の必須性', '最短7'));
});

test('詰みの検査：詰みに届く盤はNG', () => {
  const errs = check((l, p) => { Object.assign(p, board4); });
  assert.ok(has(errs, '詰みの検査', '詰み18状態'));
});
