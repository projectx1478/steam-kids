// seed-code: ばんごう（3桁。Issue #398）の検査・変換。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCode, codeToSeed, randomNumberCode, SEED_VER } from '../js/seed-code.js';
import { generateMap } from '../js/engine-generate.js';

const GEN = {
  shape: 'round', grid: { cols: 5, rows: 5 }, walls: { min: 1, max: 2 },
  shortestPath: { min: 4, max: 8 }, minTurns: 2, wallsMustMatter: true, maxCommandsSlack: 2,
};

test('isValidCode: 3桁の数字だけ合格', () => {
  for (const ok of ['123', '007', '000', '999']) assert.equal(isValidCode(ok), true, ok);
  for (const ng of ['12', 'abc', '1234', '', '12a', ' 12', 7, null, undefined]) assert.equal(isValidCode(ng), false, String(ng));
});

test('codeToSeed: 同じ番号・同じ設定なら同じシード、違う番号なら違うシード', () => {
  assert.equal(codeToSeed('123'), codeToSeed('123'));
  assert.equal(codeToSeed('123'), codeToSeed('123', { ver: SEED_VER }));
  assert.equal(codeToSeed('123'), codeToSeed('123', { size: 'x', difficulty: 'y' }));
  assert.notEqual(codeToSeed('123'), codeToSeed('124'));
  assert.notEqual(codeToSeed('007'), codeToSeed('070'));
  assert.throws(() => codeToSeed('123', { ver: SEED_VER + 1 }));
});

test('同じ番号なら同じ盤面', () => {
  const a = generateMap(GEN, codeToSeed('123'));
  const b = generateMap(GEN, codeToSeed('123'));
  assert.deepEqual(a, b);
});

test('randomNumberCode: 0埋め3桁で000〜999', () => {
  assert.equal(randomNumberCode(() => 0), '000');
  assert.equal(randomNumberCode(() => 0.007), '007');
  assert.equal(randomNumberCode(() => 0.9999), '999');
  for (let i = 0; i < 50; i += 1) assert.equal(isValidCode(randomNumberCode()), true);
});
