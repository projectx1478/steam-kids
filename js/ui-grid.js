// SVGグリッド描画。すべて自作SVG（<img>・background-imageは使わない）。
const CELL = 64;
const GAP_PX = 4; // Tailwind gap-1
const PAD_PX = 4; // Tailwind p-1
const MOVE_MS = 450;
const BOUNCE_MS = 250;
const BOUNCE_NUDGE_PX = 10;
const NUDGE_BY_DIR = { up: [0, -BOUNCE_NUDGE_PX], down: [0, BOUNCE_NUDGE_PX], left: [-BOUNCE_NUDGE_PX, 0], right: [BOUNCE_NUDGE_PX, 0] };
const CONFETTI_COUNT = 24;
const CONFETTI_MS = 1500;
const CONFETTI_COLORS = ['#f87171', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];

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
      <rect x="12" y="16" width="40" height="34" rx="12" fill="#38bdf8" stroke="#0284c7" stroke-width="3" />
      <rect x="29" y="6" width="4" height="12" fill="#0284c7" />
      <circle cx="31" cy="6" r="4" fill="#fbbf24" />
      <circle cx="24" cy="32" r="6" fill="#f0f9ff" />
      <circle cx="40" cy="32" r="6" fill="#f0f9ff" />
      <circle data-pupil cx="24" cy="32" r="2.6" fill="#0f172a" />
      <circle data-pupil cx="40" cy="32" r="2.6" fill="#0f172a" />
      <rect data-eyelid x="18" y="26" width="12" height="12" fill="#38bdf8"
        style="transform-box:fill-box;transform-origin:center;transform:scaleY(0)" />
      <rect data-eyelid x="34" y="26" width="12" height="12" fill="#38bdf8"
        style="transform-box:fill-box;transform-origin:center;transform:scaleY(0)" />
    </svg>`;
  }
  return '';
}

const GAZE_OFFSET = { up: [0, -2.4], down: [0, 2.4], left: [-2.4, 0], right: [2.4, 0] };

function dirFromDelta(dx, dy) {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return null;
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
//   view.confetti(): ゴール紙ふぶき（粒子24個・1.5秒で除去、reduced-motion時は何もしない）
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

  const pupils = token.querySelectorAll('[data-pupil]');
  const eyelids = token.querySelectorAll('[data-eyelid]');

  function setGaze(dir) {
    if (!dir) return;
    const [gx, gy] = GAZE_OFFSET[dir] ?? [0, 0];
    pupils.forEach((p) => p.setAttribute('transform', `translate(${gx}, ${gy})`));
  }

  // まぶたの自己再スケジュール。token.isConnectedが外れたら自然に止まる
  // （drawBoard/drawStaticでboard.innerHTMLごと差し替えられるため、明示的な破棄は不要）
  function scheduleBlink() {
    if (prefersReducedMotion()) return;
    setTimeout(() => {
      if (!token.isConnected) return;
      eyelids.forEach((lid) => {
        lid.style.transition = 'transform 90ms ease';
        lid.style.transform = 'scaleY(1)';
      });
      setTimeout(() => {
        if (!token.isConnected) return;
        eyelids.forEach((lid) => (lid.style.transform = 'scaleY(0)'));
      }, 120);
      scheduleBlink();
    }, 2600 + Math.random() * 2000);
  }
  scheduleBlink();

  const view = {
    moveTo(nextPos) {
      const prevPos = pos;
      pos = { ...nextPos };
      setGaze(dirFromDelta(pos.x - prevPos.x, pos.y - prevPos.y));
      const reduce = prefersReducedMotion();
      const px = pixelFor(pos);
      token.style.transition = reduce ? 'none' : `transform ${MOVE_MS}ms ease`;
      token.style.transform = `translate(${px.x}px, ${px.y}px)`;
      if (!reduce) window.__gridAnimLog.push({ type: 'move', ms: MOVE_MS });
    },
    bounce(dir) {
      if (prefersReducedMotion()) return;
      setGaze(dir);
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
    confetti() {
      if (prefersReducedMotion()) return;
      const base = pixelFor(pos);
      const originX = base.x + CELL / 2;
      const originY = base.y + CELL / 2;
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + Math.random() * 0.4;
        const dist = 40 + Math.random() * 30;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 20;
        const piece = document.createElement('div');
        piece.className = 'grid-confetti absolute pointer-events-none rounded-sm';
        piece.style.width = '8px';
        piece.style.height = '8px';
        piece.style.top = '0';
        piece.style.left = '0';
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        piece.style.transform = `translate(${originX}px, ${originY}px)`;
        piece.style.opacity = '1';
        piece.style.transition = 'transform 900ms ease-out, opacity 600ms ease-in 700ms';
        board.appendChild(piece);
        requestAnimationFrame(() => {
          const rotate = Math.round(Math.random() * 720 - 360);
          piece.style.transform = `translate(${originX + dx}px, ${originY + dy}px) rotate(${rotate}deg)`;
          piece.style.opacity = '0';
        });
        setTimeout(() => piece.remove(), CONFETTI_MS);
      }
    },
  };

  return { el: board, view };
}
