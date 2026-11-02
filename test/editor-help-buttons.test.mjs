// #641: tools/editor/index.html の静的な <button> の文言が help.html に書かれている（ヘルプの抜けを防ぐ）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../tools/editor/${p}`, import.meta.url), 'utf8');
const plain = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');

// ヘルプに書かなくてよい文言と、その理由。
const EXEMPT = new Map([
  ['とじる', 'たたき台・配置のパネルを閉じるだけの定型ボタン。開くボタン側（「たたき台」「配置」）をヘルプで説明している'],
]);

test('editor-help: index.html の静的な <button> の文言が help.html にある', () => {
  const help = plain(read('help.html'));
  const labels = [...read('index.html').matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(labels.length > 20, `ボタンを拾えていない（${labels.length}個）`);
  const missing = [...new Set(labels)].filter((t) => !EXEMPT.has(t) && !help.includes(t));
  assert.deepEqual(missing, [], `help.html に無いボタン文言: ${missing.join(' / ')}（ヘルプに足すか、EXEMPT に理由つきで入れる）`);
});

test('editor-help: 除外した文言は index.html に実在する（古い除外が残らない）', () => {
  const idx = read('index.html');
  for (const t of EXEMPT.keys()) assert.ok(idx.includes(`>${t}</button>`), `除外「${t}」が index.html に無い`);
});

test('editor-help: 保存後の注記のリンク先 id が help.html にある', () => {
  const m = read('index.html').match(/id="layout-note"[^>]*>[\s\S]*?href="\/help\.html#([^"]+)"/);
  assert.ok(m, '#layout-note に help.html へのリンクが無い');
  assert.ok(read('help.html').includes(`id="${m[1]}"`), `help.html に id="${m[1]}" が無い`);
});
