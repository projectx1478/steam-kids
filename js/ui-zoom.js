// 盤面の拡大縮小（Issue #389 段B）。boardArea（overflow-hidden）を窓にして、boardWrap に CSS transform を掛ける。
// 拡大は再描画しない（drawBoard の後も倍率と位置を保つ）。対象は、既定のすき間・余白でマスが24px未満になる盤だけ
// （ui-board.js の fitCellSize が決める）。24px以上の盤では何もしない（touch-action も触らない）。
// 操作：設定メニューの「がめん」から開くズームバーの3項目（ui-menu.js）・ホイール・2本指ピンチ（補助）・拡大中の1本指ドラッグ（計画型のみ。
// direct=true の直接操作型は2本指のみ）。実行中は view.moveTo の後でロボットを中央へ寄せ、実行後は戻さない。
// 動きを減らす設定では、倍率・位置の切り替えを瞬時に行う。

import { prefersReducedMotion, GAP_PX, PAD_PX } from './ui-grid.js';

export const ZOOM_STEPS = [1, 1.5, 2, 3];
const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const EPS = 0.01;
const ZOOM_MS = 250;
const FOLLOW_MS = 450;
const DRAG_THRESHOLD_PX = 6;

let active = null;

// 今の操作画面の拡大縮小。画面が外されていれば null（歯車メニューが項目を出すかの判定に使う）。
export function getActiveZoom() {
  return active && active.boardArea.isConnected ? active : null;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// createZoom({ boardArea, boardWrap, direct }) -> { onDraw, zoomIn, zoomOut, reset, follow, enabled, scale, boardArea }
export function createZoom({ boardArea, boardWrap, direct = false }) {
  let enabled = false;
  let s = 1;
  let tx = 0;
  let ty = 0;
  let layout = null; // { cols, rows, cellSize, gap, pad }
  let lastPos = null;

  const clampPan = () => {
    const halfX = Math.max(0, (boardWrap.offsetWidth * s - boardArea.clientWidth) / 2);
    const halfY = Math.max(0, (boardWrap.offsetHeight * s - boardArea.clientHeight) / 2);
    tx = clamp(tx, -halfX, halfX);
    ty = clamp(ty, -halfY, halfY);
  };

  const apply = (ms = 0) => {
    clampPan();
    const instant = ms === 0 || prefersReducedMotion();
    boardWrap.style.transition = instant ? 'none' : `transform ${ms}ms ease`;
    boardWrap.style.transform = s === 1 && tx === 0 && ty === 0 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`;
    // 拡大中だけ none（盤面内のドラッグ・ピンチを受ける）。拡大できる盤の等倍中は、ページのスクロールを残したまま
    // ピンチだけ受ける。拡大できない盤は何も指定しない。
    boardArea.style.touchAction = !enabled ? '' : s > 1 + EPS ? 'none' : 'pan-x pan-y';
    boardArea.dataset.zoom = enabled ? String(s) : '';
  };

  // 盤の位置 pos のマスの中心を窓の中央へ寄せる（倍率は変えない）。
  const centerOn = (pos, ms) => {
    if (!layout || !pos) return;
    const { cellSize, gap, pad } = layout;
    const rx = pad + pos.x * (cellSize + gap) + cellSize / 2;
    const ry = pad + pos.y * (cellSize + gap) + cellSize / 2;
    tx = -(rx - boardWrap.offsetWidth / 2) * s;
    ty = -(ry - boardWrap.offsetHeight / 2) * s;
    apply(ms);
  };

  const setScale = (next, ms = ZOOM_MS) => {
    if (!enabled) return;
    const to = clamp(next, 1, MAX_SCALE);
    const from = s;
    if (Math.abs(to - from) < EPS / 10) return;
    tx *= to / from;
    ty *= to / from;
    s = to;
    if (from === 1 && to > 1) centerOn(lastPos, ms);
    else apply(ms);
  };

  const ctrl = {
    boardArea,
    enabled: () => enabled,
    scale: () => s,
    zoomIn() {
      const next = ZOOM_STEPS.find((v) => v > s + EPS);
      if (next) setScale(next);
    },
    zoomOut() {
      const prev = [...ZOOM_STEPS].reverse().find((v) => v < s - EPS);
      if (prev) setScale(prev);
    },
    reset() {
      s = 1;
      tx = 0;
      ty = 0;
      apply(ZOOM_MS);
    },
    follow(pos) {
      lastPos = pos;
      if (enabled && s > 1 + EPS) centerOn(pos, FOLLOW_MS);
    },
    // 盤面を描いた（描き直した）後に呼ぶ。fit は fitCellSize の結果、view は renderGrid の view。
    onDraw({ spec, fit, view, playerPos }) {
      layout = { cols: spec.grid.cols, rows: spec.grid.rows, cellSize: fit.cellSize, gap: fit.gap, pad: fit.pad };
      lastPos = playerPos ?? lastPos;
      enabled = fit.gap !== GAP_PX || fit.pad !== PAD_PX;
      if (!enabled) {
        s = 1;
        tx = 0;
        ty = 0;
      }
      if (enabled && view && typeof view.moveTo === 'function') {
        const orig = view.moveTo.bind(view);
        view.moveTo = (pos) => {
          orig(pos);
          ctrl.follow(pos);
        };
      }
      apply();
    },
  };

  // --- ホイール（補助）
  boardArea.addEventListener(
    'wheel',
    (e) => {
      if (!enabled) return;
      e.preventDefault();
      if (e.deltaY < 0) ctrl.zoomIn();
      else if (e.deltaY > 0) ctrl.zoomOut();
    },
    { passive: false },
  );

  // --- ポインタ（2本指ピンチ＋移動。拡大中の1本指ドラッグは計画型のみ）
  const pointers = new Map(); // pointerId -> {x, y}
  let pinch = null; // { dist, mx, my }
  let dragged = false;
  let downAt = null;

  const mid = () => {
    const [a, b] = [...pointers.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  boardArea.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    downAt = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) pinch = mid();
  });

  boardArea.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!enabled || !prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinch) {
      const m = mid();
      dragged = true;
      const next = clamp(s * (m.dist / pinch.dist), 1, MAX_SCALE);
      const k = next / s;
      tx = tx * k + (m.mx - pinch.mx);
      ty = ty * k + (m.my - pinch.my);
      s = next;
      pinch = m;
      apply();
      return;
    }
    if (pointers.size === 1 && !direct && s > 1 + EPS) {
      if (!dragged && Math.hypot(cur.x - downAt.x, cur.y - downAt.y) < DRAG_THRESHOLD_PX) return;
      dragged = true;
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      apply();
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  boardArea.addEventListener('pointerup', release);
  boardArea.addEventListener('pointercancel', release);
  // ドラッグ・ピンチの直後のクリックは、マスや選択肢のタップとして扱わない。
  boardArea.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  active = ctrl;
  return ctrl;
}
