// validate-lessons: mode:"close"の検証（出現後の到達不能・罠が無意味・併用禁止・出現先の重なり）(Issue #149)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/switch-06-kabe-deru.json', 'utf-8'));

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

const ng = (r, text) => r.code === 1 && r.out.includes(text);

test('validate-lessons: closeの基準レッスン(switch-06)は検証を通る', () => {
  const r = validate(() => {});
  assert.equal(r.code, 0, r.out);
});

test('validate-lessons: NG検出: 出現後にゴールへ到達不能', () => {
  // 迂回路（上段）を壁で塞ぐ：スイッチを必ず踏むことになり、出た壁でゴールへ到達不能になる。
  const r = validate((p) => p.walls.push({ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }));
  assert.equal(ng(r, 'ゴール到達可能性'), true, r.out);
});

test('validate-lessons: NG検出: 罠が無意味（スイッチが最短経路上に無い）', () => {
  const r = validate((p) => {
    p.switches[0] = { x: 2, y: 0, mode: 'close', targets: [{ x: 3, y: 0 }] };
  });
  assert.equal(ng(r, 'スイッチの罠の意味'), true, r.out);
});

test('validate-lessons: NG検出: openとの併用', () => {
  const r = validate((p) => p.switches.push({ x: 0, y: 0, targets: [{ x: 4, y: 0 }] }));
  assert.equal(ng(r, 'openと併用できない'), true, r.out);
});

test('validate-lessons: NG検出: closeのAND（対象の共有）', () => {
  const r = validate((p) => p.switches.push({ x: 0, y: 0, mode: 'close', targets: [{ x: 3, y: 1 }] }));
  assert.equal(ng(r, '対象を共有できない'), true, r.out);
});

test('validate-lessons: NG検出: 氷との併用（対象が氷上）', () => {
  const r = validate((p) => (p.ice = [{ x: 3, y: 1 }]));
  assert.equal(ng(r, 'iceと重なる'), true, r.out);
});

test('validate-lessons: NG検出: 出現先がstart・goal・スイッチ自身', () => {
  assert.equal(ng(validate((p) => (p.switches[0].targets = [{ x: 0, y: 1 }])), 'startと重なる'), true);
  assert.equal(ng(validate((p) => (p.switches[0].targets = [{ x: 4, y: 1 }])), 'goalと重なる'), true);
  assert.equal(ng(validate((p) => (p.switches[0].targets = [{ x: 2, y: 1 }])), '座標重複'), true);
});
