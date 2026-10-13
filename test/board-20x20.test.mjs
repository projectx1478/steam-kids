// 20×20 の盤を描く単体テスト（Issue #389 段B）。ブラウザ不要の最小DOM代用で、drawBoard が400マスを作ること、
// fitCellSize のすき間・余白の切り替え、24px以上の盤のマス寸法が従来と同じことを確かめる。
// 実ブラウザでの所要ms・要素数の計測は .claude/verify/scenarios/zoom-draw-cost.mjs（結果は docs/testing-steam-kids.md）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- 最小のDOM代用（renderGrid が触る範囲）
let created = 0;
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.className = '';
    this._html = '';
    this.classList = {
      add: (...c) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...c])].join(' '); },
      remove: (...c) => { this.className = this.className.split(' ').filter((x) => x && !c.includes(x)).join(' '); },
      contains: (c) => this.className.split(' ').includes(c),
      toggle: () => {},
    };
    created += 1;
  }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.children.push(c)); }
  prepend(...cs) { this.children.unshift(...cs); }
  insertBefore(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  remove() {}
  cells() {
    const out = [];
    const walk = (e) => e.children.forEach((c) => { if (c.className.includes('grid-cell')) out.push(c); walk(c); });
    walk(this);
    return out;
  }
}
globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (_, t) => new FakeEl(t), body: new FakeEl('body') };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });

const { drawBoard, fitCellSize } = await import('../js/ui-board.js');
const { computeCellSize } = await import('../js/ui-grid.js');

const area = (w, h) => ({ clientWidth: w, clientHeight: h });
const spec20 = {
  grid: { cols: 20, rows: 20 },
  start: { x: 0, y: 0 },
  goal: { x: 19, y: 19 },
  walls: [{ x: 3, y: 3 }, { x: 4, y: 3 }],
  items: [],
};

test('board-20x20: 360px幅の盤面エリア（328×216）ではすき間1px・余白2px・マス9px', () => {
  assert.deepEqual(fitCellSize({ spec: spec20, boardArea: area(328, 216) }), { cellSize: 9, gap: 1, pad: 2 });
});

test('board-20x20: drawBoard は400マスを描き、すき間・余白をスタイルに反映する', () => {
  const fit = fitCellSize({ spec: spec20, boardArea: area(328, 216) });
  const boardWrap = new FakeEl('div');
  const { el } = drawBoard({ boardWrap, spec: spec20, ...fit, playerPos: spec20.start });
  assert.equal(el.cells().length, 400);
  assert.equal(el.style.gap, '1px');
  assert.equal(el.style.padding, '2px');
  assert.equal(el.style.gridTemplateColumns, 'repeat(20, 9px)');
  assert.equal(boardWrap.children.length, 1);
});

test('board-20x20: gap・pad を渡さない呼び出し（ui-demo・エディタ）は従来の4px/4px', () => {
  const boardWrap = new FakeEl('div');
  const { el } = drawBoard({ boardWrap, spec: spec20, cellSize: 20, playerPos: spec20.start });
  assert.equal(el.style.gap, '4px');
  assert.equal(el.style.padding, '4px');
});

test('board-20x20: 24px以上の盤のマス寸法は従来の computeCellSize と同じ（すき間4px・余白4px）', () => {
  const sizes = [
    [{ cols: 6, rows: 6 }, 328, 360],
    [{ cols: 4, rows: 4 }, 328, 300],
    [{ cols: 5, rows: 3 }, 1000, 600],
    [{ cols: 9, rows: 9 }, 400, 400],
  ];
  for (const [grid, w, h] of sizes) {
    const spec = { ...spec20, grid };
    const old = computeCellSize({ cols: grid.cols, rows: grid.rows, width: w, height: h, maxCell: 64 });
    const fit = fitCellSize({ spec, boardArea: area(w, h), portraitMax: 64 });
    assert.ok(old >= 24, `前提: ${grid.cols}x${grid.rows} は24px以上 (${old})`);
    assert.deepEqual(fit, { cellSize: old, gap: 4, pad: 4 });
  }
});

test('board-20x20: 既定でマスが24px未満になる盤だけ、すき間1px・余白2pxで計算し直す（大きく取れる）', () => {
  const spec = { ...spec20, grid: { cols: 12, rows: 12 } };
  const old = computeCellSize({ cols: 12, rows: 12, width: 328, height: 216, maxCell: 64 });
  assert.ok(old < 24);
  const fit = fitCellSize({ spec, boardArea: area(328, 216), portraitMax: 64 });
  assert.equal(fit.gap, 1);
  assert.equal(fit.pad, 2);
  assert.ok(fit.cellSize >= old);
  assert.equal(fit.cellSize, computeCellSize({ cols: 12, rows: 12, width: 328, height: 216, gap: 1, pad: 2, maxCell: 64 }));
});
