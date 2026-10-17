// validate-lessons: ワープ(warps)の検査（形式・範囲・pair・重なり・併用禁止・単数形warp・必須性・手数）(Issue #64 段3)。
// リポジトリ直下で実行すること。盤は review/design/64/boards の ok-*/ng-* と同じ内容をここに持つ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = JSON.parse(readFileSync('lessons/paint-01-nuru.json', 'utf-8'));
const CMDS = ['up', 'down', 'left', 'right'];
const wallCol = (x, rows) => Array.from({ length: rows }, (_, y) => ({ x, y }));

// ok-5x5：x=2 の列が全部壁。穴 (1,2)-(3,2)。最短4手。
const ok5 = () => ({
  stepId: 'p1', kind: 'play', text: 'ワープで むこうへ', grid: { cols: 5, rows: 5 },
  start: { x: 0, y: 0 }, goal: { x: 4, y: 2 }, walls: wallCol(2, 5), allowedCommands: CMDS,
  solution: ['down', 'down', 'right', 'right'], maxCommands: 4,
  warps: [{ x: 1, y: 2, pair: 1 }, { x: 3, y: 2, pair: 1 }],
});
// ok-6x6：x=3 の列が全部壁＋(5,4)。pair1 (1,3)-(4,2)、pair2 (1,0)-(5,5)（罠）。最短6手。
const ok6 = () => ({
  stepId: 'p1', kind: 'play', text: 'ワープで むこうへ', grid: { cols: 6, rows: 6 },
  start: { x: 0, y: 0 }, goal: { x: 5, y: 1 }, walls: [...wallCol(3, 6), { x: 5, y: 4 }], allowedCommands: CMDS,
  solution: ['down', 'down', 'down', 'right', 'up', 'right'], maxCommands: 6,
  warps: [{ x: 1, y: 3, pair: 1 }, { x: 4, y: 2, pair: 1 }, { x: 1, y: 0, pair: 2 }, { x: 5, y: 5, pair: 2 }],
});

// 3つのプレイステージを同じ盤にしたレッスンを作って validate-lessons に通す（難易度は非減少）。
function validate(make, mutate = () => {}) {
  const lesson = JSON.parse(JSON.stringify(base));
  lesson.steps = lesson.steps.map((s) => {
    if (s.kind !== 'play') return s;
    const b = make();
    b.stepId = s.stepId;
    if (s.stepId === 'p1') mutate(b);
    return b;
  });
  const dir = mkdtempSync(path.join(tmpdir(), 'vw-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'donguri', title: 'どんぐり', lessonIds: [lesson.lessonId] }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

const ng = (r, text) => r.code === 1 && r.out.includes(text);

test('validate-lessons: warps付きの合格盤（5x5・6x6）が全検査を通る', () => {
  for (const make of [ok5, ok6]) {
    const r = validate(make);
    assert.equal(r.code, 0, r.out);
  }
});

test('validate-lessons: ワープの不合格盤（boards/ng-*.json 6枚）がNG', () => {
  const cases = [
    ['ng-pair-single', (p) => { p.warps = [{ x: 1, y: 2, pair: 1 }]; }, 'ちょうど2個'],
    ['ng-pair-triple', (p) => { p.warps.push({ x: 3, y: 4, pair: 1 }); }, 'ちょうど2個'],
    ['ng-on-wall', (p) => { p.warps[1] = { x: 2, y: 2, pair: 1 }; }, '壁と重なる'],
    ['ng-on-goal', (p) => { p.warps[1] = { x: 4, y: 2, pair: 1 }; }, 'goalと重なる'],
    ['ng-reachable-without-warp', (p) => { p.walls = wallCol(2, 4); p.maxCommands = 10; }, 'ワープの必須性'],
    ['ng-maxcommands-short', (p) => { p.maxCommands = 3; }, 'ゴール到達可能性'],
  ];
  for (const [name, mutate, text] of cases) {
    const r = validate(ok5, mutate);
    assert.ok(ng(r, text), `${name}: ${r.out}`);
  }
});

test('validate-lessons: ワープの追加の不合格盤（盤外・重複・start上・他ギミック上・併用・pair不正・単数形）', () => {
  const cases = [
    ['盤外x', (p) => { p.warps[1] = { x: 5, y: 2, pair: 1 }; }, '盤外'],
    ['盤外y', (p) => { p.warps[1] = { x: 3, y: 5, pair: 1 }; }, '盤外'],
    ['負の座標', (p) => { p.warps[1] = { x: -1, y: 2, pair: 1 }; }, '盤外'],
    ['整数でない', (p) => { p.warps[1] = { x: 1.5, y: 2, pair: 1 }; }, '整数でない'],
    ['同マス重複', (p) => { p.warps[1] = { x: 1, y: 2, pair: 1 }; }, '同じマス'],
    ['start上', (p) => { p.warps[0] = { x: 0, y: 0, pair: 1 }; }, 'startと重なる'],
    ['items上', (p) => { p.items = [{ x: 1, y: 2 }]; }, 'itemsと重なる'],
    ['keys上', (p) => { p.keys = [{ x: 3, y: 2, color: 'red' }]; }, 'keysと重なる'],
    ['ice併用', (p) => { p.ice = [{ x: 0, y: 3 }]; }, 'iceと併用できない'],
    ['paint併用', (p) => { p.paint = [{ x: 0, y: 0 }]; }, 'paintと併用できない'],
    ['periodic併用', (p) => { p.periodic = [{ x: 0, y: 3, period: 2, open: 1 }]; }, 'periodicと併用できない'],
    ['pair=0', (p) => { p.warps = p.warps.map((w) => ({ ...w, pair: 0 })); }, 'pair=0'],
    ['pair=3', (p) => { p.warps = p.warps.map((w) => ({ ...w, pair: 3 })); }, 'pair=3'],
    ['pair=文字列', (p) => { p.warps = p.warps.map((w) => ({ ...w, pair: '1' })); }, 'pair="1"'],
    ['pair省略', (p) => { p.warps = p.warps.map(({ x, y }) => ({ x, y })); }, '1か2でない'],
    ['単数形warp', (p) => { p.warp = p.warps; delete p.warps; }, 'warp は廃止'],
    ['warpsが配列でない', (p) => { p.warps = { x: 1, y: 2, pair: 1 }; }, '配列でない'],
  ];
  for (const [name, mutate, text] of cases) {
    const r = validate(ok5, mutate);
    assert.ok(ng(r, text), `${name}: ${r.out}`);
  }
});

test('validate-lessons: 2組の合格盤は通り、pair2の穴が1個だけの盤はNG', () => {
  assert.equal(validate(ok6).code, 0);
  const r = validate(ok6, (p) => { p.warps = p.warps.filter((w) => w.pair === 2).slice(0, 1); });
  assert.ok(ng(r, 'ちょうど2個'), r.out);
});
