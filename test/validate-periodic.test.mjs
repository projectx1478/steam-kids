// validate-lessons: 周期ドア(periodic)の検証（形・重なり・paint併用禁止・必須性・repeatBox/groupRepeats禁止）(Issue #310)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/paint-01-nuru.json', 'utf-8'));

// p1を周期ドア盤へ差し替える：4×2の廊下。(1,0)に周期3・開[1,2]のドア。まっすぐ(right)は手番0で閉なので
// 脇のマス(0,1)へ寄り道（down,up）して手番を2へずらす。最短5手、ドア無視なら3手。
const corridor = (p) => {
  delete p.paint;
  p.grid = { cols: 4, rows: 2 };
  p.start = { x: 0, y: 0 };
  p.goal = { x: 3, y: 0 };
  p.walls = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
  p.periodic = [{ x: 1, y: 0, period: 3, open: [1, 2] }];
  p.solution = ['down', 'up', 'right', 'right', 'right'];
  p.maxCommands = 5;
};

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  const p1 = lesson.steps.find((s) => s.stepId === 'p1');
  corridor(p1);
  mutate(p1);
  const dir = mkdtempSync(path.join(tmpdir(), 'vpd-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'donguri', title: 'どんぐり', lessonIds: [lesson.lessonId] }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

const ng = (r, text) => r.code === 1 && r.out.includes(text);

test('validate-lessons: 閉の手番で寄り道が要る周期ドア盤は検証を通る', () => {
  const r = validate(() => {});
  assert.equal(r.code, 0, r.out);
});

test('validate-lessons: periodicの形（period 2〜4・openは相異なる整数で空でなく全手番でもない）', () => {
  const door = (extra) => (p) => { p.periodic = [{ x: 1, y: 0, period: 3, open: [1, 2], ...extra }]; };
  assert.ok(ng(validate(door({ period: 1, open: [0] })), '2〜4の整数でない'));
  assert.ok(ng(validate(door({ period: 5, open: [0] })), '2〜4の整数でない'));
  assert.ok(ng(validate(door({ period: 2.5 })), '2〜4の整数でない'));
  assert.ok(ng(validate(door({ open: [] })), 'openが空'));
  assert.ok(ng(validate(door({ open: [1, 1] })), '相異なる整数でない'));
  assert.ok(ng(validate(door({ open: [3] })), '相異なる整数でない'));
  assert.ok(ng(validate(door({ open: [-1, 1] })), '相異なる整数でない'));
  assert.ok(ng(validate(door({ open: [0.5] })), '相異なる整数でない'));
  assert.ok(ng(validate(door({ open: [0, 1, 2] })), '全手番を含む'));
  assert.ok(ng(validate((p) => { p.periodic = []; }), 'periodic が空'));
  assert.ok(ng(validate((p) => { p.periodic = {}; }), 'periodic が空、または配列でない'));
});

test('validate-lessons: periodicは他の要素・周期ドア同士・盤外と重ならない', () => {
  const at = (x, y) => (p) => { p.periodic = [{ x, y, period: 3, open: [1, 2] }]; };
  assert.ok(ng(validate((p) => { p.walls = [...p.walls, { x: 1, y: 0 }]; }), 'periodic[0] が壁と重なる'));
  assert.ok(ng(validate(at(0, 0)), 'startと重なる'));
  assert.ok(ng(validate(at(3, 0)), 'goalと重なる'));
  const withField = (field, value) => (p) => { at(1, 0)(p); p[field] = value; };
  assert.ok(ng(validate(withField('items', [{ x: 1, y: 0 }])), 'itemsと重なる'));
  assert.ok(ng(validate(withField('ice', [{ x: 1, y: 0 }])), 'iceと重なる'));
  assert.ok(ng(validate(withField('cushion', [{ x: 1, y: 0 }])), 'cushionと重なる'));
  assert.ok(ng(validate(withField('keys', [{ x: 1, y: 0, color: 'red' }])), 'keysと重なる'));
  assert.ok(ng(validate(withField('doors', [{ x: 1, y: 0, color: 'red' }])), 'doorsと重なる'));
  assert.ok(ng(validate(withField('switches', [{ x: 1, y: 0, targets: [{ x: 1, y: 1 }] }])), 'switchesと重なる'));
  assert.ok(ng(validate(withField('switches', [{ x: 0, y: 1, targets: [{ x: 1, y: 0 }] }])), 'switchesのtargetsと重なる'));
  assert.ok(ng(validate((p) => { p.periodic = [...p.periodic, { ...p.periodic[0] }]; }), '座標重複'));
  assert.ok(ng(validate(at(9, 9)), '盤外'));
});

test('validate-lessons: periodicはpaint・repeatBox・groupRepeatsと併用できない', () => {
  assert.ok(ng(validate((p) => { p.paint = [{ x: 0, y: 0 }, { x: 3, y: 0 }]; }), 'periodic は paint と併用できない'));
  assert.ok(ng(validate((p) => { p.repeatBox = true; }), 'repeatBox・groupRepeats と併用できない'));
  assert.ok(ng(validate((p) => { p.groupRepeats = true; }), 'repeatBox・groupRepeats と併用できない'));
  // paint側の列挙にもperiodicがある（paintの検証でも検出される）。
  assert.ok(ng(validate((p) => { p.paint = [{ x: 0, y: 0 }, { x: 3, y: 0 }]; }), 'paint はperiodicと併用できない'));
});

test('validate-lessons: 周期ドアの必須性（常に開とみなした最短より長くなければ不合格）', () => {
  // 手番0で開くドア：まっすぐ3手で通れる＝ドアが飾り。
  const free = (p) => {
    p.periodic = [{ x: 1, y: 0, period: 3, open: [0] }];
    p.solution = ['right', 'right', 'right'];
    p.maxCommands = 3;
  };
  assert.ok(ng(validate(free), '周期ドアの必須性'));
  // 寄り道のいらない向き（開の手番が最初の1手）でも同じ比較で検出される。
  assert.ok(ng(validate((p) => { free(p); p.periodic[0].open = [0, 2]; }), '周期ドアの必須性'));
  // 手数が足りない盤は従来どおりゴール到達可能性で落ちる。
  assert.ok(ng(validate((p) => { p.maxCommands = 4; }), 'ゴール到達可能性'));
});
