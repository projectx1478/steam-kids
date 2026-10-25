// docs/ui-rules.md の「ヘッダ・⚙メニュー構成表」のパーサ（tools/ui-gear-table.mjs）の単体テスト。Issue #574 段A。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGearTable } from '../tools/ui-gear-table.mjs';

const SAMPLE = `# x

## ヘッダ・⚙メニュー構成表

注記の行。

| 画面 | ヘッダ要素 | ⚙位置 | メニュー行 | アイコン・ひらがな |
|---|---|---|---|---|
| intro | \`#back-btn\` \`#gear-btn\` | \`#gear-btn\` | \`#menu-home\` \`#menu-close\` | 🏠 レッスンせんたくがめん |
| play | なし | \`[data-action="menu"]\` | \`#menu-home\` \`#menu-close\` | せってい |

## 次の見出し

| 画面 | ヘッダ要素 | ⚙位置 | メニュー行 | アイコン・ひらがな |
|---|---|---|---|---|
| other | \`#x\` | \`#y\` | \`#z\` | - |
`;

test('表の各行を 画面 / ヘッダ要素 / ⚙位置 / メニュー行 に分ける', () => {
  assert.deepEqual(parseGearTable(SAMPLE), [
    { screen: 'intro', header: ['#back-btn', '#gear-btn'], gear: '#gear-btn', menu: ['#menu-home', '#menu-close'] },
    { screen: 'play', header: [], gear: '[data-action="menu"]', menu: ['#menu-home', '#menu-close'] },
  ]);
});

test('見出しが無ければ例外', () => {
  assert.throws(() => parseGearTable('# なし\n'), /構成表/);
});

test('実物の docs/ui-rules.md の表が読め、全画面が揃う', () => {
  const rows = parseGearTable(readFileSync(new URL('../docs/ui-rules.md', import.meta.url), 'utf8'));
  assert.deepEqual(
    rows.map((r) => r.screen),
    ['title', 'map', 'intro', 'predict', 'seedPick', 'play', 'teko', 'tutorial', 'summary']
  );
  for (const r of rows) {
    assert.ok(r.gear, `${r.screen}: ⚙位置が空`);
    assert.ok(r.menu.includes('#menu-close'), `${r.screen}: とじる が無い`);
  }
});
