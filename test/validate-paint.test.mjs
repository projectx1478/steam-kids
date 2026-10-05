// validate-lessons: paintの検証（併用禁止・盤サイズ・目標の妥当性・必須性・手数）(Issue #286)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/paint-01-nuru.json', 'utf-8'));

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson.steps.find((s) => s.stepId === 'p1'));
  const dir = mkdtempSync(path.join(tmpdir(), 'vp-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'donguri', title: 'どんぐり', lessonIds: [lesson.lessonId] }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

const ng = (r, text) => r.code === 1 && r.out.includes(text);

test('validate-lessons: paintの基準レッスン(paint-01-nuru)は検証を通る', () => {
  const r = validate(() => {});
  assert.equal(r.code, 0, r.out);
});

test('validate-lessons: paintは他ギミックと併用できない（items・ice・cushion・warp・keys・doors・switches）', () => {
  const extras = {
    items: [{ x: 3, y: 3 }],
    ice: [{ x: 3, y: 3 }],
    cushion: [{ x: 3, y: 3 }],
    warp: [{ x: 3, y: 3 }],
    keys: [{ x: 3, y: 3, color: 'red' }],
    doors: [{ x: 3, y: 0, color: 'red' }],
    switches: [{ x: 3, y: 3, targets: [{ x: 3, y: 0 }] }],
  };
  for (const [field, value] of Object.entries(extras)) {
    const r = validate((p) => {
      p[field] = value;
    });
    assert.ok(ng(r, `paint は${field}と併用できない`), `${field}: ${r.out}`);
  }
});

test('validate-lessons: paintの盤サイズ・repeatBox/groupRepeats・目標の妥当性', () => {
  assert.ok(ng(validate((p) => { p.grid = { cols: 7, rows: 4 }; }), '6×6以内'));
  assert.ok(ng(validate((p) => { p.repeatBox = true; }), 'repeatBox・groupRepeats と併用できない'));
  assert.ok(ng(validate((p) => { p.groupRepeats = true; }), 'repeatBox・groupRepeats と併用できない'));
  assert.ok(ng(validate((p) => { p.paint = []; }), 'paint が空'));
  assert.ok(ng(validate((p) => { p.paint = [...p.paint, { x: 9, y: 9 }]; }), '盤外'));
  assert.ok(ng(validate((p) => { p.paint = [...p.paint, p.paint[0]]; }), '座標重複'));
  assert.ok(ng(validate((p) => { p.walls = [{ x: 0, y: 1 }]; }), '壁と重なる'));
  assert.ok(ng(validate((p) => { p.paint = p.paint.filter((c) => !(c.x === 1 && c.y === 3)); }), 'goalのマスが含まれない'));
});

test('validate-lessons: paintの必須性（目標が最短経路より大きい）と手数（maxCommands＝最短）', () => {
  const line = (p) => {
    p.paint = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }];
    p.maxCommands = 2;
  };
  assert.ok(ng(validate(line), 'paintの必須性'));
  assert.ok(ng(validate((p) => { p.maxCommands = 7; }), 'paintの手数'));
  assert.ok(ng(validate((p) => { p.solution = ['down', 'down']; }), 'solutionを実行してもクリアしない'));
});
