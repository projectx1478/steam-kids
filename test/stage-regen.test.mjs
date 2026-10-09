// stage-regen: gen を持つ play ステップを stageGen と seed から再生成して、固定盤と一致することを確かめる（Issue #337 段3）。
// 生成器を直して出力が変わるときは GEN_VERSION と stageGen.ver を上げて書き直す。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { generateBoard, GEN_VERSION } from '../tools/gen/stage-gen.mjs';
import { boardToStep, collectCandidates, pickStages, MAX_SEEDS } from '../tools/gen-stages.mjs';

// 書き込む形の比較用（ギミックの無いフィールドは省略されているので、無い＝空として揃える）
const norm = (s) => ({
  grid: s.grid, start: s.start, goal: s.goal, walls: s.walls, items: s.items ?? [], ice: s.ice ?? [],
  keys: s.keys ?? [], doors: s.doors ?? [], allowedCommands: s.allowedCommands, solution: s.solution, maxCommands: s.maxCommands,
});

// lessons/*.json の全 gen 付きステップを再生成して照合（PR1 では対象 0 件）
test('stage-regen: gen を持つ全ステップが同じ seed から同じ盤に再生成される', () => {
  for (const f of readdirSync('lessons').filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const data = JSON.parse(readFileSync(`lessons/${f}`, 'utf-8'));
    for (const step of data.steps.filter((s) => s.gen)) {
      const tag = `${f} ${step.stepId}`;
      assert.equal(data.stageGen.ver, GEN_VERSION, `${tag}: stageGen.ver が生成器の版と違う`);
      const board = generateBoard(data.stageGen, step.gen.seed);
      assert.ok(board, `${tag}: seed=${step.gen.seed} から盤を生成できない`);
      assert.deepEqual(norm(boardToStep(board, step.stepId, step.gen)), norm(step), `${tag}: 再生成した盤が固定盤と違う`);
    }
  }
});

const stageGen = {
  ver: 1,
  stages: 8,
  keepHandwritten: ['p1'],
  grid: { cols: { min: 4, max: 6 }, rows: { min: 4, max: 6 } },
  walls: { min: 2, max: 6 },
  gimmicks: { items: { min: 1, max: 3 } },
  teach: 'items',
  shortestPath: { min: 4, max: 12 },
  minTurns: 1,
  seedBase: 1,
};

// 固定例：この stageGen と seed=94 から、必ずこの盤ができる（生成器が変わったら落ちる）
test('stage-regen: 固定例（seed=94）は固定の盤に再生成される', () => {
  const step = boardToStep(generateBoard(stageGen, 94), 'p2', { seed: 94, ver: 1 });
  assert.deepEqual(step, {
    stepId: 'p2',
    kind: 'play',
    grid: { cols: 4, rows: 4 },
    start: { x: 1, y: 1 },
    goal: { x: 2, y: 0 },
    walls: [{ x: 3, y: 3 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 2 }, { x: 3, y: 1 }, { x: 0, y: 2 }],
    items: [{ x: 3, y: 0 }],
    allowedCommands: ['up', 'down', 'left', 'right'],
    solution: ['right', 'up', 'right', 'left'],
    maxCommands: 4,
    gen: { seed: 94, ver: 1 },
  });
});

const cands = collectCandidates(stageGen);

// 振り分け：7面。最短は非減少、4番目（全体の4番目）が一息面、盤は急に大きくならない。
test('stage-regen: 振り分けの条件（非減少・一息面・盤の大きさ・重複なし）', () => {
  const p1 = {
    grid: { cols: 3, rows: 3 }, start: { x: 0, y: 2 }, goal: { x: 2, y: 0 }, walls: [], items: [{ x: 1, y: 2 }],
    solution: ['right', 'right', 'up', 'up'],
  };
  const prev = { board: p1, steps: 4, turns: 1 };
  assert.ok(cands.length <= MAX_SEEDS);
  const r = pickStages(stageGen, prev, cands);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.faces.length, 7);
  let last = prev;
  r.faces.forEach((f, i) => {
    assert.ok(f.steps >= last.steps, `p${i + 2}: 最短が減っている`);
    assert.ok(f.board.grid.cols - last.board.grid.cols < 2 && f.board.grid.rows - last.board.grid.rows < 2, `p${i + 2}: 盤が急に大きい`);
    assert.equal(f.breath, i === 2, `p${i + 2}: 一息面の位置`);
    if (f.breath) assert.ok(f.steps === last.steps && f.turns < last.turns, '一息面は最短が同じで曲がり角が少ない');
    last = f;
  });
  assert.equal(new Set(r.faces.map((f) => f.seed)).size, 7);
});

test('stage-regen: 条件を満たせなければ失敗する（書き込まない）', () => {
  const r = pickStages({ ...stageGen, stages: 8 }, null, cands.slice(0, 3));
  assert.equal(r.ok, false);
});
