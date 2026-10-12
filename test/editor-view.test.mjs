// #397 段2: 盤面エディタの cellPx（マス大きさ）の丸め・範囲。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCellPx, wheelCellPx, zoomPercent, CELL_PX_MIN, CELL_PX_MAX, CELL_PX_DEFAULT, SAMPLE_SPEC, EDITOR_MAX_SIZE } from '../tools/editor/editor-view.js';

test('editor-view: clampCellPx は正の整数で範囲内に収める', () => {
  assert.equal(clampCellPx(64), 64);
  assert.equal(clampCellPx(63.6), 64);
  assert.equal(clampCellPx(0), CELL_PX_MIN);
  assert.equal(clampCellPx(-5), CELL_PX_MIN);
  assert.equal(clampCellPx(1e6), CELL_PX_MAX);
  assert.equal(clampCellPx(NaN), CELL_PX_DEFAULT);
  assert.equal(clampCellPx('abc'), CELL_PX_DEFAULT);
});

test('editor-view: wheelCellPx は上で拡大・下で縮小し、端で止まる', () => {
  assert.ok(wheelCellPx(64, -100) > 64);
  assert.ok(wheelCellPx(64, 100) < 64);
  assert.equal(wheelCellPx(64, 0), 64);
  assert.equal(wheelCellPx(CELL_PX_MAX, -100), CELL_PX_MAX);
  assert.equal(wheelCellPx(CELL_PX_MIN, 100), CELL_PX_MIN);
  assert.ok(wheelCellPx(CELL_PX_MIN, -100) > CELL_PX_MIN); // 小さくても最低 1px は動く
});

test('editor-view: zoomPercent と例盤面のサイズ', () => {
  assert.equal(zoomPercent(CELL_PX_DEFAULT), 100);
  assert.equal(zoomPercent(CELL_PX_MAX), 200);
  assert.ok(SAMPLE_SPEC.grid.cols <= EDITOR_MAX_SIZE && SAMPLE_SPEC.grid.rows <= EDITOR_MAX_SIZE);
});
