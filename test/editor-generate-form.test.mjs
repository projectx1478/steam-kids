// #401 段2: たたき台フォームの送信前検査・本文の組み立て・状態文言（純関数）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGenerateForm, buildGenerateBody, generateStatusText, GEN_COUNT } from '../tools/editor/editor-view.js';
import { checkGenerateInput } from '../tools/editor/serve.mjs';

const form = () => ({
  cols: { min: 4, max: 5 }, rows: { min: 4, max: 5 }, walls: { min: 1, max: 3 },
  shortestPath: { min: 3, max: 8 }, minTurns: 0, seed: 1, teach: 'items',
  gimmicks: { items: { on: true, min: 1, max: 2 }, ice: { on: false, min: 1, max: 1 }, keys: { on: false, min: 1, max: 1 } },
});

test('checkGenerateForm: 既定のフォームは通る', () => {
  assert.deepEqual(checkGenerateForm(form()), []);
});

test('checkGenerateForm: 範囲外・NaN・teach 不一致・オフのギミックは検査しない', () => {
  const bad = (mut) => { const f = form(); mut(f); return checkGenerateForm(f).length; };
  assert.ok(bad((f) => { f.cols.min = 2; }) > 0);
  assert.ok(bad((f) => { f.rows.max = 21; }) > 0);
  assert.ok(bad((f) => { f.cols = { min: 5, max: 4 }; }) > 0);
  assert.ok(bad((f) => { f.walls.max = 61; }) > 0);
  assert.ok(bad((f) => { f.shortestPath.max = 61; }) > 0);
  assert.ok(bad((f) => { f.minTurns = 9; }) > 0);
  assert.ok(bad((f) => { f.seed = -1; }) > 0);
  assert.ok(bad((f) => { f.seed = NaN; }) > 0);
  assert.ok(bad((f) => { f.gimmicks.items.max = 5; }) > 0);
  assert.ok(bad((f) => { f.teach = 'ice'; }) > 0);
  assert.equal(bad((f) => { f.gimmicks.keys.max = 99; }), 0);
  assert.equal(bad((f) => { f.gimmicks.items.on = false; f.teach = ''; }), 0);
});

test('buildGenerateBody: サーバーの入力検査を通る（ギミックあり・なし）', () => {
  const a = buildGenerateBody(form(), 7);
  assert.equal(a.count, GEN_COUNT);
  assert.equal(a.seed, 7);
  assert.deepEqual(checkGenerateInput(a), []);
  const f = form();
  f.gimmicks.items.on = false;
  const b = buildGenerateBody(f, 1);
  assert.ok(!('gimmicks' in b.stageGen) && !('teach' in b.stageGen));
  assert.deepEqual(checkGenerateInput(b), []);
});

test('generateStatusText: 文言', () => {
  assert.equal(generateStatusText('running'), 'つくっています…');
  assert.equal(generateStatusText('empty'), '条件に合う盤が出なかった。範囲を広げる');
  assert.equal(generateStatusText('aborted'), '重すぎて途中で止めた。大きさかギミックを減らす');
  assert.equal(generateStatusText('ok'), '');
});

test('ワープ（#492）: 単独なら通り、サーバーの入力検査も通る。ほかのギミックとの併用・範囲外は通さない', () => {
  const f = form();
  f.gimmicks.items.on = false;
  f.gimmicks.warps = { on: true, min: 1, max: 2 };
  f.teach = 'warps';
  assert.deepEqual(checkGenerateForm(f), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(f, 1)), []);
  const both = form();
  both.gimmicks.warps = { on: true, min: 1, max: 1 };
  both.teach = 'warps';
  assert.ok(checkGenerateForm(both).length > 0);
  const over = form();
  over.gimmicks.items.on = false;
  over.gimmicks.warps = { on: true, min: 1, max: 3 };
  over.teach = 'warps';
  assert.ok(checkGenerateForm(over).length > 0);
});

test('周期ドア（#496）: 単独なら通り、サーバーの入力検査も通る。併用・範囲外は通さない', () => {
  const f = form();
  f.gimmicks.items.on = false;
  f.gimmicks.periodic = { on: true, min: 1, max: 2 };
  f.teach = 'periodic';
  assert.deepEqual(checkGenerateForm(f), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(f, 1)), []);
  const both = form();
  both.gimmicks.periodic = { on: true, min: 1, max: 1 };
  both.teach = 'periodic';
  assert.ok(checkGenerateForm(both).length > 0);
  const over = form();
  over.gimmicks.items.on = false;
  over.gimmicks.periodic = { on: true, min: 1, max: 3 };
  over.teach = 'periodic';
  assert.ok(checkGenerateForm(over).length > 0);
});

test('色ぬり（#495）: 単独なら通り、サーバーの入力検査も通る。併用・範囲外は通さない', () => {
  const f = form();
  f.gimmicks.items.on = false;
  f.gimmicks.paint = { on: true, min: 4, max: 8 };
  f.teach = 'paint';
  assert.deepEqual(checkGenerateForm(f), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(f, 1)), []);
  const both = form();
  both.gimmicks.paint = { on: true, min: 4, max: 4 };
  both.teach = 'paint';
  assert.ok(checkGenerateForm(both).length > 0);
  const over = form();
  over.gimmicks.items.on = false;
  over.gimmicks.paint = { on: true, min: 3, max: 8 };
  over.teach = 'paint';
  assert.ok(checkGenerateForm(over).length > 0);
});

test('水（#494）: 単独なら通り、サーバーの入力検査も通る。併用・範囲外は通さない', () => {
  const f = form();
  f.gimmicks.items.on = false;
  f.gimmicks.water = { on: true, min: 2, max: 8 };
  f.teach = 'water';
  assert.deepEqual(checkGenerateForm(f), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(f, 1)), []);
  const both = form();
  both.gimmicks.water = { on: true, min: 2, max: 4 };
  both.teach = 'water';
  assert.ok(checkGenerateForm(both).length > 0);
  const over = form();
  over.gimmicks.items.on = false;
  over.gimmicks.water = { on: true, min: 1, max: 8 };
  over.teach = 'water';
  assert.ok(checkGenerateForm(over).length > 0);
});

test('クッション・スイッチ（#492）: 単独で通り、サーバーの入力検査も通る。併用の禁止を送信前に止める', () => {
  const sw = form();
  sw.gimmicks.items.on = false;
  sw.gimmicks.switches = { on: true, min: 1, max: 2 };
  sw.teach = 'switches';
  assert.deepEqual(checkGenerateForm(sw), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(sw, 1)), []);
  const swKey = structuredClone(sw);
  swKey.gimmicks.keys.on = true;
  assert.ok(checkGenerateForm(swKey).length > 0);
  const cu = form();
  cu.gimmicks.ice.on = true;
  cu.gimmicks.cushion = { on: true, min: 1, max: 1 };
  cu.teach = 'cushion';
  assert.deepEqual(checkGenerateForm(cu), []);
  assert.deepEqual(checkGenerateInput(buildGenerateBody(cu, 1)), []);
  cu.gimmicks.ice.on = false;
  assert.ok(checkGenerateForm(cu).length > 0);
});
