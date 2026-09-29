// cushion（クッション）ギミック：通行不可のマス。壁と違い、ぶつかっても失敗にならず手前で止まる
// （歩き・こおりの滑走とも。命令1つは無駄になる）。soft: trueをmakeMover（engine-grid.js）が
// 参照して「失敗しない衝突」と判定する。
const CUSHION_SVG = `<svg viewBox="0 0 64 64" class="grid-cushion-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="#be185d" opacity="0.25" />
      <circle cx="32" cy="32" r="26" fill="#f9a8d4" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="#f472b6" stroke-width="3" />
      <circle cx="32" cy="32" r="16" fill="#fbcfe8" />
      <circle cx="26" cy="26" r="4" fill="#fdf2f8" />
    </svg>`;

const keyOf = (p) => `${p.x},${p.y}`;

export const cushion = {
  key: 'cushion',
  soft: true,

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
    return 'cushion';
  },

  blocks(state, pos, spec) {
    return (spec.cushion ?? []).some((c) => c.x === pos.x && c.y === pos.y);
  },

  // 座標範囲はcheckBoard側で共通に行う。ここでは壁・start・goal・items・ice・cushion同士の重なりのみ。
  validate(board, add, label) {
    const list = Array.isArray(board.cushion) ? board.cushion : [];
    const overlap = (name, points) => {
      const set = new Set((points ?? []).map(keyOf));
      list.forEach((c, i) => {
        if (set.has(keyOf(c))) add('盤面の妥当性', `${label}cushion[${i}] が${name}と重なる`);
      });
    };
    overlap('壁', board.walls);
    overlap('start', board.start ? [board.start] : []);
    overlap('goal', board.goal ? [board.goal] : []);
    overlap('items', board.items);
    overlap('ice', board.ice);
    const seen = new Set();
    list.forEach((c, i) => {
      const k = keyOf(c);
      if (seen.has(k)) add('盤面の妥当性', `${label}cushion[${i}] が他のcushionと座標重複`);
      seen.add(k);
    });
  },

  // 該当マスのセルへdata-cushion="true"とクッションのSVGを重ねる（駒・足あとより下）。
  render({ board, cushion: cells = [] }) {
    cells.forEach((c) => {
      const cell = board.querySelector(`.grid-cell[data-x="${c.x}"][data-y="${c.y}"]`);
      if (!cell) return;
      cell.dataset.cushion = 'true';
      cell.insertAdjacentHTML('afterbegin', CUSHION_SVG);
    });
  },
};
