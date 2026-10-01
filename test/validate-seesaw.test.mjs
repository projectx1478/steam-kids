// validate-lessons: predict-slider（シーソー）のNG例を検出する(Issue #150)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/teko-01-tsuriai.json', 'utf-8'));

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson);
  const dir = mkdtempSync(path.join(tmpdir(), 'vs-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}
const play = (l, id) => l.steps.find((s) => s.stepId === id);

test('validate-lessons: 基準レッスン(teko-01)は検証を通る', () => {
  assert.equal(validate(() => {}).code, 0);
});

const cases = [
  ['つりあう位置がない', '解の個数', (l) => (play(l, 'p1').seesaw.left = [{ robots: 1, pos: 3 }]) && (play(l, 'p1').seesaw.mover.robots = 2)],
  ['startでつりあっている', 'start', (l) => (play(l, 'p1').seesaw.mover.start = 2)],
  ['solutionがずれている', 'solution', (l) => (play(l, 'p1').solution = 3)],
  ['座標が範囲外', 'seesaw', (l) => (play(l, 'p1').seesaw.left[0].pos = 9)],
  ['難易度が減少', '難易度', (l) => (play(l, 'p3').seesaw.left = [{ robots: 1, pos: 1 }]) && (play(l, 'p3').solution = 1)],
  ['playが1個', '盤面の必須', (l) => (l.steps = l.steps.filter((s) => !['p2', 'p3'].includes(s.stepId)))],
];
for (const [label, rule, mutate] of cases) {
  test(`validate-lessons: NG検出: ${label}`, () => {
    const r = validate(mutate);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `NG検出: ${label}\n${r.out}`);
  });
}
