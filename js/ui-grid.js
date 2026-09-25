// SVGグリッド描画。すべて自作SVG（<img>・background-imageは使わない）。
const CELL = 64;
const GAP_PX = 4; // Tailwind gap-1
const PAD_PX = 4; // Tailwind p-1
const MOVE_MS = 450;
const BOUNCE_MS = 250;
const BOUNCE_NUDGE_PX = 10;
const NUDGE_BY_DIR = { up: [0, -BOUNCE_NUDGE_PX], down: [0, BOUNCE_NUDGE_PX], left: [-BOUNCE_NUDGE_PX, 0], right: [BOUNCE_NUDGE_PX, 0] };

function shapeSvg(kind) {
  if (kind === 'wall') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="#94a3b8" />
    </svg>`;
  }
  if (kind === 'goal') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <polygon points="32,6 40,24 60,24 44,36 50,56 32,44 14,56 20,36 4,24 24,24"
        fill="#facc15" stroke="#eab308" stroke-width="2" />
    </svg>`;
  }
  if (kind === 'player') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="#38bdf8" stroke="#0284c7" stroke-width="3" />
    </svg>`;
  }
  return '';
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pixelFor(pos) {
  return { x: PAD_PX + pos.x * (CELL + GAP_PX), y: PAD_PX + pos.y * (CELL + GAP_PX) };
}

window.__gridAnimLog = window.__gridAnimLog || [];

// renderGrid({grid, walls, goal, playerPos, labels, markers}) -> { el, view }
// labels: [{id, x, y}] 予想ステップの選択肢ボタン
// markers: [{x, y, kind: 'predicted' | 'result'}] 予想と結果を並べて表示するマーカー
// view: プレイヤー駒・足あとの差分更新API（アニメーション中はこちらのみ使う。draw全再構築はしない）
//   view.moveTo(pos): 通常移動（450ms、reduced-motion時は即時）
//   view.bounce(dir): 壁停止の演出（250ms、reduced-motion時は何もしない）
//   view.footprint(pos): 通過マスに足あとを追加
export function renderGrid({ grid, walls, goal, playerPos, labels = [], markers = [] }) {
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const board = document.createElement('div');
  board.className = 'grid-board relative inline-grid gap-1 bg-sky-100 p-1 rounded-xl';
  board.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
  board.style.gridTemplateRows = `repeat(${grid.rows}, ${CELL}px)`;

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell relative bg-white rounded-lg';
      cell.style.width = `${CELL}px`;
      cell.style.height = `${CELL}px`;
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);

      if (wallSet.has(`${x},${y}`)) {
        cell.innerHTML = shapeSvg('wall');
      } else if (goal && goal.x === x && goal.y === y) {
        cell.innerHTML = shapeSvg('goal');
      }

      const label = labels.find((l) => l.x === x && l.y === y);
      if (label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.option = label.id;
        btn.className =
          'grid-option absolute inset-0 flex items-center justify-center text-xl font-bold text-sky-700 bg-sky-200/70 rounded-lg';
        btn.textContent = label.id;
        cell.appendChild(btn);
      }

      markers
        .filter((m) => m.x === x && m.y === y)
        .forEach((m) => {
          const badge = document.createElement('div');
          badge.className = `grid-marker grid-marker-${m.kind} absolute inset-0 rounded-lg border-4 pointer-events-none flex items-end justify-center pb-0.5`;
          badge.classList.add(m.kind === 'predicted' ? 'border-amber-400' : 'border-emerald-500');
          const tag = document.createElement('span');
          tag.className = 'text-[10px] font-bold bg-white/80 rounded px-1';
          tag.textContent = m.kind === 'predicted' ? 'よそう' : 'けっか';
          badge.appendChild(tag);
          cell.appendChild(badge);
        });

      board.appendChild(cell);
    }
  }

  // プレイヤー駒はCSS Gridのセルに属さず、boardに対する絶対座標(transform)で位置を持つ。
  // セル間の移動をtransformのtransitionでなめらかにするため(Issue #55)。
  let pos = { ...playerPos };
  const token = document.createElement('div');
  token.className = 'grid-player absolute pointer-events-none';
  token.style.top = '0';
  token.style.left = '0';
  token.style.width = `${CELL}px`;
  token.style.height = `${CELL}px`;
  token.innerHTML = shapeSvg('player');
  token.style.transition = 'none';
  const start = pixelFor(pos);
  token.style.transform = `translate(${start.x}px, ${start.y}px)`;
  board.appendChild(token);

  const view = {
    moveTo(nextPos) {
      pos = { ...nextPos };
      const reduce = prefersReducedMotion();
      const px = pixelFor(pos);
      token.style.transition = reduce ? 'none' : `transform ${MOVE_MS}ms ease`;
      token.style.transform = `translate(${px.x}px, ${px.y}px)`;
      if (!reduce) window.__gridAnimLog.push({ type: 'move', ms: MOVE_MS });
    },
    bounce(dir) {
      if (prefersReducedMotion()) return;
      const base = pixelFor(pos);
      const [nx, ny] = NUDGE_BY_DIR[dir] ?? [0, 0];
      token.style.transition = `transform ${BOUNCE_MS / 2}ms ease`;
      token.style.transform = `translate(${base.x + nx}px, ${base.y + ny}px)`;
      setTimeout(() => {
        token.style.transform = `translate(${base.x}px, ${base.y}px)`;
      }, BOUNCE_MS / 2);
      window.__gridAnimLog.push({ type: 'bounce', ms: BOUNCE_MS });
    },
    footprint(footprintPos) {
      const px = pixelFor(footprintPos);
      const dot = document.createElement('div');
      dot.className = 'grid-footprint absolute pointer-events-none';
      dot.style.top = '0';
      dot.style.left = '0';
      dot.style.width = `${CELL}px`;
      dot.style.height = `${CELL}px`;
      dot.style.transform = `translate(${px.x}px, ${px.y}px)`;
      dot.innerHTML = `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
        <circle cx="32" cy="32" r="8" fill="#0284c7" fill-opacity="0.35" />
      </svg>`;
      board.insertBefore(dot, token);
    },
  };

  return { el: board, view };
}
