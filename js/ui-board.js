// 盤面の描画の共通部品（Issue #345）。マスの大きさ計算・renderGrid呼び出し・描き直しの観察を
// 画面（play・tutorial・predict）で共有する。MIN_CELL・computeCellSize・renderGridは ui-grid.js に残し、通すだけ。
import { renderGrid, computeCellSize, splitMaxCell, GAP_PX, PAD_PX } from './ui-grid.js';

// 拡大縮小の対象にする境目（px）。既定のすき間・余白でマスがこれ未満になる盤だけ、すき間・余白を縮めて描く（Issue #389）。
export const ZOOM_CELL_THRESHOLD = 24;
const TIGHT_GAP_PX = 1;
const TIGHT_PAD_PX = 2;

// マスの大きさとすき間・余白。盤面エリアの実寸と盤面の行列数から決める。{ cellSize, gap, pad } を返し、
// 呼び出し側はそのまま drawBoard に渡す。既定（4/4）でマスが24px未満になる盤だけ、すき間1px・余白2pxで計算し直す
// （24px以上の盤のマス寸法は従来と同じ）。
// noSplit を真にすると、横向きでも上限を広げない（computeCellSize の既定の上限のまま。predict）。
export function fitCellSize({ spec, boardArea, portraitMax, noSplit = false }) {
  const args = {
    cols: spec.grid.cols,
    rows: spec.grid.rows,
    width: boardArea.clientWidth,
    height: boardArea.clientHeight,
    ...(noSplit ? {} : { maxCell: splitMaxCell(portraitMax) }),
  };
  const base = computeCellSize(args);
  if (base >= ZOOM_CELL_THRESHOLD) return { cellSize: base, gap: GAP_PX, pad: PAD_PX };
  return { cellSize: computeCellSize({ ...args, gap: TIGHT_GAP_PX, pad: TIGHT_PAD_PX }), gap: TIGHT_GAP_PX, pad: TIGHT_PAD_PX };
}

// fitCellSize の結果の比較用の印（observeBoard が描き直すかどうかを決める）。
export function fitKey(fit) {
  return fit ? `${fit.cellSize}/${fit.gap}/${fit.pad}` : '';
}

// 盤面を作り直して boardWrap に入れ、{ el, view } を返す。spec の項目はそのまま renderGrid に渡す。
export function drawBoard({ boardWrap, spec, cellSize, gap, pad, playerPos, labels = [], hide = {} }) {
  boardWrap.innerHTML = '';
  const { el, view } = renderGrid({
    grid: spec.grid,
    walls: spec.walls,
    goal: hide.goal ? undefined : spec.goal,
    items: spec.items,
    ice: spec.ice,
    cushion: spec.cushion,
    water: spec.water,
    waterMode: spec.waterMode,
    bridge: spec.bridge,
    keys: spec.keys,
    doors: spec.doors,
    switches: spec.switches,
    paint: spec.paint,
    periodic: spec.periodic,
    warps: spec.warps,
    playerPos,
    labels,
    cellSize,
    gap,
    pad,
  });
  boardWrap.appendChild(el);
  return { el, view };
}

// boardArea の大きさが変わったとき、マスの大きさが変わっていれば redraw する。
// skipWhen() が真の間（実行中・結果表示中など）は描き直さない。
// fit() は現在の fitCellSize の結果、current() は描画済みの結果を返す（fitKey で比べる）。
export function observeBoard({ boardArea, fit, current, skipWhen = () => false, redraw }) {
  const ro = new ResizeObserver(() => {
    if (skipWhen()) return;
    if (fitKey(fit()) !== fitKey(current())) redraw();
  });
  ro.observe(boardArea);
  return ro;
}
