// verify:fast の「生成テストを含めるか」判定（純関数）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratePath, decideGenerate, stageEnv } from '../tools/verify-fast.mjs';

test('生成まわりのパスは含める判定', () => {
  for (const p of ['js/gimmicks/paint.js', 'js/engine-generate.js', 'js/engine-grid.js', 'test/engine-generate-x.test.mjs',
    'package.json', 'tools/verify-fast.mjs', 'tools/test-unit-core.mjs', 'js\\gimmicks\\paint.js']) {
    assert.equal(isGeneratePath(p), true, p);
  }
});

test('それ以外のパスは除く判定', () => {
  for (const p of ['docs/tools.md', 'js/engine.js', 'test/analytics.test.mjs', 'js/gimmicks.js', 'tools/analyze-board.mjs']) {
    assert.equal(isGeneratePath(p), false, p);
  }
});

test('generate 段だけ GENERATE_SEEDS=200 を渡す（設定済みなら上書きしない）', () => {
  assert.equal(stageEnv('test:unit:generate', { A: '1' }).GENERATE_SEEDS, '200');
  assert.equal(stageEnv('test:unit:generate', { A: '1' }).A, '1');
  assert.equal(stageEnv('test:unit:generate', { GENERATE_SEEDS: '50' }).GENERATE_SEEDS, '50');
  for (const n of ['check:static', 'validate:lessons', 'test:unit:core']) {
    assert.equal(stageEnv(n, { A: '1' }).GENERATE_SEEDS, undefined, n);
  }
});

test('理由の決定', () => {
  assert.deepEqual(decideGenerate({ withFlag: true, changedFiles: [] }), { include: true, reason: '--with-generate' });
  assert.deepEqual(decideGenerate({ changedFiles: null }), { include: true, reason: '検知失敗' });
  assert.deepEqual(decideGenerate({ changedFiles: ['docs/a.md', 'js/gimmicks/paint.js'] }), { include: true, reason: '変更検知' });
  assert.deepEqual(decideGenerate({ changedFiles: ['docs/tools.md'] }), { include: false, reason: '変更なし' });
  assert.deepEqual(decideGenerate({ changedFiles: [] }), { include: false, reason: '変更なし' });
});
