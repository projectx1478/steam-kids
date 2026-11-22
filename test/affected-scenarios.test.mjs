import test from 'node:test';
import assert from 'node:assert/strict';
import { findAffected, formatOutput, hasDimensionDiff, MAX_E2E, DIMENSION_SCENARIOS, isRuntimeFile, ROUGH_SCENARIO } from '../tools/affected-scenarios.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const scenarios = [
  { name: 'aa', text: "page.click('[data-foo]')" },
  { name: 'bb', text: "import './ui-play.js'" },
  ...DIMENSION_SCENARIOS.map((name) => ({ name, text: '' })),
];

test('語の引数で該当シナリオを返す', () => {
  assert.deepEqual(findAffected({ scenarios, words: ['data-foo'] }), ['aa']);
});

test('ファイル名がシナリオ本文に出てくれば該当', () => {
  assert.deepEqual(findAffected({ scenarios, files: ['js/ui-play.js'] }), ['bb']);
});

test('シナリオ自身の変更は該当', () => {
  assert.deepEqual(findAffected({ scenarios, files: ['.claude/verify/scenarios/aa.mjs'] }), ['aa']);
});

test('寸法変更で3本が足される', () => {
  assert.deepEqual(findAffected({ scenarios, files: ['tailwind.src.css'], dimensionChanged: true }), [...DIMENSION_SCENARIOS].sort());
});

test('寸法変更でなければ足さない', () => {
  assert.deepEqual(findAffected({ scenarios, files: ['tailwind.src.css'] }), []);
});

test('hasDimensionDiff は追加・削除行だけを見る', () => {
  assert.equal(hasDimensionDiff('+++ b/x\n+  max-width: 10px;'), true);
  assert.equal(hasDimensionDiff('+++ b/gap\n-  color: red;'), false);
  assert.equal(hasDimensionDiff(' gap: 1px\n+color: red'), false);
});

test('12本超は別行に分ける', () => {
  const names = Array.from({ length: MAX_E2E + 2 }, (_, i) => `s${String(i).padStart(2, '0')}`);
  const out = formatOutput(names).split('\n');
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith('E2E: '));
  assert.equal(out[0].split(' ').length - 1, MAX_E2E);
  assert.ok(out[1].startsWith('手動実行'));
  assert.ok(out[1].includes('s12') && out[1].includes('s13'));
});

test('12本以下は E2E 行のみ', () => {
  assert.equal(formatOutput(['a', 'b']), 'E2E: a b');
});

test('isRuntimeFile が真', () => {
  for (const p of ['js/ui-retry.js', 'js/engine-grid.js', 'js/gimmicks/ice.js', 'app.js', 'index.html', 'tailwind.src.css', 'style.css', 'js\\ui-retry.js']) assert.equal(isRuntimeFile(p), true, p);
});

test('isRuntimeFile が偽', () => {
  for (const p of ['js/ui-seesaw.js', 'js/engine-buoyancy.js', 'js/ui-predict.js', 'js/ui-dashboard.js', 'js/sortorder-dishes.js', 'js/vendor/confetti.js', 'dashboard.html', 'lessons/cmd-01-susumu.json', 'docs/a.md', 'tools/x.mjs']) assert.equal(isRuntimeFile(p), false, p);
});

test('rough-grid は js 等の変更でだけ足される', () => {
  const rg = [{ name: 'rough-grid', text: '' }];
  assert.deepEqual(findAffected({ scenarios: rg, files: ['js/ui-retry.js'] }), ['rough-grid']);
  assert.deepEqual(findAffected({ scenarios: rg, files: ['lessons/cmd-02-x.json'] }), []);
  assert.deepEqual(findAffected({ scenarios: rg, files: ['docs/a.md'] }), []);
  assert.deepEqual(findAffected({ scenarios, files: ['js/ui-retry.js'] }), []);
});

test('CLI の --files で rough-grid が載る／載らない', () => {
  const run = (f) => execFileSync('node', ['tools/affected-scenarios.mjs', '--files', f], { encoding: 'utf-8' }).split('\n')[0];
  assert.match(run('js/ui-retry.js'), / rough-grid/);
  assert.doesNotMatch(run('docs/a.md'), /rough-grid/);
});

test('ROUGH_SCENARIO のシナリオファイルが存在する', () => {
  assert.equal(ROUGH_SCENARIO, 'rough-grid');
  assert.equal(existsSync(`.claude/verify/scenarios/${ROUGH_SCENARIO}.mjs`), true);
});
