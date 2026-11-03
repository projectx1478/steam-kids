// validate-lessons: predict-slider（うかぶ・しずむ。play.buoyancy）の合否（Issue #288）。
// test/fixtures/buoyancy/ の実JSONを一時ディレクトリに置いて tools/validate-lessons.mjs にかける。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIR = 'test/fixtures/buoyancy';

function validate(name) {
  const lesson = JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf-8'));
  const dir = mkdtempSync(path.join(tmpdir(), 'vb-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-buoyancy: 288-ok は合格', () => {
  const r = validate('288-ok');
  assert.equal(r.code, 0, r.out);
});

// [ファイル名, 出るはずの規則名]
const ngCases = [
  ['288-ng-nonint', 'buoyancy'],
  ['288-ng-negative', 'buoyancy'],
  ['288-ng-start-over-max', 'buoyancy'],
  ['288-ng-balloons-start-over-max', 'buoyancy'],
  ['288-ng-unknown-key', 'buoyancy'],
  ['288-ng-base-over-8', 'buoyancy'],
  ['288-ng-weights-max-5', 'buoyancy'],
  ['288-ng-mass-zero', 'buoyancy'],
  ['288-ng-no-axis', 'buoyancy'],
  ['288-ng-start-balanced', 'start'],
  ['288-ng-no-solution-set', '解の個数'],
  ['288-ng-solution-not-in-set', 'solution'],
  ['288-ng-solution-shape', 'solution'],
  ['288-ng-solution-missing', 'solution'],
  ['288-ng-difficulty-decrease', '難易度'],
  ['288-ng-mixed-seesaw', 'seesawとbuoyancyの混在'],
  ['288-ok-lanes', 'buoyancy'],
  ['288-ng-lanes-balloons', 'buoyancy'],
  ['288-ng-unknown-view', 'buoyancy'],
];
for (const [name, rule] of ngCases) {
  test(`validate-buoyancy: ${name} は不合格（${rule}）`, () => {
    const r = validate(name);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `${name}\n${r.out}`);
  });
}
