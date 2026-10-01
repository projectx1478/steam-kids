// ice（こおり）ギミック：こおりのマスへ移動して入ると、同方向へ次のマスへ滑る。こおりが続く限り
// 滑り続け、最初の通常マス（ゴール含む）か壁・盤端の手前で止まる。start上では滑らない。
// 状態は持たない（Issue #61。止まり方の修正は本Issue）。
const DELTA = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const ICE_SVG = `<svg viewBox="0 0 64 64" class="grid-ice-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="3" y="7" width="58" height="55" rx="10" fill="#7dd3fc" />
      <rect x="3" y="3" width="58" height="55" rx="10" fill="#bae6fd" />
      <path d="M8 20 L20 8 L30 8 L8 30Z" fill="#f0f9ff" opacity="0.8" />
      <path d="M38 52 L56 34 L56 40 L44 52Z" fill="#f0f9ff" opacity="0.6" />
    </svg>`;

export const ice = {
  key: 'ice',

  initState() {
    return {};
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  stateKey() {
    return 'ice';
  },

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す（Issue #70）。
  strip(spec) {
    return { ...spec, ice: [] };
  },

  // いま入ったマスがこおりなら同方向へ進み続ける。通常マスなら止まる（返り先が壁・盤外なら
  // makeMoverのisOpenで止まる）。
  redirect(state, pos, dir, spec) {
    const list = spec.ice ?? [];
    if (!list.some((c) => c.x === pos.x && c.y === pos.y)) return null;
    const d = DELTA[dir];
    return { pos: { x: pos.x + d.x, y: pos.y + d.y }, dir };
  },

  // 座標範囲はcheckBoard側で共通に行う。ここでは壁・start・goal・items・ice同士の重なりのみ。
  validate(board, add, label) {
    const list = Array.isArray(board.ice) ? board.ice : [];
    const keyOf = (p) => `${p.x},${p.y}`;
    const overlap = (name, points) => {
      const set = new Set((points ?? []).map(keyOf));
      list.forEach((c, i) => {
        if (set.has(keyOf(c))) add('盤面の妥当性', `${label}ice[${i}] が${name}と重なる`);
      });
    };
    overlap('壁', board.walls);
    overlap('start', board.start ? [board.start] : []);
    overlap('goal', board.goal ? [board.goal] : []);
    overlap('items', board.items);
    const seen = new Set();
    list.forEach((c, i) => {
      const k = keyOf(c);
      if (seen.has(k)) add('盤面の妥当性', `${label}ice[${i}] が他のiceと座標重複`);
      seen.add(k);
    });
  },

  // 該当マスのセルへdata-ice="true"と氷のSVGを重ねる（マスの子として持つ。駒・足あとより下）。
  render({ board, ice: cells = [] }) {
    cells.forEach((c) => {
      const cell = board.querySelector(`.grid-cell[data-x="${c.x}"][data-y="${c.y}"]`);
      if (!cell) return;
      cell.dataset.ice = 'true';
      cell.insertAdjacentHTML('afterbegin', ICE_SVG);
    });
  },
};
