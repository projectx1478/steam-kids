// 盤面エディタ（開発者用）の画面。盤面は js/ui-board.js の drawBoard 経由で描く。
import { drawBoard } from '/js/ui-board.js';
import { SAMPLE_SPEC, CELL_PX_DEFAULT, EDITOR_MAX_SIZE, clampCellPx, wheelCellPx, zoomPercent } from './editor-view.js';

const state = { spec: SAMPLE_SPEC, cellPx: CELL_PX_DEFAULT };

const boardWrap = document.getElementById('board');
const boardArea = document.getElementById('boardArea');
const zoomEl = document.getElementById('zoom');
const statusEl = document.getElementById('status');

function render() {
  drawBoard({ boardWrap, spec: state.spec, cellSize: state.cellPx, playerPos: state.spec.start });
  zoomEl.textContent = `${zoomPercent(state.cellPx)}%`;
  const { cols, rows } = state.spec.grid;
  statusEl.textContent = `${cols}×${rows}（上限 ${EDITOR_MAX_SIZE}×${EDITOR_MAX_SIZE}）　マス ${state.cellPx}px`;
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

render();
