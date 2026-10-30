// validate-lessons: predict-slider（シーソー）のNG例を検出する(Issue #150)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 基準は teko-01 の p1〜p3 の複製（本物の teko-01 は面が増えても、このテストの入力は変えない）
const full = JSON.parse(readFileSync('lessons/teko-01-tsuriai.json', 'utf-8'));
const base = { ...full, estimatedMinutes: 5, steps: full.steps.filter((s) => ['s1', 'p1', 'p2', 'p3', 's2'].includes(s.stepId)) };

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

// 重さの違うおもり（Issue #612）：設計の8盤（review/design/612/boards/lessons.json）を写し、出る rule と件数を確かめる。
const mp = (stepId, notches, left, mover, solution) => ({ stepId, kind: 'play', seesaw: { notches, left, mover }, solution });
const w1 = { robots: 1, maxRobots: 3, fixedPos: 1, start: 1 };
const board = (plays) => (l) => {
  const s1 = l.steps.find((s) => s.stepId === 's1');
  const s2 = l.steps.find((s) => s.stepId === 's2');
  l.steps = [s1, ...plays, s2];
};
const boards = [
  ['pass-teko-04', [], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], w1, 3),
    mp('p3', 3, [{ robots: 2, pos: 2 }], { robots: 1, maxRobots: 3, fixedPos: 2, start: 2 }, 2),
  ])],
  ['pass-teko-05', [], board([
    mp('p1', 2, [{ robots: 1, pos: 2 }], { robots: 1, maxRobots: 3, start: 1 }, [1, 2]),
    mp('p2', 2, [{ robots: 1, pos: 2 }], { robots: 2, maxRobots: 3, start: 2 }, [2, 1]),
    mp('p3', 4, [{ robots: 1, pos: 4 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 2]),
    mp('p4', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 3]),
  ])],
  ['ng-no-solution', ['解の個数:p2', 'solution:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }, { robots: 1, pos: 2 }], { robots: 1, maxRobots: 2, fixedPos: 2, start: 2 }, 2),
  ])],
  ['ng-maxRobots-range', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 2, pos: 2 }], { robots: 1, maxRobots: 4, fixedPos: 1, start: 1 }, 4),
  ])],
  ['ng-robots-over-max', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 3, maxRobots: 2, fixedPos: 1, start: 1 }, 3),
  ])],
  ['ng-fixedPos-start-mismatch', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 1, maxRobots: 3, fixedPos: 1, start: 2 }, 3),
  ])],
  ['ng-fixedPos-without-max', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 1, fixedPos: 1, start: 1 }, 3),
  ])],
  ['ng-solution-shape', ['solution:p1'], board([
    mp('p1', 2, [{ robots: 1, pos: 2 }], { robots: 1, maxRobots: 3, start: 1 }, 2),
    mp('p2', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 3]),
  ])],
];
for (const [name, expected, mutate] of boards) {
  test(`validate-lessons: 重さの盤 ${name}`, () => {
    const r = validate(mutate);
    const lines = r.out.split('\n');
    // 出力から「rule」と stepId を拾い、期待（rule:stepId の全体）と一致することを確かめる
    const got = [];
    for (const rule of ['解の個数', 'solution', 'seesaw', 'start', '難易度', '盤面の必須']) {
      for (const line of lines) {
        const m = line.includes(rule) && line.match(/stepId="(p\d)"/);
        if (m && line.indexOf(rule) < line.indexOf('stepId=')) got.push(`${rule}:${m[1]}`);
      }
    }
    assert.deepEqual(got.sort(), [...expected].sort(), r.out);
    assert.equal(r.code, expected.length === 0 ? 0 : 1, r.out);
  });
}
