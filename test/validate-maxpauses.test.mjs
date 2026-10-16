// validate-lessons: play ステージの maxPauses（0以上の整数のみ）の検査 (Issue #395 段1)。リポジトリ直下で実行すること。
// 盤は review/design/395/boards/pass-maxpauses-2.json を元にしたインライン版（15×15・鍵必須の蛇行一本道）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/key-01-kagi.json', 'utf-8'));

// y=0,4,8,12 の通路を、右端・左端・右端の隙間でつなぐ。それ以外の行は壁（隙間を除く）。
const walls = [];
for (let y = 1; y <= 13; y++) {
  if (y % 4 === 0) continue;
  const gapX = (y - 1) % 8 < 4 ? 14 : 0;
  for (let x = 0; x < 15; x++) if (x !== gapX) walls.push({ x, y });
}
for (let x = 0; x < 15; x++) {
  walls.push({ x, y: 14 });
}
const rep = (d, n) => Array(n).fill(d);
const solution = [
  ...rep('right', 14), ...rep('down', 4), ...rep('left', 14), ...rep('down', 4),
  ...rep('right', 14), ...rep('down', 4), ...rep('left', 14),
];
const board = {
  grid: { cols: 15, rows: 15 },
  start: { x: 0, y: 0 },
  goal: { x: 0, y: 12 },
  walls,
  keys: [{ x: 7, y: 4, color: 'red' }],
  doors: [{ x: 7, y: 8, color: 'red' }],
  keyMode: 'remote',
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution,
  maxCommands: 68,
};

function validate(extra) {
  const lesson = JSON.parse(JSON.stringify(base));
  // 難易度の順序（非減少）を満たすため p1・p2 を同じ盤にする。
  for (const id of ['p1', 'p2']) {
    const p = lesson.steps.find((s) => s.stepId === id);
    for (const k of ['grid', 'start', 'goal', 'walls', 'items', 'keys', 'doors', 'allowedCommands', 'solution', 'maxCommands', 'maxPauses']) delete p[k];
    Object.assign(p, JSON.parse(JSON.stringify(board)), extra);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'vl-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'keys', title: 'かぎ', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-lessons: maxPauses=2（0以上の整数）は maxPauses のエラーにならない', () => {
  const r = validate({ maxPauses: 2 });
  assert.equal(r.code, 0, r.out);
});

test('validate-lessons: maxPauses 省略・0 は maxPauses のエラーにならない', () => {
  assert.equal(validate({}).out.includes('maxPausesの型'), false);
  assert.equal(validate({ maxPauses: 0 }).out.includes('maxPausesの型'), false);
});

for (const [name, v] of [['負数 -1', -1], ['小数 1.5', 1.5], ['文字列', '2'], ['null', null]]) {
  test(`validate-lessons: NG検出: maxPauses が${name}`, () => {
    const r = validate({ maxPauses: v });
    assert.equal(r.code, 1, r.out);
    assert.equal(r.out.includes('maxPausesの型'), true, r.out);
  });
}
