// validate-lessons の keyMode 検査（Issue #391）。静的な盤面（keys.js の validate）と
// gimmickMix（cmd-06 型）の合格・不合格を見る。盤面は review/design/391/boards の5枚と同じ内容。
// リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLesson } from '../tools/validate-lessons.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const keyLesson = JSON.parse(readFileSync('lessons/key-01-kagi.json', 'utf-8'));
const practice = JSON.parse(readFileSync('lessons/cmd-06-practice.json', 'utf-8'));

// 静的な盤面：key-01 の p1 を差し替えて検査し、keyMode に関するエラーだけ返す
const board = { grid: { cols: 5, rows: 3 }, start: { x: 0, y: 2 }, goal: { x: 4, y: 2 }, walls: [{ x: 3, y: 1 }, { x: 4, y: 1 }], allowedCommands: ['up', 'down', 'left', 'right'], maxCommands: 8 };
const withKeys = { keys: [{ x: 1, y: 1, color: 'red' }], doors: [{ x: 3, y: 2, color: 'red' }] };
function boardErrors(fields) {
  const data = clone(keyLesson);
  const p1 = data.steps.find((s) => s.stepId === 'p1');
  for (const k of ['keys', 'doors', 'keyMode', 'solution']) delete p1[k];
  Object.assign(p1, board, fields);
  return validateLesson('key-01-kagi.json', data).filter((e) => e.includes('keyMode'));
}

test('keyMode 検査（静的）: 合格＝keys・doors ありで keyMode:"carry"（validate-pass-carry）', () => {
  assert.deepEqual(boardErrors({ ...withKeys, keyMode: 'carry' }), []);
  assert.deepEqual(boardErrors({ ...withKeys, keyMode: 'remote' }), []);
  assert.deepEqual(boardErrors({ ...withKeys }), [], '省略は carry 扱いで合格');
});

test('keyMode 検査（静的）: 不合格＝keys なしの keyMode 指定（validate-fail-keymode-without-keys）', () => {
  assert.equal(boardErrors({ keyMode: 'carry' }).length, 1);
});

test('keyMode 検査（静的）: 不合格＝値が remote／carry 以外（validate-fail-keymode-bad-value）', () => {
  assert.equal(boardErrors({ ...withKeys, keyMode: 'hold' }).length, 1);
});

// gimmickMix（cmd-06 型）：p1 の generator.gimmickMix を差し替える
function mixErrors(gimmickMix) {
  const data = clone(practice);
  data.steps[1].generator.gimmickMix = gimmickMix;
  return validateLesson('cmd-06-practice.json', data).filter((e) => e.includes('gimmickMix'));
}
const mixBase = clone(practice).steps[1].generator.gimmickMix;
const { keys: mixKeys } = mixBase;

test('keyMode 検査（gimmickMix）: 合格＝items・ice・keys と keyMode:"remote"（validate-pass-gimmickmix）', () => {
  assert.deepEqual(mixErrors({ ...mixBase, keyMode: 'remote' }), []);
  assert.deepEqual(mixErrors({ ...mixBase, keyMode: 'carry' }), []);
});

test('keyMode 検査（gimmickMix）: 不合格＝keys の無い gimmickMix の keyMode（validate-fail-gimmickmix-keymode-without-keys）', () => {
  const { items, ice } = mixBase;
  assert.equal(mixErrors({ items, ice, keyMode: 'remote' }).length, 1);
  assert.ok(mixErrors({ keyMode: 'remote' }).length >= 1, 'keyMode だけの gimmickMix も不合格');
  assert.equal(mixErrors({ keys: mixKeys, keyMode: 'hold' }).length, 1, '値が不正なら不合格');
});
