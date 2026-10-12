// 盤面エディタの表示まわりの定数と純粋な関数（DOM 非依存。test/editor-view.test.mjs で検査）。
// 開発者用・手元専用。子ども向け画面（APP_SHELL）には載せない。

export const EDITOR_MAX_SIZE = 6; // 盤面サイズ上限（#389 後に 20）

// cellPx（1マスの px）。renderGrid は cellSize を検査せずそのまま使うので、範囲はエディタ側で決める。
export const CELL_PX_MIN = 8; // js/ui-grid.js の MIN_CELL と同じ
export const CELL_PX_MAX = 128; // 200%。6×6 でも 1280×800 の盤面エリアに収まる（6*128+28=796）
export const CELL_PX_DEFAULT = 64; // 100%。renderGrid の DEFAULT_CELL と同じ

// 正の整数に丸めて範囲内に収める。数でない値・NaN は既定値。
export function clampCellPx(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CELL_PX_DEFAULT;
  return Math.min(CELL_PX_MAX, Math.max(CELL_PX_MIN, n));
}

// ホイールの deltaY（上向き＝負＝拡大）から次の cellPx を返す。1回で約10％、最低 1px は動かす。
export function wheelCellPx(current, deltaY) {
  if (!deltaY) return clampCellPx(current);
  const step = Math.max(1, Math.round(current * 0.1));
  return clampCellPx(current + (deltaY < 0 ? step : -step));
}

export function zoomPercent(cellPx) {
  return Math.round((cellPx / CELL_PX_DEFAULT) * 100);
}

// 表示用の例盤面（既存の盤面 JSON と同じ形。lessons/*.json の demo・step と同じ項目）。
export const SAMPLE_SPEC = {
  grid: { cols: 5, rows: 5 },
  start: { x: 0, y: 0 },
  goal: { x: 4, y: 4 },
  walls: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 3 }],
  items: [{ x: 2, y: 0 }, { x: 4, y: 1 }],
  ice: [{ x: 3, y: 0 }, { x: 4, y: 0 }],
  cushion: [{ x: 3, y: 1 }],
  keys: [{ x: 0, y: 2, color: 'red' }],
  doors: [{ x: 2, y: 2, color: 'red' }],
  keyMode: 'remote',
  switches: [{ x: 0, y: 4, color: 'blue', targets: [{ x: 1, y: 4 }] }],
  paint: [{ x: 0, y: 3 }],
  periodic: [{ x: 4, y: 2, period: 3 }],
  water: [{ x: 2, y: 3 }],
  bridge: [{ x: 2, y: 4 }],
  waterMode: 'bump',
};
