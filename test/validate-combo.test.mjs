// #529 段1: ギミックの併用制限の緩和（検査 checkBoard と必須性 must-matter）。盤は review/design/529-530/boards の ok-*/ng-* と同じ内容。
// 実行: npm run test:unit。併用盤は checkBoard（盤面の妥当性）が通ること、重なり・periodic×repeatBox は引き続き不合格であることを固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBoard } from '../tools/validate-lessons.mjs';
import { analyzeSpec } from '../tools/editor/validate-worker.mjs';
import { paintMustMatter, keysMustMatter } from '../tools/lib/must-matter.mjs';
import { shortestSteps, shortestChips, boardSpec } from '../js/engine-grid.js';

const CMDS = ['up', 'down', 'left', 'right'];
const wallCol = (x, rows) => Array.from({ length: rows }, (_, y) => ({ x, y }));
const cells = (...xy) => xy.map(([x, y]) => ({ x, y }));
const check = (board) => {
  const messages = [];
  checkBoard({ allowedCommands: CMDS, ...board }, (rule, detail) => messages.push(`${rule}: ${detail}`), '');
  return messages;
};
const passes = (board) => assert.deepEqual(check(board), []);
const rejects = (board, text) => {
  const m = check(board);
  assert.ok(m.some((x) => x.includes(text)), `${text}: ${JSON.stringify(m)}`);
};

// 6×3、x=3 が全壁、ワープ (1,0)↔(4,0)。ワープ系の盤の土台。
const WARP = { grid: { cols: 6, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 5, y: 1 }, walls: wallCol(3, 3), warps: [{ x: 1, y: 0, pair: 1 }, { x: 4, y: 0, pair: 1 }] };
const GRID3 = { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [] };
const LINE_PAINT = cells([0, 0], [1, 0], [2, 0]);
// 3×3 の迂回ぬり：down,right,up,right の4手で塗り切る（直進2手では塗れない＝ぬりが必須）。
const DETOUR_PAINT = cells([0, 0], [0, 1], [1, 1], [1, 0], [2, 0]);

test('併用を外した盤は checkBoard を通る（warps×ice・periodic・paint、paint×repeatBox・groupRepeats、periodic×groupRepeats）', () => {
  passes({ ...WARP, maxCommands: 4, ice: cells([2, 2]) });
  passes({ ...WARP, maxCommands: 4, periodic: [{ x: 2, y: 2, period: 2 }] });
  passes({ ...WARP, maxCommands: 5, paint: cells([0, 1], [0, 0], [1, 0], [4, 0], [5, 0], [5, 1]) });
  passes({ ...GRID3, maxCommands: 4, paint: LINE_PAINT, repeatBox: true });
  passes({ ...GRID3, maxCommands: 4, paint: LINE_PAINT, groupRepeats: true });
  passes({ ...GRID3, goal: { x: 2, y: 2 }, maxCommands: 6, periodic: [{ x: 1, y: 1, period: 2 }], groupRepeats: true });
});

test('同じマスの重なりは不合格（ワープ×氷・ワープ×周期ドア・ぬりの目標×氷）、periodic×repeatBox は不合格のまま', () => {
  rejects({ ...WARP, maxCommands: 8, ice: cells([1, 0]) }, 'warps[0] がiceと重なる');
  rejects({ ...WARP, maxCommands: 4, periodic: [{ x: 1, y: 0, period: 2 }] }, 'warps[0] がperiodicと重なる');
  rejects({ ...WARP, maxCommands: 4, periodic: [{ x: 1, y: 0, period: 2 }] }, 'periodic[0] がwarpsと重なる');
  rejects({ ...GRID3, maxCommands: 4, paint: LINE_PAINT, ice: cells([1, 0]) }, 'paint[1] が氷と重なる');
  rejects({ ...GRID3, goal: { x: 2, y: 2 }, maxCommands: 6, periodic: [{ x: 1, y: 1, period: 2 }], repeatBox: true }, 'periodic は repeatBox と併用できない');
});

test('paint×ice・cushion・switches・items・keys・doors・periodic の併用盤も checkBoard を通る（重ならない配置）', () => {
  const base = { ...GRID3, maxCommands: 4, paint: DETOUR_PAINT };
  passes({ ...base, ice: cells([2, 2]) });
  passes({ ...base, cushion: cells([2, 2]) });
  passes({ ...base, switches: [{ x: 0, y: 2, targets: cells([2, 2]) }] });
  passes({ ...base, items: cells([1, 2]), keys: [{ x: 0, y: 2, color: 'red' }], doors: [{ x: 2, y: 1, color: 'red' }], periodic: [{ x: 2, y: 2, period: 2 }] });
});

test('必須性：ぬりの目標が最短経路より大きければ必須（迂回が要る）、直線の目標は飾り（不合格盤）', () => {
  assert.deepEqual(paintMustMatter({ ...GRID3, maxCommands: 4, paint: DETOUR_PAINT }, 4), { matters: true, dist: 2 });
  assert.deepEqual(paintMustMatter({ ...GRID3, maxCommands: 2, paint: LINE_PAINT }, 2), { matters: false, dist: 2 });
});

test('必須性：groupRepeats の盤ではチップ数で比べる（歩数で比べると直線のぬりが必須と誤判定される）', () => {
  const line = { ...GRID3, maxCommands: 4, paint: LINE_PAINT, groupRepeats: true };
  assert.equal(shortestSteps(boardSpec(line)), 2);
  assert.equal(shortestChips(boardSpec(line)), 1);
  assert.deepEqual(paintMustMatter(line, 1), { matters: false, dist: 1 });
  const detour = { ...GRID3, maxCommands: 4, paint: DETOUR_PAINT, groupRepeats: true };
  const dist = shortestChips(boardSpec(detour));
  assert.deepEqual(paintMustMatter(detour, dist), { matters: true, dist: 1 });
});

test('必須性：ドアを壁にして外した盤では、壁化したマスをぬりの目標から除いて再判定する（偽の合格を防ぐ）', () => {
  // 3×3。かぎ(0,1)・ドア(1,0)。ぬりの目標=ドアのマスを含む6マス。ドアを通る5手と、ドアを通らない迂回5手のどちらも目標を塗り切る。
  const bypass = {
    ...GRID3, goal: { x: 2, y: 1 }, maxCommands: 5,
    keys: [{ x: 0, y: 1, color: 'red' }], doors: [{ x: 1, y: 0, color: 'red' }],
    paint: cells([0, 0], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1]),
  };
  // 除かないと：ドアのマスが塗れず外した盤が解けない＝かぎが必須と誤判定（偽の合格）。除くと：迂回で解けるので、かぎは飾り。
  const real = keysMustMatter(bypass);
  assert.equal(real.matters, false);
  assert.equal(real.dist, 5);
  // 除いても必須のまま：ドアしか通り道が無い盤（x=1,y=1 が壁）。外した盤は目標を除いても解けない。
  const only = {
    grid: { cols: 3, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: cells([1, 1]), maxCommands: 4,
    keys: [{ x: 0, y: 1, color: 'red' }], doors: [{ x: 1, y: 0, color: 'red' }],
    paint: cells([0, 0], [0, 1], [1, 0], [2, 0]),
  };
  const must = keysMustMatter(only);
  assert.equal(must.matters, true);
  assert.equal(must.dist, Infinity);
});

test('analyzeSpec：併用盤（ぬり4×4＋かぎ・どんぐり・周期ドア）は検査を通り、ぬりは必須（10秒以内）', () => {
  const all = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) all.push({ x, y });
  const t = Date.now();
  const r = analyzeSpec({
    ...GRID3, grid: { cols: 4, rows: 4 }, goal: { x: 0, y: 3 }, maxCommands: 15, paint: all,
    keys: [{ x: 1, y: 0, color: 'red' }], doors: [{ x: 2, y: 1, color: 'red' }],
    items: cells([2, 0], [1, 3], [3, 1]), periodic: [{ x: 3, y: 2, period: 4 }],
  });
  assert.ok(Date.now() - t < 10000);
  assert.equal(r.clearable, true);
  assert.equal(r.shortest, 15);
  assert.equal(r.matters.paint, true);
  assert.ok(!r.messages.some((m) => m.includes('併用') || m.includes('盤面の妥当性')), JSON.stringify(r.messages));
});
