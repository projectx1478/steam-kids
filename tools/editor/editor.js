// 盤面エディタ（開発者用）の画面。盤面は js/ui-board.js の drawBoard 経由で描く。
import { drawBoard } from '/js/ui-board.js';
import { SAMPLE_SPEC, CELL_PX_DEFAULT, EDITOR_MAX_SIZE, clampCellPx, wheelCellPx, zoomPercent } from './editor-view.js';

import { GIMMICKS } from '/js/gimmicks/index.js';
import { buildPalette, iconSpec } from './palette.js';

const state = { spec: SAMPLE_SPEC, cellPx: CELL_PX_DEFAULT, selected: 'wall' };

const ICON_CELL_PX = 32;
// 消しゴムは盤面部品に無いので専用の SVG（見本のとおり）
const ERASER_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-30 32 32)"><rect x="10" y="22" width="44" height="22" rx="5" fill="#f9a8d4" stroke="#be185d" stroke-width="2.5" /><rect x="10" y="22" width="16" height="22" rx="5" fill="#e2e8f0" stroke="#64748b" stroke-width="2.5" /></g></svg>';

function sepEl(text) {
  const d = document.createElement('div');
  d.className = 'sep';
  d.textContent = text;
  return d;
}

function paletteRow(item) {
  const row = document.createElement('div');
  row.className = 'pi';
  row.dataset.key = item.key;
  const ic = document.createElement('span');
  ic.className = 'ic';
  const spec = iconSpec(item.key);
  if (spec) {
    const holder = document.createElement('span');
    drawBoard({ boardWrap: holder, spec, cellSize: ICON_CELL_PX, playerPos: item.key === 'start' ? spec.start : { x: -1, y: -1 } });
    ic.appendChild(holder.firstChild);
  } else {
    ic.innerHTML = ERASER_SVG;
  }
  const lb = document.createElement('span');
  lb.className = 'lb';
  lb.textContent = item.label;
  const ky = document.createElement('span');
  ky.className = 'ky';
  ky.textContent = item.key;
  row.append(ic, lb, ky);
  row.addEventListener('click', () => selectPalette(item.key));
  return row;
}

// 選択状態の表示のみ（盤面へ置く操作は段4）
function selectPalette(key) {
  state.selected = key;
  for (const row of document.querySelectorAll('#plist .pi')) row.classList.toggle('sel', row.dataset.key === key);
  render();
}

function renderPalette() {
  const items = buildPalette(GIMMICKS);
  const plist = document.getElementById('plist');
  plist.append(sepEl('固定'), ...items.filter((p) => p.kind === 'fixed').map(paletteRow));
  plist.append(sepEl('ギミック（GIMMICKS 登録順）'), ...items.filter((p) => p.kind === 'gimmick').map(paletteRow));
  selectPalette(state.selected);
}

const boardWrap = document.getElementById('board');
const boardArea = document.getElementById('boardArea');
const zoomEl = document.getElementById('zoom');
const statusEl = document.getElementById('status');

function render() {
  drawBoard({ boardWrap, spec: state.spec, cellSize: state.cellPx, playerPos: state.spec.start });
  zoomEl.textContent = `${zoomPercent(state.cellPx)}%`;
  const { cols, rows } = state.spec.grid;
  const sel = buildPalette(GIMMICKS).find((p) => p.key === state.selected);
  statusEl.textContent = `${cols}×${rows}（上限 ${EDITOR_MAX_SIZE}×${EDITOR_MAX_SIZE}）　マス ${state.cellPx}px　選択中: ${sel ? sel.label : '—'}`;
}

function setCellPx(value) {
  const next = clampCellPx(value);
  if (next === state.cellPx) return;
  state.cellPx = next;
  render();
}

boardArea.addEventListener('wheel', (e) => {
  e.preventDefault();
  setCellPx(wheelCellPx(state.cellPx, e.deltaY));
}, { passive: false });

document.getElementById('zoom-reset').addEventListener('click', () => setCellPx(CELL_PX_DEFAULT));

renderPalette();
