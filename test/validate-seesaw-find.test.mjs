// validate-lessons: seesaw の find（つりあう置き方を find 個みつける面。Issue #722）。基準は lessons/teko-10-zenbu.json。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/teko-10-zenbu.json', 'utf-8'));
const play = (l, id) => l.steps.find((s) => s.stepId === id);

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson);
  const dir = mkdtempSync(path.join(tmpdir(), 'vsf-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }], longTrialIds: [lesson.lessonId] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-lessons: find 面の基準レッスン(teko-10)は検証を通る', () => {
  assert.equal(validate(() => {}).code, 0);
});

const cases = [
  ['つりあう組の数がfindと違う', '解の個数', (l) => (play(l, 'p2').seesaw.find = 2)],
  ['solutionに組が足りない', 'solution', (l) => (play(l, 'p2').solution = [[6, 1], [3, 2]])],
  ['solutionに同じ組が2回', 'solution', (l) => (play(l, 'p2').solution = [[6, 1], [3, 2], [3, 2]])],
  ['findが範囲外（1）', 'seesaw', (l) => (play(l, 'p1').seesaw.find = 1)],
  ['findが範囲外（4）', 'seesaw', (l) => (play(l, 'p1').seesaw.find = 4)],
  ['fixedPosの面にfind', 'seesaw', (l) => (play(l, 'p1').seesaw.mover.fixedPos = 1)],
  ['maxRobotsの無い面にfind', 'seesaw', (l) => delete play(l, 'p1').seesaw.mover.maxRobots],
];
for (const [label, rule, mutate] of cases) {
  test(`validate-lessons: find NG検出: ${label}`, () => {
    const r = validate(mutate);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `NG検出: ${label}\n${r.out}`);
  });
}

test('validate-lessons: intro のデモに find は書けない', () => {
  const r = validate((l) => {
    const s1 = l.steps.find((s) => s.stepId === 's1');
    s1.demo = { kind: 'seesaw', seesaw: { notches: 3, left: [{ robots: 1, pos: 3 }], mover: { robots: 1, start: 1 }, find: 2 }, solution: 3 };
  });
  assert.equal(r.code === 1 && r.out.includes('デモのseesaw'), true, r.out);
});
