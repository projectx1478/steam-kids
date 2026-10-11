// isIntroKnown（js/ui-step.js）の単体テスト（Issue #269）。
// リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/dev-mode.js が import 時に location を参照するためスタブを先に定義する
globalThis.location = { search: '' };
const { isIntroKnown } = await import('../js/ui-step.js');

const units = [
  { unitId: 'commands', lessonIds: ['c1', 'c2'] },
  { unitId: 'donguri', gimmicks: ['items'], lessonIds: ['d1', 'd2'] },
  { unitId: 'ice', gimmicks: ['ice'], lessonIds: ['i1'] },
  { unitId: 'switches', lessonIds: ['s1'] },
];
const none = () => false;

test('isIntroKnown: 未習なら false', () => {
  assert.equal(isIntroKnown(units, 'd1', none), false);
});

test('isIntroKnown: ギミック単元が1本でもクリア済みなら、その単元のレッスンは true', () => {
  assert.equal(isIntroKnown(units, 'd1', (id) => id === 'd2'), true);
});

test('isIntroKnown: commands 単元はいずれかクリア済みなら true、未クリアなら false', () => {
  assert.equal(isIntroKnown(units, 'c2', (id) => id === 'c1'), true);
  assert.equal(isIntroKnown(units, 'c2', none), false);
});

test('isIntroKnown: gimmicks の無い単元は常に false', () => {
  assert.equal(isIntroKnown(units, 's1', () => true), false);
});

test('isIntroKnown: units が null・undefined、単元が見つからないなら false', () => {
  assert.equal(isIntroKnown(null, 'd1', () => true), false);
  assert.equal(isIntroKnown(undefined, 'd1', () => true), false);
  assert.equal(isIntroKnown(units, 'zzz', () => true), false);
});

test('isIntroKnown: 新ギミックの初回（その単元が未クリア）は、他単元がクリア済みでも false', () => {
  assert.equal(isIntroKnown(units, 'i1', (id) => id === 'd1' || id === 'c1'), false);
});
