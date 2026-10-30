// validate-lessons: switches mode:"toggle" の検証（トグルの意味・必須性・併用禁止）(Issue #388)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/switch-06-kabe-deru.json', 'utf-8'));
const ALL = ['up', 'down', 'left', 'right'];

const fiveWalls = [0, 1, 2, 3, 4].flatMap((x) => [{ x, y: 0 }, { x, y: 2 }]);
const sixWalls = [0, 1, 2, 4, 5].map((x) => ({ x, y: 0 })).concat([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 2 })));

const five = { grid: { cols: 5, rows: 3 }, start: { x: 2, y: 1 }, goal: { x: 4, y: 1 }, walls: fiveWalls, allowedCommands: ALL, maxCommands: 10 };
const six = { grid: { cols: 6, rows: 3 }, start: { x: 3, y: 1 }, goal: { x: 5, y: 1 }, walls: sixWalls, allowedCommands: ALL, maxCommands: 14 };

const BOARDS = {
  'pass-toggle-meaningful': { ...five, items: [{ x: 0, y: 1 }], switches: [{ x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] }] },
  'pass-toggle-mixed': {
    ...six,
    items: [{ x: 0, y: 1 }],
    switches: [{ x: 3, y: 0, mode: 'toggle', targets: [{ x: 4, y: 1, initial: 'open' }, { x: 1, y: 1 }] }],
  },
  'fail-toggle-meaningless': { ...five, switches: [{ x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] }] },
  'fail-toggle-mixed': {
    ...five,
    items: [{ x: 0, y: 1 }],
    switches: [
      { x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] },
      { x: 0, y: 1, mode: 'close', targets: [{ x: 3, y: 1 }] },
    ],
  },
  'fail-toggle-all-open': {
    ...six,
    items: [{ x: 0, y: 1 }],
    switches: [{ x: 3, y: 0, mode: 'toggle', targets: [{ x: 4, y: 1, initial: 'open' }, { x: 1, y: 1, initial: 'open' }] }],
  },
  'fail-toggle-mixed-meaningless': {
    ...six,
    switches: [{ x: 3, y: 0, mode: 'toggle', targets: [{ x: 4, y: 1, initial: 'open' }, { x: 1, y: 1 }] }],
  },
};

function validate(board) {
  const lesson = JSON.parse(JSON.stringify(base));
  const p1 = lesson.steps.find((s) => s.stepId === 'p1');
  for (const k of ['grid', 'start', 'goal', 'walls', 'items', 'switches', 'allowedCommands', 'solution', 'maxCommands']) delete p1[k];
  Object.assign(p1, JSON.parse(JSON.stringify(board)));
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
const cleanP1 = (r) => !/スイッチの必須性|トグルの意味|盤面の妥当性|ゴール到達可能性/.test(r.out);

test('validate-lessons: 合格盤: toggleが意味を持つ（最短8手 > open置換6手）', () => {
  const r = validate(BOARDS['pass-toggle-meaningful']);
  assert.equal(cleanP1(r), true, r.out);
});

test('validate-lessons: 合格盤: initial:open の混在・奥で踏んで戻る（最短12手 > open置換10手）', () => {
  const r = validate(BOARDS['pass-toggle-mixed']);
  assert.equal(cleanP1(r), true, r.out);
});

test('validate-lessons: NG検出: トグルの意味（最短4手 = open置換4手）', () => {
  const r = validate(BOARDS['fail-toggle-meaningless']);
  assert.equal(ng(r, 'トグルの意味'), true, r.out);
  assert.equal(r.out.includes('スイッチの必須性'), false, '踏まなくてもは届かない（必須性では落ちない）');
});

test('validate-lessons: toggleとcloseの併用は mode では落ちない（#530）。対象の共有は落ちる', () => {
  const r = validate(BOARDS['fail-toggle-mixed']);
  assert.equal(r.out.includes('他のmode（open・close）と併用できない'), false, r.out);
  assert.equal(ng(r, '対象を共有できない'), true, r.out); // この盤は同じマス(3,1)を共有している
});

test('validate-lessons: NG検出: 全部open（踏まずに届く）', () => {
  const r = validate(BOARDS['fail-toggle-all-open']);
  assert.equal(ng(r, 'スイッチの必須性'), true, r.out);
});

test('validate-lessons: NG検出: 踏まずに出口へ行ける混在盤（アイテムなし）はトグルの意味で落ちる', () => {
  const r = validate(BOARDS['fail-toggle-mixed-meaningless']);
  assert.equal(ng(r, 'トグルの意味'), true, r.out);
});
