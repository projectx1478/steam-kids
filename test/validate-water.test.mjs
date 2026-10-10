// validate-lessons: water・bridge・waterModeの検証と、waterModeによる動きの切替 (Issue #338)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simulate, boardSpec } from '../js/engine-grid.js';

const base = JSON.parse(readFileSync('lessons/paint-01-nuru.json', 'utf-8'));

const row = (y, cols = 6) => Array.from({ length: cols }, (_, x) => ({ x, y }));
const glasses = () => ({
  stepId: 'p1',
  kind: 'play',
  text: 'ゴールへ',
  grid: { cols: 6, rows: 4 },
  start: { x: 0, y: 2 },
  goal: { x: 5, y: 1 },
  walls: [],
  water: [...row(0), ...row(3), { x: 2, y: 2 }, { x: 3, y: 2 }],
  bridge: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['up', 'right', 'right', 'right', 'right', 'right'],
  maxCommands: 6,
});

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  const i = lesson.steps.findIndex((s) => s.stepId === 'p1');
  const step = glasses();
  mutate(step);
  lesson.steps[i] = step;
  const dir = mkdtempSync(path.join(tmpdir(), 'vw-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'donguri', title: 'どんぐり', lessonIds: [lesson.lessonId] }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

const ng = (r, text) => r.code === 1 && r.out.includes(text);

test('validate-lessons: 合格盤（眼鏡型：水14・橋2）は検証を通る', () => {
  const r = validate(() => {});
  assert.equal(r.code, 0, r.out);
  assert.equal(validate((p) => { p.waterMode = 'cushion'; }).code, 0);
});

test('validate-lessons: startが水の上にある盤は検証NG', () => {
  assert.ok(ng(validate((p) => { p.water = [{ x: 0, y: 2 }, { x: 2, y: 2 }]; p.bridge = []; }), 'water[0] がstartと重なる'));
});

test('validate-lessons: 橋が水と重なる／橋の隣に水が無い盤は検証NG', () => {
  assert.ok(ng(validate((p) => { p.water = [{ x: 2, y: 2 }, { x: 3, y: 2 }]; p.bridge = [{ x: 2, y: 2 }]; }), 'bridge[0] がwaterと重なる'));
  assert.ok(ng(validate((p) => { p.water = [{ x: 5, y: 0 }]; p.bridge = [{ x: 1, y: 2 }]; }), 'bridge[0] の上下左右に水が無い'));
});

test('validate-lessons: waterModeの不正値・waterが空での指定は検証NG', () => {
  assert.ok(ng(validate((p) => { p.waterMode = 'splash'; }), 'waterMode="splash" が不正'));
  assert.ok(ng(validate((p) => { p.water = []; p.bridge = []; p.waterMode = 'bump'; }), 'waterMode を指定できない'));
});

test('validate-lessons: 水の盤外・重複・他ギミックとの重なりは検証NG', () => {
  assert.ok(ng(validate((p) => { p.water = [...p.water, { x: 9, y: 9 }]; }), '盤外'));
  assert.ok(ng(validate((p) => { p.water = [...p.water, p.water[0]]; }), '他のwaterと座標重複'));
  assert.ok(ng(validate((p) => { p.bridge = [...p.bridge, p.bridge[0]]; }), '他のbridgeと座標重複'));
  assert.ok(ng(validate((p) => { p.walls = [{ x: 0, y: 0 }]; }), 'water[0] が壁と重なる'));
  assert.ok(ng(validate((p) => { p.items = [{ x: 2, y: 2 }]; }), 'water[12] がitemsと重なる'));
  assert.ok(ng(validate((p) => { p.cushion = [{ x: 0, y: 0 }]; }), 'water[0] がcushionと重なる'));
  assert.ok(ng(validate((p) => { p.keys = [{ x: 0, y: 0, color: 'red' }]; }), 'keys[0] がwaterと重なる'));
  assert.ok(ng(validate((p) => { p.periodic = [{ x: 0, y: 0, period: 2 }]; }), 'periodic[0] がwaterと重なる'));
  assert.ok(ng(validate((p) => { p.switches = [{ x: 1, y: 1, targets: [{ x: 0, y: 0 }] }]; }), 'switches[0].targets[0] がwaterと重なる'));
});

test('waterMode: cushion型は止まるだけで失敗にならず、bump型は壁と同じ失敗になる', () => {
  const spec = (mode) => boardSpec({ ...glasses(), start: { x: 0, y: 1 }, ...(mode ? { waterMode: mode } : {}) });
  for (const mode of [undefined, 'cushion']) {
    const r = simulate(['up', 'right'], spec(mode));
    assert.deepEqual(r.blockedAt, [], `${mode}`);
    assert.deepEqual(r.path[1], { x: 0, y: 1 });
    assert.deepEqual(r.path.at(-1), { x: 1, y: 1 });
  }
  const b = simulate(['up', 'right'], spec('bump'));
  assert.deepEqual(b.blockedAt, [0]);
  assert.equal(b.bumped[0], true);
});
