// #397 段3: 盤面エディタのパレット生成と、GIMMICKS 全要素の label。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIMMICKS } from '../js/gimmicks/index.js';
import { buildPalette, FIXED_ITEMS, iconSpec } from '../tools/editor/palette.js';

test('editor-palette: GIMMICKS の全要素が空でない文字列の label を持つ', () => {
  for (const g of GIMMICKS) {
    assert.equal(typeof g.label, 'string', `${g.key}: label が文字列でない`);
    assert.ok(g.label.trim().length > 0, `${g.key}: label が空`);
  }
});

test('editor-palette: 固定4項目が先頭にある', () => {
  const p = buildPalette(GIMMICKS);
  assert.deepEqual(p.slice(0, 4).map((x) => x.key), ['wall', 'start', 'goal', 'eraser']);
  assert.ok(p.slice(0, 4).every((x) => x.kind === 'fixed' && x.label));
  assert.equal(FIXED_ITEMS.length, 4);
});

test('editor-palette: GIMMICKS の key が全部（登録順で）パレットに出る', () => {
  const p = buildPalette(GIMMICKS);
  const gim = p.filter((x) => x.kind === 'gimmick');
  assert.deepEqual(gim.map((x) => x.key), GIMMICKS.map((g) => g.key));
  assert.deepEqual(gim.map((x) => x.label), GIMMICKS.map((g) => g.label));
  assert.equal(p.length, 4 + GIMMICKS.length);
});

test('editor-palette: 登録表に足したギミックもパレットに出る', () => {
  const p = buildPalette([...GIMMICKS, { key: 'dummy', label: 'ダミー' }]);
  assert.deepEqual(p.at(-1), { key: 'dummy', label: 'ダミー', kind: 'gimmick' });
});

test('editor-palette: アイコン用の盤面は消しゴム以外すべてにある', () => {
  for (const p of buildPalette(GIMMICKS)) {
    if (p.key === 'eraser') assert.equal(iconSpec(p.key), null);
    else assert.deepEqual(iconSpec(p.key).grid, { cols: 1, rows: 1 }, p.key);
  }
});
