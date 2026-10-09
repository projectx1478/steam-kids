// 盤面の描画の共通部品（Issue #345）。マスの大きさ計算・renderGrid呼び出し・描き直しの観察を
// 画面（play・tutorial・predict）で共有する。MIN_CELL・computeCellSize・renderGridは ui-grid.js に残し、通すだけ。
import { renderGrid, computeCellSize, splitMaxCell } from './ui-grid.js';

// マスの大きさ。盤面エリアの実寸と盤面の行列数から決める。
export function fitCellSize({ spec, boardArea, portraitMax }) {
  return computeCellSize({
    cols: spec.grid.cols,
    rows: spec.grid.rows,
    width: boardArea.clientWidth,
    height: boardArea.clientHeight,
    maxCell: splitMaxCell(portraitMax),
  });
}

// 盤面を作り直して boardWrap に入れ、{ el, view } を返す。spec の項目はそのまま renderGrid に渡す。
export function drawBoard({ boardWrap, spec, cellSize, playerPos, labels = [], hide = {} }) {
  boardWrap.innerHTML = '';
  const { el, view } = renderGrid({
    grid: spec.grid,
    walls: spec.walls,
    goal: hide.goal ? undefined : spec.goal,
    items: spec.items,
    ice: spec.ice,
    cushion: spec.cushion,
    keys: spec.keys,
    doors: spec.doors,
    switches: spec.switches,
    paint: spec.paint,
    periodic: spec.periodic,
    playerPos,
    labels,
    cellSize,
  });
  boardWrap.appendChild(el);
  return { el, view };
}

// boardArea の大きさが変わったとき、マスの大きさが変わっていれば redraw する。
// skipWhen() が真の間（実行中・結果表示中など）は描き直さない。
// fit() は現在のマスの大きさ、current() は描画済みのマスの大きさを返す。
export function observeBoard({ boardArea, fit, current, skipWhen = () => false, redraw }) {
  const ro = new ResizeObserver(() => {
    if (skipWhen()) return;
    if (fit() !== current()) redraw();
  });
  ro.observe(boardArea);
  return ro;
}
