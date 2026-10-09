// stagegen-validate: stageGen・gen の検査の合格・不合格例（Issue #337 段3）。入力は test/fixtures/stagegen-cases.json。
// 不合格の例は expectError の検査名「だけ」で落ちること。リポジトリ直下で実行すること。
// STAGEGEN_GATE_OUT にファイル名を渡すと、全例の合否一覧をそのファイルに書く（gate-validate.txt の取り直し用）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { shortestPath } from '../js/engine-grid.js';
import { validateLesson } from '../tools/validate-lessons.mjs';

const fx = JSON.parse(readFileSync('test/fixtures/stagegen-cases.json', 'utf-8'));
const load = (id) => JSON.parse(readFileSync(`lessons/${id}.json`, 'utf-8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const withoutNotes = (board) => Object.fromEntries(Object.entries(board).filter(([k]) => !k.startsWith('_')));

// 盤を置き換えたステップ（stepId と gen 以外は盤のもの。solution は最短の1本）
function boardStep(stepId, board, gen) {
  const b = clone(withoutNotes(board));
  return { stepId, ...b, solution: shortestPath(b), gen };
}

function buildLesson(c) {
  const id = c.baseLesson ?? 'donguri-01-hirou';
  const data = load(id);
  const long = c.baseLongTrial ?? fx.baseLongTrial;
  if (!c.baseLesson) data.estimatedMinutes = long ? 8 : 5;
  data.stageGen = { ...clone(fx.baseStageGen), ...clone(c.patch ?? {}) };
  if (c.removeStageGen) delete data.stageGen;
  for (const [stepId, sp] of Object.entries(c.stepPatch ?? {})) {
    const i = data.steps.findIndex((s) => s.stepId === stepId);
    data.steps[i] = sp.useKeepGenBoard ? boardStep(stepId, fx.keepGenBoard, sp.gen) : { ...data.steps[i], ...sp };
  }
  if (c.addStep) {
    const a = c.addStep;
    const step = a.useGenBoard ? boardStep(a.stepId, fx.genBoard, a.gen) : clone(a);
    const lastPlay = data.steps.map((s) => s.kind).lastIndexOf('play');
    data.steps.splice(lastPlay + 1, 0, step);
  }
  return { id, data, longTrialIds: long ? ['donguri-01-hirou'] : [] };
}

// 検査名の一覧（"<file>: <検査名>: <詳細>" の検査名の部分）
const rulesOf = (id, errors) => [...new Set(errors.map((e) => e.slice(`${id}.json: `.length).split(': ')[0]))];

const results = [];
for (const c of fx.cases) {
  test(`stagegen-validate: ${c.name}`, () => {
    const { id, data, longTrialIds } = buildLesson(c);
    const errors = validateLesson(`${id}.json`, data, longTrialIds);
    const rules = rulesOf(id, errors);
    const ok = c.expect === 'pass' ? errors.length === 0 : rules.length === 1 && rules[0] === c.expectError;
    results.push(`${ok ? 'OK ' : 'NG '} ${c.name}  想定=${c.expect === 'pass' ? '合格' : `不合格(${c.expectError})`}  実際=${errors.length === 0 ? '合格' : `不合格(${rules.join('・')})`}`);
    if (c.expect === 'pass') assert.deepEqual(errors, [], `${c.name}: 合格するはずが落ちた`);
    else assert.deepEqual(rules, [c.expectError], `${c.name}: expectError の検査名だけで落ちる必要がある\n${errors.join('\n')}`);
  });
}

after(() => {
  if (process.env.STAGEGEN_GATE_OUT) writeFileSync(process.env.STAGEGEN_GATE_OUT, `${results.join('\n')}\n`, 'utf-8');
});
