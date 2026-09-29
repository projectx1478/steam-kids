// keys（かぎとドア）ギミック：かぎのマスへ入るとその色を持ち、同じ色のドアが開いて通れる。
// 未所持の色のドアは壁と同じ通行不可（当たると失敗）。かぎは消費しない（Issue #62）。
// 色は色覚に配慮して形でも区別する（red=まる、blue=さんかく。かぎ・ドア両方）。
export const KEY_COLORS = ['red', 'blue'];

const COLOR_HEX = { red: '#ef4444', blue: '#3b82f6' };
const SHAPE_PATH = {
  red: '<circle cx="32" cy="32" r="14" />',
  blue: '<path d="M32 16 L48 46 L16 46 Z" stroke-linejoin="round" />',
};

const keyOf = (p) => `${p.x},${p.y}`;
const ids = (list) => (Array.isArray(list) ? list : []);

function shape(color, attrs) {
  return `<g ${attrs}>${SHAPE_PATH[color]}</g>`;
}

function keySvg(color) {
  return `<svg viewBox="0 0 64 64" class="grid-key-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="#fefce8" stroke="${COLOR_HEX[color]}" stroke-width="4" />
      ${shape(color, `fill="${COLOR_HEX[color]}" stroke="${COLOR_HEX[color]}" stroke-width="3"`)}
      <path d="M32 48 L32 56 M32 52 L38 52" stroke="${COLOR_HEX[color]}" stroke-width="4" stroke-linecap="round" fill="none" />
    </svg>`;
}

function doorSvg(color, open) {
  const hex = COLOR_HEX[color];
  return `<svg viewBox="0 0 64 64" class="grid-door-svg absolute inset-0 w-full h-full pointer-events-none" style="opacity:${open ? 0.3 : 1}" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="${open ? 'none' : hex}" stroke="${hex}" stroke-width="4" />
      <rect x="10" y="10" width="44" height="44" rx="5" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="${open ? '4 4' : '0'}" />
      ${shape(color, `fill="${open ? hex : '#ffffff'}" stroke="${open ? hex : '#ffffff'}" stroke-width="3"`)}
    </svg>`;
}

export const keys = {
  key: 'keys',

  // state: { held: 所持している色の配列（ソート済み。不変更新） }
  initState() {
    return { held: [] };
  },

  enter(state, pos, spec) {
    const found = ids(spec.keys).find((k) => k.x === pos.x && k.y === pos.y);
    if (!found || state.held.includes(found.color)) return state;
    return { held: [...state.held, found.color].sort() };
  },

  isCleared() {
    return true;
  },

  stateKey(state) {
    return `keys:${state.held.join(',')}`;
  },

  blocks(state, pos, spec) {
    const door = ids(spec.doors).find((d) => d.x === pos.x && d.y === pos.y);
    return Boolean(door) && !state.held.includes(door.color);
  },

  // createStepperが1手進むたびに呼ぶ（engineの状態とは独立にUIの開閉を更新する）。
  // runはstepper1回の実行ごとの作業領域。戻り値は鳴らす効果音名（無ければundefined）。
  onStep({ pos, spec, view, run }) {
    const found = ids(spec.keys).find((k) => k.x === pos.x && k.y === pos.y);
    run.held ??= new Set();
    if (!found || run.held.has(found.color)) return undefined;
    run.held.add(found.color);
    const els = view.gimmickEls?.keys;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const keyEl = els?.keyEls.get(keyOf(found));
    if (keyEl) {
      if (reduce) keyEl.remove();
      else {
        keyEl.style.transition = 'transform 400ms ease, opacity 400ms ease';
        keyEl.style.transform = 'translateY(-16px) scale(1.4)';
        keyEl.style.opacity = '0';
        setTimeout(() => keyEl.remove(), 400);
      }
    }
    ids(spec.doors)
      .filter((d) => d.color === found.color)
      .forEach((d) => {
        const cell = els?.doorCells.get(keyOf(d));
        if (!cell) return;
        cell.dataset.doorOpen = 'true';
        cell.querySelector('.grid-door-svg')?.replaceWith(
          Object.assign(document.createElement('template'), { innerHTML: doorSvg(d.color, true) }).content.firstElementChild
        );
      });
    return 'pickup';
  },

  // 座標範囲はcheckBoard側で共通に行う。色・対応するかぎ・重なり・盤の大きさを見る。
  validate(board, add, label) {
    const keyList = ids(board.keys);
    const doorList = ids(board.doors);
    if (keyList.length === 0 && doorList.length === 0) return;
    const grid = board.grid || {};
    if (grid.cols > 6 || grid.rows > 6) add('盤面の妥当性', `${label}かぎ・ドアのある盤面は6×6以内（${grid.cols}×${grid.rows}）`);
    const colorOk = (kind, list) =>
      list.forEach((c, i) => {
        if (!KEY_COLORS.includes(c.color)) add('盤面の妥当性', `${label}${kind}[${i}] のcolor=${JSON.stringify(c.color)} が不正`);
      });
    colorOk('keys', keyList);
    colorOk('doors', doorList);
    doorList.forEach((d, i) => {
      if (!keyList.some((k) => k.color === d.color)) add('盤面の妥当性', `${label}doors[${i}] に対応する色のかぎが無い`);
    });
    const overlap = (kind, list, name, points) => {
      const set = new Set(ids(points).map(keyOf));
      list.forEach((c, i) => {
        if (set.has(keyOf(c))) add('盤面の妥当性', `${label}${kind}[${i}] が${name}と重なる`);
      });
    };
    [['keys', keyList], ['doors', doorList]].forEach(([kind, list]) => {
      overlap(kind, list, '壁', board.walls);
      overlap(kind, list, 'start', board.start ? [board.start] : []);
      overlap(kind, list, 'goal', board.goal ? [board.goal] : []);
      overlap(kind, list, 'items', board.items);
      overlap(kind, list, 'ice', board.ice);
      overlap(kind, list, 'cushion', board.cushion);
    });
    overlap('keys', keyList, 'doors', doorList);
    const seen = new Set();
    [...keyList.map((c, i) => ['keys', i, c]), ...doorList.map((c, i) => ['doors', i, c])].forEach(([kind, i, c]) => {
      const k = keyOf(c);
      if (seen.has(k)) add('盤面の妥当性', `${label}${kind}[${i}] が他のかぎ・ドアと座標重複`);
      seen.add(k);
    });
  },

  // かぎ・ドアのセルへSVGを重ねる。data-key / data-door（色）、開いたドアはdata-door-open="true"。
  render({ board, keys: keyList = [], doors: doorList = [] }) {
    const keyEls = new Map();
    const doorCells = new Map();
    keyList.forEach((k) => {
      const cell = board.querySelector(`.grid-cell[data-x="${k.x}"][data-y="${k.y}"]`);
      if (!cell) return;
      cell.dataset.key = k.color;
      cell.insertAdjacentHTML('afterbegin', keySvg(k.color));
      keyEls.set(keyOf(k), cell.querySelector('.grid-key-svg'));
    });
    doorList.forEach((d) => {
      const cell = board.querySelector(`.grid-cell[data-x="${d.x}"][data-y="${d.y}"]`);
      if (!cell) return;
      cell.dataset.door = d.color;
      cell.dataset.doorOpen = 'false';
      cell.insertAdjacentHTML('afterbegin', doorSvg(d.color, false));
      doorCells.set(keyOf(d), cell);
    });
    return { keyEls, doorCells };
  },
};
