// SVGグリッド描画。すべて自作SVG（<img>・background-imageは使わない）。
import { GIMMICKS } from './gimmicks/index.js';

const DEFAULT_CELL = 64;
const MIN_CELL = 8;
const MAX_CELL = 64;
const GAP_PX = 4; // Tailwind gap-1
const PAD_PX = 4; // Tailwind p-1
const MOVE_MS = 450;
const BOUNCE_MS = 250;
const BOUNCE_NUDGE_PX = 10;
const NUDGE_BY_DIR = { up: [0, -BOUNCE_NUDGE_PX], down: [0, BOUNCE_NUDGE_PX], left: [-BOUNCE_NUDGE_PX, 0], right: [BOUNCE_NUDGE_PX, 0] };
const CUSHION_MS = 450;
const BURST_MS = 350;
const DIZZY_MS = 1200;
const FALL_MS = 300;
// 壁に当たった時に弾ける星（ゴールの旗・クリアの星とは別の、黄色いギザギザ）。
const BURST_SVG = `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <path d="M32 6 L38 24 L58 20 L44 34 L56 50 L36 44 L30 60 L26 42 L6 46 L20 32 L8 16 L28 22 Z" fill="#fde047" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round" />
    </svg>`;
// 目を回すロボットの頭上で回る小さな星3つ（壁衝突の演出。Issue #168）。
const DIZZY_SVG = `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      ${[[32, 10], [10, 46], [54, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#fde047" stroke="#f59e0b" stroke-width="3" />`).join('')}
    </svg>`;
const CONFETTI_COUNT = 24;
const CONFETTI_MS = 1500;
const CONFETTI_COLORS = ['#f87171', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];
// ITEM_FLY_MS: どんぐり回収時、拡大しながら浮いて消えるまでの時間（Issue #110）。
const ITEM_FLY_MS = 600;
const DANCE_MS = 800;
const DANCE_STAR_COUNT = 8;
const POP_IN_MS = 300;
const DIM_MS = 200;

// 旗（ゴール共通パーツ）。星形はクリア演出・単元スタンプ専用にし、ゴール自体とは
// 見た目を分ける（Issue #80。予想では紛らわしいと誤解された）。
const FLAG_MARKUP = `<rect x="18" y="8" width="4" height="42" rx="2" fill="#475569" />
      <path d="M22 10 L46 18 L22 26 Z" fill="#f87171" stroke="#dc2626" stroke-width="1.5" stroke-linejoin="round" />`;

// MOUTH_PATH: ロボットの口の形（setMoodで切り替え。Issue #110）。front=正面、side=横顔（Issue #146）。
const MOUTH_PATH = {
  front: {
    normal: 'M26 38 Q32 38 38 38',
    happy: 'M25 37 Q32 45 39 37',
    puzzled: 'M26 39 Q32 34 38 39',
  },
  side: {
    normal: 'M39 38 Q44 38 48 38',
    happy: 'M38 37 Q44 45 49 37',
    puzzled: 'M39 40 Q44 35 48 40',
  },
};

// ロボットの向きごとの絵（Issue #146）。光は左上から。頭の上面を明るく・下に厚み・足元に影。
// 向き=最後に進んだ方向（見た目のみ）。leftはrightの左右反転。
const ROBOT_SHADOW = '<ellipse cx="32" cy="58" rx="17" ry="4.5" fill="#1e293b" opacity="0.28" />';
const ROBOT_FRONT = `${ROBOT_SHADOW}
      <rect x="17" y="49" width="10" height="8" rx="3" fill="#334155" />
      <rect x="37" y="49" width="10" height="8" rx="3" fill="#334155" />
      <rect x="30" y="4" width="4" height="10" fill="#0284c7" />
      <circle cx="32" cy="5" r="4" fill="#fbbf24" />
      <rect x="11" y="18" width="42" height="34" rx="11" fill="#0369a1" />
      <rect x="11" y="12" width="42" height="34" rx="11" fill="#38bdf8" stroke="#0284c7" stroke-width="2.5" />
      <rect x="16" y="14" width="32" height="7" rx="4" fill="#bae6fd" opacity="0.7" />
      <circle cx="19" cy="37" r="3" fill="#f472b6" opacity="0.5" />
      <circle cx="45" cy="37" r="3" fill="#f472b6" opacity="0.5" />
      <circle cx="24" cy="28" r="6" fill="#f0f9ff" />
      <circle cx="40" cy="28" r="6" fill="#f0f9ff" />
      <circle cx="24" cy="30" r="2.6" fill="#0f172a" />
      <circle cx="40" cy="30" r="2.6" fill="#0f172a" />
      <rect data-eyelid x="18" y="22" width="12" height="12" fill="#38bdf8"
        style="transform-box:fill-box;transform-origin:center;transform:scaleY(0)" />
      <rect data-eyelid x="34" y="22" width="12" height="12" fill="#38bdf8"
        style="transform-box:fill-box;transform-origin:center;transform:scaleY(0)" />
      <path data-mouth="front" d="${MOUTH_PATH.front.normal}" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />`;
const ROBOT_SIDE = `${ROBOT_SHADOW}
      <rect x="22" y="49" width="14" height="8" rx="3" fill="#334155" />
      <rect x="24" y="4" width="4" height="10" fill="#0284c7" />
      <circle cx="26" cy="5" r="4" fill="#fbbf24" />
      <rect x="12" y="18" width="38" height="34" rx="11" fill="#0369a1" />
      <rect x="12" y="12" width="38" height="34" rx="11" fill="#38bdf8" stroke="#0284c7" stroke-width="2.5" />
      <rect x="12" y="12" width="14" height="34" rx="9" fill="#0ea5e9" />
      <rect x="16" y="14" width="30" height="7" rx="4" fill="#bae6fd" opacity="0.7" />
      <rect x="46" y="24" width="8" height="14" rx="4" fill="#0284c7" />
      <circle cx="40" cy="36" r="3" fill="#f472b6" opacity="0.5" />
      <circle cx="40" cy="28" r="6" fill="#f0f9ff" />
      <circle cx="42.4" cy="28" r="2.6" fill="#0f172a" />
      <rect data-eyelid x="34" y="22" width="12" height="12" fill="#38bdf8"
        style="transform-box:fill-box;transform-origin:center;transform:scaleY(0)" />
      <path data-mouth="side" d="${MOUTH_PATH.side.normal}" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />`;
const ROBOT_BACK = `${ROBOT_SHADOW}
      <rect x="17" y="49" width="10" height="8" rx="3" fill="#334155" />
      <rect x="37" y="49" width="10" height="8" rx="3" fill="#334155" />
      <rect x="30" y="4" width="4" height="10" fill="#0284c7" />
      <circle cx="32" cy="5" r="4" fill="#fbbf24" />
      <rect x="11" y="18" width="42" height="34" rx="11" fill="#075985" />
      <rect x="11" y="12" width="42" height="34" rx="11" fill="#0ea5e9" stroke="#0284c7" stroke-width="2.5" />
      <rect x="16" y="14" width="32" height="7" rx="4" fill="#7dd3fc" opacity="0.6" />
      <rect x="20" y="24" width="24" height="15" rx="4" fill="#0284c7" />
      <path d="M24 28H40M24 32H40M24 36H40" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" />`;
const ROBOT_FACINGS = {
  down: ROBOT_FRONT,
  right: ROBOT_SIDE,
  left: `<g transform="translate(64,0) scale(-1,1)">${ROBOT_SIDE}</g>`,
  up: ROBOT_BACK,
};

function shapeSvg(kind) {
  if (kind === 'wall') {
    // 一段高い台。上の面（明）＋手前の側面（暗）＋足元の影で疑似立体にする（アイソメトリックは
    // 座標計算が崩れるため採らない。Issue #110→#146）。
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <rect x="2" y="12" width="60" height="50" rx="8" fill="#1e293b" opacity="0.18" />
      <rect x="3" y="10" width="58" height="50" rx="8" fill="#57534e" />
      <rect x="3" y="3" width="58" height="48" rx="8" fill="#a8a29e" />
      <rect x="7" y="6" width="50" height="40" rx="6" fill="#d6d3d1" />
      <path d="M11 10 H30" stroke="#f5f5f4" stroke-width="3" stroke-linecap="round" />
    </svg>`;
  }
  if (kind === 'flag') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">${FLAG_MARKUP}</svg>`;
  }
  if (kind === 'goal') {
    // 土台と光沢のある旗＋接地影＋キラキラ（reduced-motion時はgoal-sparkleのanimationが掛からず
    // 静止表示。Issue #110→#146）。「ゴール」の文字は土台と重ならないよう右下へ寄せる。
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <ellipse cx="30" cy="55" rx="17" ry="5" fill="#1e293b" opacity="0.25" />
      <ellipse cx="20" cy="52" rx="10" ry="4" fill="#78350f" />
      <rect x="10" y="47" width="20" height="5" fill="#92400e" />
      <ellipse cx="20" cy="47" rx="10" ry="4" fill="#d97706" />
      <rect x="18" y="6" width="4" height="42" rx="2" fill="#475569" />
      <rect x="18" y="6" width="1.5" height="42" fill="#94a3b8" />
      <path d="M22 8 Q34 10 46 16 Q34 20 22 24 Z" fill="#ef4444" />
      <path d="M22 8 Q30 10 36 13 Q30 15 22 16 Z" fill="#fca5a5" />
      <circle cx="20" cy="6" r="3" fill="#fbbf24" />
      <circle class="goal-sparkle" cx="10" cy="16" r="2" fill="#fde68a" style="animation-delay:0s" />
      <circle class="goal-sparkle" cx="52" cy="26" r="1.6" fill="#fef9c3" style="animation-delay:0.4s" />
      <circle class="goal-sparkle" cx="8" cy="36" r="1.4" fill="#fde68a" style="animation-delay:0.8s" />
      <text x="47" y="60" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">ゴール</text>
    </svg>`;
  }
  if (kind === 'item') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <ellipse cx="32" cy="56" rx="12" ry="4" fill="#1e293b" opacity="0.25" />
      <ellipse cx="32" cy="40" rx="14" ry="16" fill="#92400e" />
      <ellipse cx="28" cy="38" rx="10" ry="13" fill="#b45309" />
      <ellipse cx="25" cy="36" rx="3" ry="6" fill="#fbbf24" opacity="0.55" />
      <path d="M17 30 Q32 12 47 30 Q32 25 17 30Z" fill="#78350f" />
      <path d="M20 27 Q32 16 42 24" fill="none" stroke="#a16207" stroke-width="2" />
      <rect x="29" y="9" width="6" height="8" rx="2" fill="#78350f" />
    </svg>`;
  }
  if (kind === 'player') {
    // 向きを持つ立体ロボット（Issue #146）。4つの向きを<g data-facing>で持ち、setFacingで表示を切り替える。
    // 口はdata-mouth（front/side）でsetMoodにより切り替える。初期は正面。
    const groups = Object.entries(ROBOT_FACINGS)
      .map(([dir, markup]) => `<g data-facing="${dir}"${dir === 'down' ? '' : ' style="display:none"'}>${markup}</g>`)
      .join('');
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">${groups}</svg>`;
  }
  return '';
}

function dirFromDelta(dx, dy) {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return null;
}

export { shapeSvg };

// setMoodIn(rootEl, mood): rootEl内のロボット（shapeSvg('player')）の口の形を切り替える。
// renderGrid外（シーソー画面など）で表情を再利用するための入口（Issue #150）。
export function setMoodIn(rootEl, mood) {
  rootEl.querySelectorAll('[data-mouth]').forEach((m) => {
    const set = MOUTH_PATH[m.dataset.mouth];
    m.setAttribute('d', set[mood] ?? set.normal);
  });
}

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
export function computeCellSize({ cols, rows, width, height, gap = GAP_PX, maxCell = MAX_CELL }) {
  if (!cols || !rows || !width || !height) return DEFAULT_CELL;
  const fit = (size, n) => (size - PAD_PX * 2 - gap * (n - 1)) / n;
  const raw = Math.floor(Math.min(fit(width, cols), fit(height, rows)));
  return Math.min(maxCell, Math.max(MIN_CELL, raw));
}

// 横向きは盤面｜操作パネルの左右分割で盤面が広く取れるため、セル上限を引き上げる（Issue #156）。
const SPLIT_MAX_CELL = 120;
export function splitMaxCell(portraitMax = MAX_CELL) {
  return window.matchMedia('(orientation: landscape)').matches ? SPLIT_MAX_CELL : portraitMax;
}

window.__gridAnimLog = window.__gridAnimLog || [];

// renderGrid({grid, walls, goal, items, ice, playerPos, labels, cellSize}) -> { el, view }
// cellSize省略時はDEFAULT_CELL(64px)。呼び出し側がcomputeCellSize()で盤面エリアの実寸から算出する（Issue #93）。
// items: [{x, y}] どんぐり等の回収対象（Issue #60）。壁・ゴールと違い回収で個別に消えるため、
// board全再構築とは別にitemEls（座標キー）で個体管理する
// labels: [{id, x, y}] 予想ステップの選択肢ボタン
// view: プレイヤー駒・足あとの差分更新API（アニメーション中はこちらのみ使う。draw全再構築はしない）
//   view.moveTo(pos): 通常移動（450ms、reduced-motion時は即時）
//   view.bounce(dir, kind): 衝突の演出（kind='wall'|'cushion'、250ms〜、reduced-motion時は何もしない。'wall'は約1.2秒の目回し星を出し、reduced-motion時は静止表示。Issue #168）
//   view.fallOver(): 壁衝突でロボットが横に倒れる（300ms ease-outで倒れ、倒れたまま保持。reduced-motion時は何もしない。Issue #214）
//   view.footprint(pos): 通過マスに足あとを追加
//   view.markCell(pos, kind): 盤面を再構築せず印を重ねる（予想の答え合わせ・playのヒント。Issue #91）
//   view.hintItems(items) / view.clearHints(): 未回収itemの点滅とヒント表示の一括解除（Issue #91）
//   view.shrug(): 未達成時にロボットが首をかしげる（困り顔になる。reduced-motion時は何もしない。Issue #91）
//   view.confetti(): ゴール紙ふぶき（粒子24個・1.5秒で除去、reduced-motion時は何もしない）
//   view.collectItem(pos): 該当マスのitemを回収演出付きで消す（reduced-motion時は即時に消す）
//   view.setMood('normal'|'happy'|'puzzled'): ロボットの口の形を切り替える（Issue #110）
//   view.celebrateDance(): クリア時にロボットが弾み跳ね、星が舞う（reduced-motion時は何もしない。Issue #110）
//   view.dim(on): 盤面のマスだけを暗くする（失敗リザルト状態の表示。Issue #110）
//   view.popIn(): もういちど直後、ロボットがポンと現れる演出（reduced-motion時は何もしない。Issue #110）
export function renderGrid(opts) {
  const { grid, walls, goal, playerPos, cellSize = DEFAULT_CELL, labels = [] } = opts;
  const CELL = cellSize;
  const pixelFor = (pos) => ({ x: PAD_PX + pos.x * (CELL + GAP_PX), y: PAD_PX + pos.y * (CELL + GAP_PX) });
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const board = document.createElement('div');
  board.className = 'grid-board relative inline-grid gap-1 wood-frame p-1 rounded-xl';
  board.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
  board.style.gridTemplateRows = `repeat(${grid.rows}, ${CELL}px)`;
  // gap-1/p-1はrem単位のため、端末の文字サイズ拡大でpixelFor()・computeCellSize()の前提
  // （4px）とずれて盤面がはみ出す。px固定で上書きする（Issue #99）。
  board.style.gap = `${GAP_PX}px`;
  board.style.padding = `${PAD_PX}px`;

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell relative grid-tile-3d';
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

  // dimLayer: 不正解時に盤面だけを暗くする層（Issue #110）。セルの直後・item/token/markerより
  // 前に置くことで、DOM順による重なり順そのままで「マスの上・駒やヒントの下」になる。
  // pointer-events-noneでタップは通す。
  const dimLayer = document.createElement('div');
  dimLayer.className = 'grid-dim absolute inset-0 rounded-xl bg-slate-900/35 pointer-events-none';
  dimLayer.style.opacity = '0';
  dimLayer.dataset.active = 'false';
  board.appendChild(dimLayer);

  // itemsはセルのinnerHTMLに焼き込まず、footprint同様に個別要素で持つ（回収時に個体を消すため）。
  // 生成は各ギミックのrenderフックに委譲する（Issue #123・#61）。ctxはrenderGridの引数＋描画補助。
  // collectItem等のview APIはitemsギミックの戻り値（座標キー→要素のMap）を参照する。
  const renderCtx = { ...opts, board, pixelFor, CELL, shapeSvg };
  const gimmickEls = {};
  for (const g of GIMMICKS) gimmickEls[g.key] = g.render?.(renderCtx);
  const itemEls = gimmickEls.items;

  // プレイヤー駒はCSS Gridのセルに属さず、boardに対する絶対座標(transform)で位置を持つ。
  // セル間の移動をtransformのtransitionでなめらかにするため(Issue #55)。
  let pos = { ...playerPos };
  const token = document.createElement('div');
  token.className = 'grid-player absolute pointer-events-none';
  token.style.top = '0';
  token.style.left = '0';
  token.style.width = `${CELL}px`;
  token.style.height = `${CELL}px`;
  // 姿勢専用の内側要素。tokenのtransformはtranslate(位置)専用とし、倒れる等の姿勢変化は
  // body側で行う（位置演出との合成でtranslateがずれないため。Issue #214）。
  const body = document.createElement('div');
  body.className = 'grid-player-body w-full h-full';
  body.innerHTML = shapeSvg('player');
  token.appendChild(body);
  token.style.transition = 'none';
  const start = pixelFor(pos);
  token.style.transform = `translate(${start.x}px, ${start.y}px)`;
  board.appendChild(token);

  const facings = token.querySelectorAll('[data-facing]');
  const eyelids = token.querySelectorAll('[data-eyelid]');
  const mouths = token.querySelectorAll('[data-mouth]');

  // setFacing(dir): 'up'|'down'|'left'|'right'。向きは見た目のみ（命令の意味は変わらない。Issue #146）。
  function setFacing(dir) {
    if (!dir) return;
    facings.forEach((g) => (g.style.display = g.dataset.facing === dir ? '' : 'none'));
  }

  // setMood(mood): 'normal'|'happy'|'puzzled'。口の形だけを切り替える（Issue #110）。
  function setMood(mood) {
    mouths.forEach((m) => {
      const set = MOUTH_PATH[m.dataset.mouth];
      m.setAttribute('d', set[mood] ?? set.normal);
    });
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

  // showDizzy(reduce): 壁衝突後、頭上で星が回りロボットが小さく揺れる（DIZZY_MS後に消える）。
  // reduced-motion時は回転・揺れを止めて星を静止表示する（Issue #168）。
  function showDizzy(reduce) {
    token.querySelector('.grid-dizzy')?.remove();
    const stars = document.createElement('div');
    stars.className = 'grid-dizzy absolute pointer-events-none';
    stars.style.width = `${CELL * 0.6}px`;
    stars.style.height = `${CELL * 0.6}px`;
    stars.style.left = `${CELL * 0.2}px`;
    stars.style.top = `${-CELL * 0.2}px`;
    stars.innerHTML = DIZZY_SVG;
    token.appendChild(stars);
    if (!reduce) {
      stars.animate([{ rotate: '0deg' }, { rotate: '720deg' }], { duration: DIZZY_MS });
      token.animate([{ rotate: '0deg' }, { rotate: '-5deg' }, { rotate: '5deg' }, { rotate: '-5deg' }, { rotate: '5deg' }, { rotate: '0deg' }], { duration: DIZZY_MS, easing: 'ease-in-out' });
    }
    setTimeout(() => stars.remove(), DIZZY_MS);
  }

  const view = {
    gimmickEls,
    moveTo(nextPos) {
      const prevPos = pos;
      pos = { ...nextPos };
      setFacing(dirFromDelta(pos.x - prevPos.x, pos.y - prevPos.y));
      const reduce = prefersReducedMotion();
      const px = pixelFor(pos);
      // drawBoard直後の同一タスクで呼ばれても1歩目にtransitionが乗るよう、開始位置のスタイルを確定させる
      void token.offsetWidth;
      token.style.transition = reduce ? 'none' : `transform ${MOVE_MS}ms ease`;
      token.style.transform = `translate(${px.x}px, ${px.y}px)`;
      if (!reduce) window.__gridAnimLog.push({ type: 'move', ms: MOVE_MS });
    },
    // bounce(dir, kind): 'wall'は痛そうに震えて星が弾ける（口は困り顔のまま）、'cushion'はクッションが
    // 凹んでふわっと押し返し、ロボットがばねのように戻る（口はにっこり）。
    bounce(dir, kind = 'wall') {
      setFacing(dir);
      const reduce = prefersReducedMotion();
      if (kind === 'wall') showDizzy(reduce);
      if (reduce) return;
      const base = pixelFor(pos);
      const [nx, ny] = NUDGE_BY_DIR[dir] ?? [0, 0];
      const at = (k) => `translate(${base.x + nx * k}px, ${base.y + ny * k}px)`;
      window.__gridAnimLog.push({ type: 'bounce', ms: BOUNCE_MS, kind });
      if (kind === 'cushion') {
        const sx = nx !== 0 ? 0.7 : 1.15;
        const sy = ny !== 0 ? 0.7 : 1.15;
        const cell = board.querySelector(`.grid-cell[data-x="${pos.x + Math.sign(nx)}"][data-y="${pos.y + Math.sign(ny)}"]`);
        cell?.querySelector('.grid-cushion-svg')?.animate(
          [{ transform: 'scale(1)' }, { transform: `scale(${sx}, ${sy})`, offset: 0.25 }, { transform: 'scale(1.08)', offset: 0.6 }, { transform: 'scale(1)' }],
          { duration: CUSHION_MS, easing: 'ease-out' }
        );
        token.style.transition = `transform ${BOUNCE_MS / 2}ms ease`;
        token.style.transform = at(1);
        setMood('happy');
        setTimeout(() => {
          token.style.transition = `transform ${CUSHION_MS - BOUNCE_MS / 2}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
          token.style.transform = at(0);
        }, BOUNCE_MS / 2);
        setTimeout(() => {
          if (token.isConnected) setMood('normal');
        }, CUSHION_MS);
        return;
      }
      token.animate(
        [{ transform: at(0) }, { transform: at(1.4), offset: 0.2 }, { transform: at(-0.4), offset: 0.45 }, { transform: at(0.25), offset: 0.7 }, { transform: at(0) }],
        { duration: BOUNCE_MS + 100, easing: 'ease-out' }
      );
      setMood('puzzled');
      const burst = document.createElement('div');
      burst.className = 'grid-burst absolute pointer-events-none';
      burst.style.top = '0';
      burst.style.left = '0';
      burst.style.width = `${CELL}px`;
      burst.style.height = `${CELL}px`;
      burst.style.transform = `translate(${base.x + Math.sign(nx) * CELL * 0.45}px, ${base.y + Math.sign(ny) * CELL * 0.45}px)`;
      burst.innerHTML = BURST_SVG;
      board.appendChild(burst);
      burst.animate([{ opacity: 1, scale: '0.4' }, { opacity: 1, scale: '1.1', offset: 0.4 }, { opacity: 0, scale: '1.3' }], { duration: BURST_MS });
      setTimeout(() => burst.remove(), BURST_MS);
    },
    // fallOver(): 壁衝突でロボットが横に倒れる（FALL_MS ease-outで倒れ、倒れたまま保持。
    // reduced-motion時は何もしない。Issue #214）。token(translate)ではなく内側の姿勢要素を
    // 倒すため、bounceのnudge等の位置演出と重なってもマス位置はずれない。retryでdrawBoardが
    // 駒を作り直すと姿勢は初期値に戻る（追加のリセット処理は不要）。
    fallOver() {
      if (prefersReducedMotion()) return;
      body.style.transition = `transform ${FALL_MS}ms ease-out`;
      body.style.transform = 'rotate(90deg) translateY(8px)';
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
    // collectItem(pos): 拾ったどんぐりをポヨンと拡大・浮遊させて消す（+1ポップアップ付き。
    // reduced-motion時は演出なしで即座に消す。Issue #110）。
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
      el.style.transition = `transform ${ITEM_FLY_MS}ms cubic-bezier(0.3, 0.5, 0.4, 1), opacity ${ITEM_FLY_MS}ms ease`;
      el.style.transform = `translate(${px.x}px, ${px.y - 36}px) scale(1.6)`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), ITEM_FLY_MS);

      const plusOne = document.createElement('div');
      plusOne.className = 'grid-item-plus absolute pointer-events-none text-sm font-bold text-amber-600';
      plusOne.style.top = '0';
      plusOne.style.left = '0';
      plusOne.style.transform = `translate(${px.x + CELL / 2 - 8}px, ${px.y}px)`;
      plusOne.style.opacity = '1';
      plusOne.style.transition = `transform ${ITEM_FLY_MS}ms ease, opacity ${ITEM_FLY_MS}ms ease`;
      plusOne.textContent = '+1';
      board.appendChild(plusOne);
      requestAnimationFrame(() => {
        plusOne.style.transform = `translate(${px.x + CELL / 2 - 8}px, ${px.y - 40}px)`;
        plusOne.style.opacity = '0';
      });
      setTimeout(() => plusOne.remove(), ITEM_FLY_MS);
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
    // 口も困り顔（puzzled）にする（Issue #110）。
    shrug() {
      if (prefersReducedMotion()) return;
      setMood('puzzled');
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
    // setMood('normal'|'happy'|'puzzled'): 口の形だけ切り替える（Issue #110）。
    setMood,
    // dim(on): 盤面のマスだけを暗くする（失敗リザルト状態の表示。Issue #110）。マスより上・
    // 足あと/印/ロボットより下（DOM順で担保。renderGrid冒頭のdimLayer参照）。
    dim(on) {
      dimLayer.style.transition = prefersReducedMotion() ? 'none' : `opacity ${DIM_MS}ms ease`;
      dimLayer.style.opacity = on ? '1' : '0';
      dimLayer.dataset.active = String(Boolean(on));
    },
    // popIn(): 「もういちど」で盤面を作り直した直後、ロボットがポンと現れる演出
    // （再スタート状態を視覚で伝える。reduced-motion時は何もしない。Issue #110）。
    popIn() {
      if (prefersReducedMotion()) return;
      const base = token.style.transform;
      token.animate(
        [
          { transform: `${base} scale(0.4)`, opacity: 0.6 },
          { transform: `${base} scale(1.15)`, opacity: 1 },
          { transform: `${base} scale(1)`, opacity: 1 },
        ],
        { duration: POP_IN_MS, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
    },
    // confetti({count, duration}): ゴール紙ふぶき。既定は24個・1.5秒（reduced-motion時は何もしない）。
    // ステージクリア演出（Issue #104）ではcountを増やして使う。
    confetti({ count = CONFETTI_COUNT, duration = CONFETTI_MS } = {}) {
      if (prefersReducedMotion()) return;
      const base = pixelFor(pos);
      const originX = base.x + CELL / 2;
      const originY = base.y + CELL / 2;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
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
        setTimeout(() => piece.remove(), duration);
      }
    },
    // celebrateDance(): クリア時にロボットが弾み跳ねて喜び、周りに星が飛ぶ（reduced-motion時は
    // 何もしない）。回転は加えない（キャラ本体のtransformに回転成分を持たせないテスト
    // 前提=a3-goal-confetti.mjsを維持するため。Issue #104→#110）。
    celebrateDance() {
      setFacing('down'); // 背中向きのままだと喜ぶ顔が見えないため正面へ向き直す（Issue #146）
      if (prefersReducedMotion()) return;
      const base = token.style.transform;
      token.animate(
        [
          { transform: `${base} translateY(0) scale(1)` },
          { transform: `${base} translateY(-16px) scale(1.12)` },
          { transform: `${base} translateY(0) scale(0.96)` },
          { transform: `${base} translateY(-10px) scale(1.08)` },
          { transform: `${base} translateY(0) scale(1)` },
        ],
        { duration: DANCE_MS, easing: 'ease-in-out' }
      );
      const origin = pixelFor(pos);
      const originX = origin.x + CELL / 2;
      const originY = origin.y + CELL / 2;
      for (let i = 0; i < DANCE_STAR_COUNT; i += 1) {
        const angle = (Math.PI * 2 * i) / DANCE_STAR_COUNT;
        const dist = 34 + Math.random() * 18;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 10;
        const star = document.createElement('div');
        star.className = 'grid-celebrate-star absolute pointer-events-none w-3.5 h-3.5';
        star.style.top = '0';
        star.style.left = '0';
        star.style.transform = `translate(${originX - 7}px, ${originY - 7}px) scale(0.4) rotate(0deg)`;
        star.style.opacity = '1';
        star.style.transition = 'transform 700ms ease-out, opacity 500ms ease-in 400ms';
        star.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,1 15,9 23,9 16,14 19,22 12,17 5,22 8,14 1,9 9,9" fill="#fbbf24" /></svg>';
        board.appendChild(star);
        requestAnimationFrame(() => {
          const rotate = Math.round(Math.random() * 180 - 90);
          star.style.transform = `translate(${originX - 7 + dx}px, ${originY - 7 + dy}px) scale(1) rotate(${rotate}deg)`;
          star.style.opacity = '0';
        });
        setTimeout(() => star.remove(), 900);
      }
    },
  };

  return { el: board, view };
}

// screenConfetti({count, duration, colors}): 画面全体を使う紙ふぶき（レッスンクリア・単元クリア用。
// Issue #104）。grid-boardの座標系に依存せず、document.bodyへfixedで重ねて上から降らせる。
// reduced-motion時は何もしない。
export function screenConfetti({ count = CONFETTI_COUNT, duration = CONFETTI_MS, colors = CONFETTI_COLORS } = {}) {
  if (prefersReducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'screen-confetti fixed inset-0 pointer-events-none z-50';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'absolute rounded-sm';
    const size = 6 + Math.random() * 6;
    const fallDuration = duration * (0.7 + Math.random() * 0.6);
    const delay = Math.random() * duration * 0.3;
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.top = '-20px';
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.transform = 'translateY(0) rotate(0deg)';
    piece.style.opacity = '1';
    piece.style.transition = `transform ${fallDuration}ms ease-in ${delay}ms, opacity 400ms ease-in ${delay + fallDuration - 400}ms`;
    layer.appendChild(piece);
    requestAnimationFrame(() => {
      const rotate = Math.round(Math.random() * 720 - 360);
      piece.style.transform = `translateY(${window.innerHeight + 40}px) rotate(${rotate}deg)`;
      piece.style.opacity = '0';
    });
  }
  setTimeout(() => layer.remove(), duration + 500);
}
