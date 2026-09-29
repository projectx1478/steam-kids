// ice（こおり）ギミック：こおりのマスへ移動して入ると、同方向へ壁・盤端の手前まで滑り続ける
// （途中の通常マス・ゴールでも止まらない。start上では滑らない）。状態は持たない（Issue #61）。
const DELTA = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const ICE_SVG = `<svg viewBox="0 0 64 64" class="grid-ice-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="10" fill="#bae6fd" />
      <rect x="2" y="2" width="60" height="60" rx="10" fill="none" stroke="#7dd3fc" stroke-width="3" />
      <path d="M14 22 L28 12" stroke="#f0f9ff" stroke-width="4" stroke-linecap="round" />
      <path d="M38 50 L52 40" stroke="#f0f9ff" stroke-width="4" stroke-linecap="round" />
      <path d="M44 18 L50 14" stroke="#f0f9ff" stroke-width="3" stroke-linecap="round" />
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

  // こおりへ入った手は、同方向へ壁・盤端の手前まで進み続ける。chained（滑走中に入ったマス）は
  // 通常マス・ゴールでも止めない。
  redirect(state, pos, dir, spec, chained) {
    const list = spec.ice ?? [];
    if (!chained && !list.some((c) => c.x === pos.x && c.y === pos.y)) return null;
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
