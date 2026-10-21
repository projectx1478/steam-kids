// 色連動スイッチ（Issue #392 段1）：expandGroupSwitches・boardSpec の展開・validate の検査 (a)〜(i)。
// 盤は test/fixtures/color-link/（review/design/392/boards の複製）。fail 盤は NG の理由が1つだけ、pass 盤は NG なし。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandGroupSwitches } from '../js/gimmicks/switches.js';
import { boardSpec, simulate, shortestSteps } from '../js/engine-grid.js';
import { checkBoard, checkSwitchMatters } from '../tools/validate-lessons.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/color-link/${name}.json`, import.meta.url), 'utf-8'));

function run(board) {
  const errors = [];
  const add = (cat, msg) => errors.push(`${cat}: ${msg}`);
  const groupNg = checkBoard(board, add, '');
  const boardErrors = errors.length;
  let dist = null;
  if (board.start && board.goal) dist = shortestSteps(boardSpec(board));
  if (!groupNg) checkSwitchMatters(board, dist, add, '');
  return { groupNg, errors, boardErrors };
}

test('expandGroupSwitches: group を同じ group の groupWalls のマスに展開し、group を外す', () => {
  const step = load('board-A-new');
  const out = expandGroupSwitches(step);
  assert.deepEqual(out.switches, [{ x: 1, y: 3, color: 'red', targets: [{ x: 3, y: 1 }, { x: 4, y: 3 }] }]);
  assert.equal('group' in out.switches[0], false);
  assert.equal(step.switches[0].group, 'A', '元の step は書き換えない');
});

test('expandGroupSwitches: 冪等', () => {
  const once = expandGroupSwitches(load('board-B-new'));
  assert.deepEqual(expandGroupSwitches(once), once);
  assert.equal(expandGroupSwitches(once), once, 'group が無ければ同じオブジェクト');
});

test('expandGroupSwitches: 既存 targets のスイッチ・switches 無しの step は不変', () => {
  const legacy = { grid: { cols: 3, rows: 1 }, switches: [{ x: 0, y: 0, targets: [{ x: 1, y: 0 }] }] };
  assert.equal(expandGroupSwitches(legacy), legacy);
  const plain = { grid: { cols: 3, rows: 1 } };
  assert.equal(expandGroupSwitches(plain), plain);
  assert.deepEqual(boardSpec(legacy).switches, legacy.switches);
});

test('expandGroupSwitches: targets を持つ group スイッチは targets を上書きしない（v-a-fail）', () => {
  const out = expandGroupSwitches(load('v-a-fail'));
  assert.deepEqual(out.switches[0].targets, [{ x: 1, y: 0 }]);
});

test('boardSpec: 展開後の盤で simulate・shortestSteps が動く（group の壁が全部同時に開く）', () => {
  const a = load('board-A-new');
  assert.equal(shortestSteps(boardSpec(a)), 9);
  const r = simulate(a.solution, boardSpec(a));
  assert.deepEqual([r.reachedGoal, r.blockedAt], [true, []]);
  assert.equal(shortestSteps(boardSpec(load('board-B-new'))), 10);
});

for (const k of 'abcdefghi') {
  test(`validate 検査(${k}): pass 盤は NG なし`, () => {
    const r = run(load(`v-${k}-pass`));
    assert.deepEqual(r.errors, []);
    assert.equal(r.groupNg, false);
  });
  // 検査(d)（group と close・toggle の併用禁止）は #530 で解除した。(d) の fail 盤は下の専用テストで扱う。
  if (k !== 'd') test(`validate 検査(${k}): fail 盤は (${k}) の NG（理由は1つ）`, () => {
    const r = run(load(`v-${k}-fail`));
    assert.equal(r.groupNg, true, JSON.stringify(r.errors));
    assert.equal(r.errors.length, k === 'h' ? 2 : 1, JSON.stringify(r.errors));
    // NG が出た盤では必須性・罠の意味の節を飛ばすので、その節の NG は混ざらない。
    assert.equal(r.errors.some((e) => /スイッチの必須性|スイッチの罠の意味|トグルの意味|スイッチ→かぎ/.test(e)), false, JSON.stringify(r.errors));
  });
}

test('validate 検査(d)（#530 で解除）: group と mode:close の併用は group の検査を通り、残る NG は罠の意味の1件だけ', () => {
  const r = run(load('v-d-fail'));
  assert.equal(r.groupNg, false, JSON.stringify(r.errors));
  assert.equal(r.boardErrors, 0, JSON.stringify(r.errors));
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  assert.match(r.errors[0], /スイッチの罠の意味/);
});

test('validate 検査(e): groupWalls が周期ドア・paint と重なると NG（理由は(e)の1件だけ）', () => {
  const r = run(load('v-e-periodic-fail'));
  assert.equal(r.groupNg, true, JSON.stringify(r.errors));
  assert.equal(r.errors.filter((e) => /groupWalls\[0\] が.*と重なる/.test(e)).length, 1, JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.includes('periodicと重なる')), JSON.stringify(r.errors));
  const p = load('v-e-periodic-fail');
  delete p.periodic;
  p.paint = [{ x: 2, y: 1 }];
  const rp = run(p);
  assert.ok(rp.errors.some((e) => e.includes('paintと重なる')), JSON.stringify(rp.errors));
});

test('validate: 必須性の節は展開後の盤を見る（group 盤 A・B は NG なし）', () => {
  for (const name of ['board-A-new', 'board-B-new']) {
    const r = run(load(name));
    assert.deepEqual(r.errors, [], name);
  }
});

test('validate: 必須性の節は group スイッチが飾りなら NG（スイッチ無しで届く盤）', () => {
  const b = load('v-a-pass');
  b.walls = [{ x: 2, y: 0 }];
  b.groupWalls = [{ x: 2, y: 2, group: 'A' }];
  const errors = [];
  checkSwitchMatters(b, shortestSteps(boardSpec(b)), (c, m) => errors.push(c + m), '');
  assert.ok(errors.some((e) => e.startsWith('スイッチの必須性')), JSON.stringify(errors));
});

test('validate: 既存 targets 方式の盤の検査結果は不変（group 検査は何も出さない）', () => {
  const legacy = {
    grid: { cols: 4, rows: 3 },
    start: { x: 0, y: 1 },
    goal: { x: 3, y: 1 },
    walls: [{ x: 2, y: 0 }, { x: 2, y: 2 }],
    switches: [{ x: 0, y: 2, targets: [{ x: 2, y: 1 }] }],
    allowedCommands: ['up', 'down', 'left', 'right'],
    maxCommands: 5,
  };
  const r = run(legacy);
  assert.deepEqual(r.errors, []);
  assert.equal(r.groupNg, false);
});
