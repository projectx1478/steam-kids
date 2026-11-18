// Issue #726: play の role・note の検査（役割の揃い・値・順序・note の字数、最短手数の非減少の適用範囲）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLesson } from '../tools/lib/validate/lesson.mjs';

const CMDS = ['up', 'down', 'left', 'right'];
// 横一列の盤で、start(0,0)→goal(n,0)。最短 n 手。
const play = (stepId, n, extra = {}) => ({
  stepId,
  kind: 'play',
  text: 'ゴールへ いこう',
  grid: { cols: 9, rows: 3 },
  start: { x: 0, y: 0 },
  goal: { x: n, y: 0 },
  walls: [],
  allowedCommands: CMDS,
  solution: Array(n).fill('right'),
  maxCommands: n + 2,
  ...extra,
});
const lesson = (plays) => ({
  lessonId: 'role-test',
  unitId: 'role-test',
  title: 'role',
  type: 'grid-runtime',
  estimatedMinutes: 3,
  steps: [{ stepId: 's1', kind: 'intro', text: 'あそぼう' }, ...plays, { stepId: 's2', kind: 'summary', text: 'おわり' }],
});
const run = (plays) => validateLesson('role-test.json', lesson(plays));
const has = (errors, rule) => errors.some((e) => String(e.rule ?? e).includes(rule));
const note = 'きづく：あ／すなお：い';
const R = (role, n) => ({ role, note });

test('役割3面（deau,tsukau,hineru・note あり）は役割の不合格が0件', () => {
  const e = run([play('p1', 2, R('deau')), play('p2', 3, R('tsukau')), play('p3', 4, R('hineru'))]);
  for (const r of ['role の揃い', 'role の値', 'role の順序', 'note の字数']) assert.ok(!has(e, r), r);
});

test('1面だけ role か note が無い → role の揃い', () => {
  assert.ok(has(run([play('p1', 2, R('deau')), play('p2', 3, { note }), play('p3', 4, R('tsukau'))]), 'role の揃い'));
  assert.ok(has(run([play('p1', 2, R('deau')), play('p2', 3, { role: 'tsukau' }), play('p3', 4, R('tsukau'))]), 'role の揃い'));
});

test('role の値・note の字数', () => {
  assert.ok(has(run([play('p1', 2, { role: 'x', note }), play('p2', 3, R('tsukau'))]), 'role の値'));
  assert.ok(has(run([play('p1', 2, { role: 'deau', note: 'あ'.repeat(61) }), play('p2', 3, R('tsukau'))]), 'note の字数'));
  assert.ok(!has(run([play('p1', 2, { role: 'deau', note: 'あ'.repeat(60) }), play('p2', 3, R('tsukau'))]), 'note の字数'));
  assert.ok(has(run([play('p1', 2, { role: 'deau', note: '' }), play('p2', 3, R('tsukau'))]), 'note の字数'));
});

test('role の順序：deau→tsukau→deau は不合格、deau,deau,tsukau は合格', () => {
  assert.ok(has(run([play('p1', 2, R('deau')), play('p2', 3, R('tsukau')), play('p3', 4, R('deau'))]), 'role の順序'));
  assert.ok(!has(run([play('p1', 2, R('deau')), play('p2', 3, R('deau')), play('p3', 4, R('tsukau'))]), 'role の順序'));
});

test('難易度の順序：deau・tsukau の組だけ比べる／role 無しは今まで通り', () => {
  assert.ok(has(run([play('p1', 6, R('deau')), play('p2', 4, R('tsukau'))]), '難易度の順序'));
  assert.ok(!has(run([play('p1', 6, R('tsukau')), play('p2', 4, R('hineru'))]), '難易度の順序'));
  assert.ok(has(run([play('p1', 6), play('p2', 4)]), '難易度の順序'));
});
