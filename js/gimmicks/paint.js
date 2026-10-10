// paint（色ぬり）ギミック：通ったマス（startを含む）に色がつき、最後の塗りが目標の模様と同じときだけクリア
// （塗り残し・目標外を塗るのどちらも失敗。Issue #286）。目標は spec.paint（{x,y}の配列）。同じマスを
// 何度通っても塗りは変わらない（上書き・2色目は扱わない）。全回収（itemsのどんぐり）は「全部のマスを通る」
// ことが目的だが、こちらは「通ってよいマス・いけないマス」を区別して形を作る。
// 状態は不変更新（BFSが同じstateを複数の分岐へ使い回すため）。

const keyOf = (p) => `${p.x},${p.y}`;
const list = (v) => (Array.isArray(v) ? v : []);

// 塗ったマスの絵（盤面とみほんミニ盤で共用）。黄（amber-300）のマス全面＋大きな白い丸（縁つき）。
// 足あと（水色の半透明・小さい丸 r=8）・どんぐり（茶色の実）とは、色・大きさ・マス全面の塗りで区別する。
// 図形は丸（クリア演出の星と被らないため）。
export const PAINT_FILL = '#fcd34d';
export function paintSvg(extraClass = '') {
  return `<svg viewBox="0 0 64 64" class="grid-paint-svg ${extraClass} absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="10" fill="${PAINT_FILL}" />
      <circle cx="32" cy="32" r="18" fill="#fffbeb" stroke="#d97706" stroke-width="4" />
    </svg>`;
}

const FADE_MS = 300;

export const paint = {
  key: 'paint',

  // state: { painted: Set<number>（塗ったマスの y*cols+x）, target: Set<number>|null（目標。paint無しはnull）, cols }
  initState(spec) {
    const cols = spec.grid?.cols ?? 0;
    const cells = list(spec.paint);
    return { painted: new Set(), target: cells.length > 0 ? new Set(cells.map((c) => c.y * cols + c.x)) : null, cols };
  },

  enter(state, pos) {
    if (!state.target) return state;
    const idx = pos.y * state.cols + pos.x;
    if (state.painted.has(idx)) return state;
    return { ...state, painted: new Set(state.painted).add(idx) };
  },

  // 最終の塗り＝目標のときだけ真（目標無し＝paint未使用は常に真）。
  isCleared(state) {
    if (!state.target) return true;
    if (state.painted.size !== state.target.size) return false;
    for (const idx of state.painted) if (!state.target.has(idx)) return false;
    return true;
  },

  // 6×6・手数12でも32bit上限に掛からないよう、ビットマスクではなく塗ったマス番号の昇順列を使う。
  stateKey(state) {
    return `paint:${[...state.painted].sort((a, b) => a - b).join(',')}`;
  },

  // 目標外を塗った状態は二度とクリアできない（塗りは増える一方）。BFSの枝刈り用（最短手数は変わらない）。
  dead(state) {
    if (!state.target) return false;
    for (const idx of state.painted) if (!state.target.has(idx)) return true;
    return false;
  },

  // 目標外を塗ったマス（失敗時に盤面側で枠を出す対象）。paint未使用は[]。
  overCells(state) {
    if (!state?.target) return [];
    return [...state.painted].filter((idx) => !state.target.has(idx)).map((idx) => ({ x: idx % state.cols, y: Math.floor(idx / state.cols) }));
  },

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す。
  strip(spec) {
    return { ...spec, paint: [] };
  },

  // createStepperが1手進むたびに呼ぶ。通ったマスへ塗りを出す（0.3秒のフェード。reduced-motion時は即時）。
  // startの塗りはrenderが初期描画する。runは実行ごとの作業領域（drawBoardで盤面ごと作り直すので
  // 実行開始時に塗りは空へ戻る）。
  onStep({ pos, spec, view }) {
    if (list(spec.paint).length === 0) return undefined;
    view.gimmickEls?.paint?.paintAt(pos, true);
    return undefined;
  },

  // 盤面の妥当性。目標は盤内・壁と重ならず、startとgoalを含む。paint単独（かべ以外のギミックと併用不可）、6×6以内。
  validate(board, add, label) {
    if (board.paint === undefined) return;
    if (!Array.isArray(board.paint) || board.paint.length === 0) {
      add('盤面の妥当性', `${label}paint が空、または配列でない`);
      return;
    }
    const grid = board.grid || {};
    if (grid.cols > 6 || grid.rows > 6) add('盤面の妥当性', `${label}paintのある盤面は6×6以内（${grid.cols}×${grid.rows}）`);
    for (const field of ['items', 'ice', 'cushion', 'warp', 'keys', 'doors', 'switches', 'periodic']) {
      if (list(board[field]).length > 0) add('盤面の妥当性', `${label}paint は${field}と併用できない（paint単独。かべのみ可）`);
    }
    if (board.repeatBox === true || board.groupRepeats === true) add('盤面の妥当性', `${label}paint は repeatBox・groupRepeats と併用できない（4方向のみ）`);
    const walls = new Set(list(board.walls).map(keyOf));
    const waterCells = new Set(list(board.water).map(keyOf));
    const seen = new Set();
    board.paint.forEach((c, i) => {
      if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') {
        add('盤面の妥当性', `${label}paint[${i}] が{x,y}でない`);
        return;
      }
      if (c.x < 0 || c.x >= grid.cols || c.y < 0 || c.y >= grid.rows) add('座標範囲', `${label}paint[${i}]=${JSON.stringify(c)} が盤外`);
      if (walls.has(keyOf(c))) add('盤面の妥当性', `${label}paint[${i}] が壁と重なる`);
      if (waterCells.has(keyOf(c))) add('盤面の妥当性', `${label}paint[${i}] が水と重なる`);
      if (seen.has(keyOf(c))) add('盤面の妥当性', `${label}paint[${i}] が他のpaintと座標重複`);
      seen.add(keyOf(c));
    });
    for (const name of ['start', 'goal']) {
      if (board[name] && !seen.has(keyOf(board[name]))) add('盤面の妥当性', `${label}paint に${name}のマスが含まれない（通ると塗れるため目標に含める）`);
    }
  },

  // 塗りの層。startはここで塗っておく（engineのenterがstartでも呼ばれるのと対応）。
  // 戻り値のpaintAt(pos, animate)がonStepから呼ばれる。駒（grid-player）より下・足あとと同じ層に挿す。
  render({ board, pixelFor, CELL, paint: target, playerPos }) {
    const painted = new Map();
    const paintAt = (pos, animate = false) => {
      const k = keyOf(pos);
      if (painted.has(k)) return;
      const px = pixelFor(pos);
      const el = document.createElement('div');
      el.className = 'grid-paint absolute pointer-events-none';
      el.dataset.x = String(pos.x);
      el.dataset.y = String(pos.y);
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = `${CELL}px`;
      el.style.height = `${CELL}px`;
      el.style.transform = `translate(${px.x}px, ${px.y}px)`;
      el.innerHTML = paintSvg();
      const token = board.querySelector('.grid-player');
      board.insertBefore(el, token);
      painted.set(k, el);
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (animate && !reduce) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
    };
    if (list(target).length > 0 && playerPos) paintAt(playerPos);
    return { paintAt, painted };
  },
};

// みほんミニ盤：目標の模様を盤面と同じ色・同じ図形で小さく見せる（答えの手順は見せない）。
// 6×6でも幅 cols*(cell+gap) は約76px（320px幅に収まる）。DOMのみ使う（ブラウザ専用）。
export function paintMiniBoard(spec, cell = 12) {
  const gap = 1;
  const { cols, rows } = spec.grid;
  const target = new Set(list(spec.paint).map(keyOf));
  const walls = new Set(list(spec.walls).map(keyOf));
  const el = document.createElement('div');
  el.className = 'paint-sample relative';
  el.dataset.paintSample = 'true';
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'inline-grid';
  el.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
  el.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
  el.style.gap = `${gap}px`;
  el.style.padding = '2px';
  el.style.background = '#e7e5e4';
  el.style.borderRadius = '6px';
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const c = document.createElement('div');
      c.className = 'relative';
      c.dataset.x = String(x);
      c.dataset.y = String(y);
      c.style.borderRadius = '2px';
      if (target.has(keyOf({ x, y }))) {
        c.dataset.painted = 'true';
        c.innerHTML = paintSvg();
      } else {
        c.style.background = walls.has(keyOf({ x, y })) ? '#a8a29e' : '#f5f5f4';
      }
      el.appendChild(c);
    }
  }
  return el;
}
