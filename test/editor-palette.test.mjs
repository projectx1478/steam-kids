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
  // ワープだけは組ごとに「ワープ1」「ワープ2」の2項目（#488）
  // かぎ・ドアも別項目の2つ（#523）
  const expKeys = GIMMICKS.flatMap((g) => (g.key === 'warps' ? ['warps1', 'warps2'] : g.key === 'keys' ? ['keys', 'doors'] : [g.key]));
  const expLabels = GIMMICKS.flatMap((g) => (g.key === 'warps' ? ['ワープ1', 'ワープ2'] : g.key === 'keys' ? ['かぎ', 'ドア'] : [g.label]));
  assert.deepEqual(gim.map((x) => x.key), expKeys);
  assert.deepEqual(gim.map((x) => x.label), expLabels);
  assert.equal(p.length, 4 + expKeys.length);
});

test('editor-palette: ワープ1・2 のアイコン盤面は pair が違う穴1個', () => {
  assert.deepEqual(iconSpec('warps1').warps, [{ x: 0, y: 0, pair: 1 }]);
  assert.deepEqual(iconSpec('warps2').warps, [{ x: 0, y: 0, pair: 2 }]);
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

test('editor-palette: かぎとドアは別項目。アイコン盤面はそれぞれ1個', () => {
  const p = buildPalette(GIMMICKS);
  assert.deepEqual(p.filter((x) => x.key === 'keys' || x.key === 'doors').map((x) => x.label), ['かぎ', 'ドア']);
  assert.deepEqual(iconSpec('keys').keys, [{ x: 0, y: 0, color: 'red' }]);
  assert.deepEqual(iconSpec('doors').doors, [{ x: 0, y: 0, color: 'red' }]);
});

test('editor-palette: 周期ドアは1項目。アイコン盤面は period 3 が1個', () => {
  const p = buildPalette(GIMMICKS);
  assert.deepEqual(p.filter((x) => x.key === 'periodic').map((x) => x.label), ['周期ドア']);
  assert.deepEqual(iconSpec('periodic').periodic, [{ x: 0, y: 0, period: 3 }]);
});
