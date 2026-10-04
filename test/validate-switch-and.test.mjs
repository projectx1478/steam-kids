// validate-lessons: スイッチの対象共有(AND)は許可し、スイッチ位置との重複は引き続きNGにする(Issue #250)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/switch-04-ryouhou.json', 'utf-8'));

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson.steps.find((s) => s.stepId === 'p1'));
  const dir = mkdtempSync(path.join(tmpdir(), 'vl-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'switches', title: 'スイッチ', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-lessons: 対象を共有する基準レッスン(switch-04)は検証を通る', () => {
  const r = validate(() => {});
  assert.equal(r.code, 0, r.out);
});

test('validate-lessons: NG検出: 対象がスイッチのマスと重なる', () => {
  const r = validate((p) => (p.switches[0].targets = [{ x: 1, y: 2 }]));
  assert.equal(r.code === 1 && r.out.includes('座標重複'), true, r.out);
});
