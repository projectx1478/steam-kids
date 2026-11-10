// build-egg（たまごの みち）：エンジン純関数と validate（Issue #290 段1）。盤は test/fixtures/egg/（play.egg の形）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulate, solve, isSolved, ANGLES, MAX_STEPS, EGG_TEXT } from '../js/engine-egg.js';
import { checkEggFace, checkEggText, validateEgg } from '../tools/lib/validate/egg.mjs';
import { validateLesson } from '../tools/validate-lessons.mjs';

const DIR = 'test/fixtures/egg';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf-8'));
const names = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
const stages = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => load(`stage-${i}`));
const collect = () => { const errs = []; return [errs, (rule, detail) => errs.push({ rule, detail })]; };

test('定数：ANGLES は4つ・MAX_STEPS は600', () => {
  assert.deepEqual(ANGLES, ['/', '\\', '-', '|']);
  assert.equal(MAX_STEPS, 600);
});

test('EGG_TEXT：ひらがな・20字以内・否定語なし', () => {
  const [errs, add] = collect();
  checkEggText(add);
  assert.deepEqual(errs, []);
  assert.ok(Object.keys(EGG_TEXT).length >= 6);
});

test('合格盤 stage-1〜8：solution が再生で nest・全探索の minParts と一致', () => {
  const mins = [1, 1, 1, 1, 2, 2, 2, 3];
  stages.forEach((s, i) => {
    const e = s.egg;
    assert.equal(simulate(e, e.solution).result, 'nest', `面${i + 1}`);
    assert.ok(isSolved(e, e.solution));
    assert.equal(simulate(e, []).result !== 'nest', true);
    assert.equal(solve(e).minParts, mins[i], `面${i + 1}`);
  });
});

test('simulate：同じ入力は同じ結果（決定論）', () => {
  const e = stages[1].egg;
  assert.deepEqual(simulate(e, e.solution), simulate(e, e.solution));
});

test('solve：結果分布と別解（面7＝解27・最小解1、面8＝最小解3）', () => {
  const r7 = solve(stages[6].egg);
  assert.equal(r7.solutions, 27);
  assert.equal(r7.minSolutions, 1);
  assert.equal(r7.space, 15184);
  assert.deepEqual(r7.outcomes, { nest: 27, wrongNest: 121, fall: 2429, timeout: 12608 });
  const r8 = solve(stages[7].egg);
  assert.equal(r8.minSolutions, 3);
  assert.equal(r8.space, 15184);
});

test('solve：n=3 の面（7・8）の全探索は1面2秒以内', () => {
  for (const i of [6, 7]) assert.ok(solve(stages[i].egg).ms < 2000);
});

test('validate：合格盤8面が合格（minParts 非減少）', () => {
  let prev = 0;
  stages.forEach((s, i) => {
    const [errs, add] = collect();
    const info = checkEggFace(s, add, '', i + 1, prev);
    assert.deepEqual(errs, [], `面${i + 1}`);
    prev = info.minParts;
  });
});

test('validate：ng 盤8枚が期待の検査名で不合格', () => {
  const ngs = names.filter((n) => n.startsWith('ng-'));
  assert.equal(ngs.length, 8);
  for (const n of ngs) {
    const b = load(n);
    const [errs, add] = collect();
    checkEggFace(b, add, '', b.face, b.prevMinParts || 0);
    assert.ok(errs.some((e) => e.rule === b.expect), `${n}: 期待=${b.expect} 実際=${errs.map((e) => e.rule).join('|') || '合格'}`);
  }
});

test('validate：重複除きが範囲内でも places の重複は「placesの数」で落ちる（面2相当は重複除き8点）', () => {
  const b = load('ng-places-duplicate-face2');
  assert.equal(new Set(b.egg.places.map((p) => `${p.col},${p.row}`)).size, 8);
  const [errs, add] = collect();
  checkEggFace(b, add, '', b.face, 0);
  assert.deepEqual(errs.map((e) => e.rule), ['placesの数']);
});

test('validate：obstacles 省略は [] として受け、配列でない値は「eggの形」で落ちる', () => {
  const base = stages[0].egg; // 面1は obstacles が []
  const noObs = { ...base };
  delete noObs.obstacles;
  const [errs, add] = collect();
  checkEggFace({ egg: noObs }, add, '', 1, 0);
  assert.deepEqual(errs, []);
  assert.deepEqual(simulate(noObs, noObs.solution), simulate(base, base.solution));
  const [errs2, add2] = collect();
  checkEggFace({ egg: { ...base, obstacles: 'x' } }, add2, '', 1, 0);
  assert.ok(errs2.some((e) => e.rule === 'eggの形'));
});

test('validate：solution を1枚外すと失敗する（必須性。8面すべて）', () => {
  for (const s of stages) {
    const sol = s.egg.solution;
    sol.forEach((_, i) => assert.notEqual(simulate(s.egg, sol.filter((__, j) => j !== i)).result, 'nest'));
  }
});

test('validateEgg：8面そろったレッスンが通り、7面だと「盤面の必須」で落ちる', () => {
  const plays = stages.map((s, i) => ({ stepId: `p${i + 1}`, kind: 'play', egg: s.egg }));
  const [ok, addOk] = collect();
  validateEgg(plays, addOk, true);
  assert.deepEqual(ok, []);
  const [ng, addNg] = collect();
  validateEgg(plays.slice(0, 7), addNg, true);
  assert.ok(ng.some((e) => e.rule === '盤面の必須'));
  const [ng2, addNg2] = collect();
  validateEgg(plays, addNg2, false);
  assert.ok(ng2.some((e) => e.rule === '長尺試作'));
});

test('validateLesson：type "build-egg" の分岐に入る（8面で通る）', () => {
  const step = (kind, extra) => ({ stepId: kind, kind, ...extra });
  const data = {
    lessonId: 'egg-x', unitId: 'egg', title: 'たまごの みち', type: 'build-egg', estimatedMinutes: 8,
    steps: [step('intro', { text: 'たまごを すに とどけよう' }),
      ...stages.map((s, i) => ({ stepId: `p${i + 1}`, kind: 'play', text: 'たまごを すに いれよう', egg: s.egg })),
      step('summary', { text: 'たまごを すに とどけられたね' })],
  };
  assert.deepEqual(validateLesson('egg-x.json', data, ['egg-x']), []);
  const bad = { ...data, steps: data.steps.filter((s) => s.stepId !== 'p8') };
  assert.ok(validateLesson('egg-x.json', bad, ['egg-x']).some((e) => e.includes('盤面の必須')));
});
