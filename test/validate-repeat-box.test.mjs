// 移行元: .claude/verify/scenarios/repeat-box-validate.mjs（ブラウザ不要）
// validate-lessons: くりかえしの箱のNG例を検出する(Issue #66)。リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/cmd-04-kurikaeshi.json', 'utf-8'));

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson.steps.find((s) => s.stepId === 'p1'));
  const dir = mkdtempSync(path.join(tmpdir(), 'vl-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'commands', title: 'めいれい', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-lessons: 基準レッスン(cmd-04)は検証を通る', () => {
  assert.equal(validate(() => {}).code, 0, '基準レッスン(cmd-04)は検証を通る');
});

const cases = [
  ['回数0', '箱の回数', (p) => (p.solution = [{ box: ['right'], times: 0 }])],
  ['回数が上限超え(5)', '箱の回数', (p) => (p.solution = [{ box: ['right'], times: 5 }])],
  ['空の箱', '空の箱', (p) => (p.solution = [{ box: [], times: 4 }])],
  ['入れ子の箱', '箱の入れ子', (p) => (p.solution = [{ box: [{ box: ['right'], times: 2 }], times: 2 }])],
  ['maxCommands不足', 'solutionの手数', (p) => (p.maxCommands = 1)],
  ['箱なしで解ける', '箱の必須性', (p) => (p.maxCommands = 4)],
  ['groupRepeatsと同時指定', 'repeatBoxとgroupRepeats', (p) => (p.groupRepeats = true)],
  ['solution無し', 'solutionの必須', (p) => delete p.solution],
];
for (const [label, rule, mutate] of cases) {
  test(`validate-lessons: NG検出: ${label}`, () => {
    const r = validate(mutate);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `NG検出: ${label}`);
  });
}
