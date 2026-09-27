// SVGグリッド描画。すべて自作SVG（<img>・background-imageは使わない）。
const DEFAULT_CELL = 64;
const MIN_CELL = 8;
const MAX_CELL = 64;
const GAP_PX = 4; // Tailwind gap-1
const PAD_PX = 4; // Tailwind p-1
const MOVE_MS = 450;
const BOUNCE_MS = 250;
const BOUNCE_NUDGE_PX = 10;
const NUDGE_BY_DIR = { up: [0, -BOUNCE_NUDGE_PX], down: [0, BOUNCE_NUDGE_PX], left: [-BOUNCE_NUDGE_PX, 0], right: [BOUNCE_NUDGE_PX, 0] };
const CONFETTI_COUNT = 24;
const CONFETTI_MS = 1500;
const CONFETTI_COLORS = ['#f87171', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];
const COLLECT_MS = 220;

// 旗（ゴール共通パーツ）。星形はクリア演出・単元スタンプ専用にし、ゴール自体とは
// 見た目を分ける（Issue #80。予想では紛らわしいと誤解された）。
const FLAG_MARKUP = `<rect x="18" y="8" width="4" height="42" rx="2" fill="#475569" />
      <path d="M22 10 L46 18 L22 26 Z" fill="#f87171" stroke="#dc2626" stroke-width="1.5" stroke-linejoin="round" />`;

function shapeSvg(kind) {
  if (kind === 'wall') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="#94a3b8" />
    </svg>`;
  }
  if (kind === 'flag') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">${FLAG_MARKUP}</svg>`;
  }
  if (kind === 'goal') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">${FLAG_MARKUP}
      <text x="32" y="59" text-anchor="middle" font-size="12" font-weight="bold" fill="#0f172a">ゴール</text>
    </svg>`;
  }
  if (kind === 'item') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <ellipse cx="32" cy="40" rx="14" ry="16" fill="#b45309" />
      <path d="M18 30 Q32 14 46 30 Q32 24 18 30Z" fill="#78350f" />
      <rect x="29" y="10" width="6" height="8" rx="2" fill="#78350f" />
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

export { shapeSvg };

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// computeCellSize({cols, rows, width, height}) -> 8〜64の整数。
// 盤面エリアの実寸から1マスの大きさを決める（画面回転・端末差に追従。Issue #93）。
// 盤面全体（p-1の余白・gap込み）がエリアに収まることを最優先する。下限は0除算・負値の
// 防止のみを目的とした8px（見た目の下限ではない）。48px等の固定下限にすると、行数の多い
// 盤面＋文字拡大＋操作パネルが重なる極端な組み合わせでエリアより盤面が大きくなり、
// ロボットが隠れる事故が起きるため（Issue #99・#97）。盤面のマスはplay中はタップ対象では
// ないため、この下限撤廃はタップ領域64px規則（PROJECT.md）と衝突しない。predict/tutorialの
// 選択肢マスも操作パネル分の余白が無く、実運用でここまで縮む想定はしていない。
export function computeCellSize({ cols, rows, width, height, gap = GAP_PX }) {
  if (!cols || !rows || !width || !height) return DEFAULT_CELL;
  const fit = (size, n) => (size - PAD_PX * 2 - gap * (n - 1)) / n;
  const raw = Math.floor(Math.min(fit(width, cols), fit(height, rows)));
  return Math.min(MAX_CELL, Math.max(MIN_CELL, raw));
}

window.__gridAnimLog = window.__gridAnimLog || [];

// renderGrid({grid, walls, goal, items, playerPos, labels, cellSize}) -> { el, view }
// cellSize省略時はDEFAULT_CELL(64px)。呼び出し側がcomputeCellSize()で盤面エリアの実寸から算出する（Issue #93）。
// items: [{x, y}] どんぐり等の回収対象（Issue #60）。壁・ゴールと違い回収で個別に消えるため、
// board全再構築とは別にitemEls（座標キー）で個体管理する
// labels: [{id, x, y}] 予想ステップの選択肢ボタン
// view: プレイヤー駒・足あとの差分更新API（アニメーション中はこちらのみ使う。draw全再構築はしない）
//   view.moveTo(pos): 通常移動（450ms、reduced-motion時は即時）
//   view.bounce(dir): 壁停止の演出（250ms、reduced-motion時は何もしない）
//   view.footprint(pos): 通過マスに足あとを追加
//   view.markCell(pos, kind): 盤面を再構築せず印を重ねる（予想の答え合わせ・playのヒント。Issue #91）
//   view.hintItems(items) / view.clearHints(): 未回収itemの点滅とヒント表示の一括解除（Issue #91）
//   view.shrug(): 未達成時にロボットが首をかしげる（reduced-motion時は何もしない。Issue #91）
//   view.confetti(): ゴール紙ふぶき（粒子24個・1.5秒で除去、reduced-motion時は何もしない）
//   view.collectItem(pos): 該当マスのitemを回収演出付きで消す（reduced-motion時は即時に消す）
export function renderGrid({ grid, walls, goal, items = [], playerPos, labels = [], cellSize = DEFAULT_CELL }) {
  const CELL = cellSize;
  const pixelFor = (pos) => ({ x: PAD_PX + pos.x * (CELL + GAP_PX), y: PAD_PX + pos.y * (CELL + GAP_PX) });
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const board = document.createElement('div');
  board.className = 'grid-board relative inline-grid gap-1 bg-sky-100 p-1 rounded-xl';
  board.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
  board.style.gridTemplateRows = `repeat(${grid.rows}, ${CELL}px)`;
  // gap-1/p-1はrem単位のため、端末の文字サイズ拡大でpixelFor()・computeCellSize()の前提
  // （4px）とずれて盤面がはみ出す。px固定で上書きする（Issue #99）。
  board.style.gap = `${GAP_PX}px`;
  board.style.padding = `${PAD_PX}px`;

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
        cell.dataset.goal = 'true';
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

      board.appendChild(cell);
    }
  }

  // itemsはセルのinnerHTMLに焼き込まず、footprint同様に個別要素で持つ（回収時に個体を消すため）。
  const itemEls = new Map();
  items.forEach((it) => {
    const px = pixelFor(it);
    const el = document.createElement('div');
    el.className = 'grid-item absolute pointer-events-none';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = `${CELL}px`;
    el.style.height = `${CELL}px`;
    el.style.transform = `translate(${px.x}px, ${px.y}px)`;
    el.innerHTML = shapeSvg('item');
    board.appendChild(el);
    itemEls.set(`${it.x},${it.y}`, el);
  });

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
    collectItem(itemPos) {
      const key = `${itemPos.x},${itemPos.y}`;
      const el = itemEls.get(key);
      if (!el) return;
      itemEls.delete(key);
      if (prefersReducedMotion()) {
        el.remove();
        return;
      }
      const px = pixelFor(itemPos);
      el.style.transition = `transform ${COLLECT_MS}ms ease, opacity ${COLLECT_MS}ms ease`;
      el.style.transform = `translate(${px.x}px, ${px.y}px) scale(1.4)`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), COLLECT_MS);
    },
    // markCell(pos, kind): 既存の盤面を再構築せず（足あとを残したまま）マス上に印を重ねる。
    // kind: 'predicted' | 'result'（予想の答え合わせ）、'stopped' | 'goal-hint'（playの未達成ヒント）、
    // 'ghost'（チュートリアルの予定の道。番号付き。Issue #93）。
    // data-hint="true"を付け、clearHints()で一括除去できるようにする（Issue #91）。
    markCell(markerPos, kind, opts = {}) {
      const px = pixelFor(markerPos);
      const BORDER = {
        predicted: 'border-amber-400',
        result: 'border-emerald-500',
        wall: 'border-amber-400 bg-amber-200/40',
        stopped: 'border-sky-400',
        'goal-hint': 'border-amber-500',
        ghost: 'border-dashed border-sky-400 bg-sky-100/60',
      };
      const LABEL = { predicted: 'よそう', result: 'けっか' };
      const badge = document.createElement('div');
      const alignClass = kind === 'ghost' ? 'items-center' : 'items-end';
      badge.className = `grid-marker grid-marker-${kind} absolute pointer-events-none rounded-lg border-4 flex ${alignClass} justify-center pb-0.5 ${BORDER[kind] ?? 'border-slate-400'}`;
      badge.dataset.hint = 'true';
      badge.style.top = '0';
      badge.style.left = '0';
      badge.style.width = `${CELL}px`;
      badge.style.height = `${CELL}px`;
      badge.style.transform = `translate(${px.x}px, ${px.y}px)`;
      if (kind === 'ghost' && opts.order) {
        badge.dataset.ghostOrder = String(opts.order);
        const num = document.createElement('span');
        num.className = 'text-xs font-bold text-sky-700 bg-white/90 rounded-full w-5 h-5 flex items-center justify-center';
        num.textContent = String(opts.order);
        badge.appendChild(num);
      } else if (LABEL[kind]) {
        const tag = document.createElement('span');
        tag.className = 'text-[10px] font-bold bg-white/80 rounded px-1';
        tag.textContent = LABEL[kind];
        badge.appendChild(tag);
      }
      board.appendChild(badge);
      return badge;
    },
    // hintItems(items): 未回収itemを点滅させて残っていることを示す（Issue #91）。
    hintItems(items) {
      items.forEach((it) => {
        const el = itemEls.get(`${it.x},${it.y}`);
        if (!el) return;
        el.dataset.hint = 'true';
        el.classList.add('motion-safe:animate-pulse', 'ring-4', 'ring-amber-400', 'rounded-full');
      });
    },
    // clearHints(): markCell/hintItemsで付けた印を全て消す（命令を編集したら消える。Issue #91）。
    clearHints() {
      board.querySelectorAll('.grid-marker[data-hint="true"]').forEach((el) => el.remove());
      itemEls.forEach((el) => {
        delete el.dataset.hint;
        el.classList.remove('motion-safe:animate-pulse', 'ring-4', 'ring-amber-400', 'rounded-full');
      });
    },
    // shrug(): 未達成時にロボットが首をかしげる（reduced-motion時は何もしない。Issue #91）。
    shrug() {
      if (prefersReducedMotion()) return;
      const base = token.style.transform;
      token.animate(
        [
          { transform: `${base} rotate(0deg)` },
          { transform: `${base} rotate(-12deg)` },
          { transform: `${base} rotate(10deg)` },
          { transform: `${base} rotate(0deg)` },
        ],
        { duration: 500, easing: 'ease-in-out' }
      );
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
