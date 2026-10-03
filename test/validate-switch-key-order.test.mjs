// validate-lessons: スイッチ→かぎの順序検査のNG例を検出する(Issue #248)。リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/switch-03-suicchi-kagi.json', 'utf-8'));

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

test('validate-lessons: 基準レッスン(switch-03)は検証を通る', () => {
  assert.equal(validate(() => {}).code, 0, validate(() => {}).out);
});

test('validate-lessons: NG検出: スイッチなしでかぎに届く', () => {
  // 切替壁(2,0)の代わりに別の位置を対象にすると、(2,0)が通れて、スイッチなしでかぎに届く。
  const r = validate((p) => (p.switches[0].targets = [{ x: 0, y: 1 }]));
  assert.equal(r.code === 1 && r.out.includes('スイッチ→かぎの順序'), true, r.out);
});
