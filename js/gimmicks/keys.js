// keys（かぎとドア）ギミック：かぎのマスへ入るとその色を持ち、同じ色のドアが開いて通れる。
// 未所持の色のドアは壁と同じ通行不可（当たると失敗）。かぎは消費しない（Issue #62）。
// 色は色覚に配慮して形でも区別する（red=まる、blue=さんかく。かぎ。ドアは色のみ。Issue #387）。
export const KEY_COLORS = ['red', 'blue'];
// keyMode（Issue #391）。remote＝かぎのマスへ入った瞬間に同色のドアが開く（従来）。carry＝取っても開かず、
// 持っている色のドアのマスへ入ったときに開く（省略時）。通行可否・最短手数は同じで、onStepの描画だけが違う。
export const KEY_MODES = ['remote', 'carry'];

// main=本体色、dark=影・縁、light=ハイライト。
const COLOR_HEX = {
  red: { main: '#ef4444', dark: '#b91c1c', light: '#fca5a5' },
  blue: { main: '#3b82f6', dark: '#1e40af', light: '#93c5fd' },
};
const keyOf = (p) => `${p.x},${p.y}`;
const ids = (list) => (Array.isArray(list) ? list : []);

// 形の印（かぎの持ち手の中・ドアの飾り板の中）。中心(cx,cy)・大きさrで描く。
export function mark(color, cx, cy, r, fill) {
  return color === 'red'
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`
    : `<path d="M${cx} ${cy - r} L${cx + r} ${cy + r * 0.8} L${cx - r} ${cy + r * 0.8} Z" fill="${fill}" stroke="${fill}" stroke-width="1.5" stroke-linejoin="round" />`;
}

// 古典的な金色のかぎ（持ち手の輪・軸・歯）を斜めに置く。持ち手の中に形の印（Issue #146）。
function keySvg(color) {
  const c = COLOR_HEX[color];
  return `<svg viewBox="0 0 64 64" class="grid-key-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <ellipse cx="34" cy="56" rx="20" ry="3.5" fill="#1e293b" opacity="0.25" />
      <g transform="rotate(-35 32 32)">
        <rect x="30" y="8" width="7" height="44" rx="3" fill="#a16207" transform="translate(1.5,2)" />
        <circle cx="33.5" cy="14" r="12" fill="#a16207" transform="translate(1.5,2)" />
        <rect x="30" y="8" width="7" height="44" rx="3" fill="#facc15" />
        <rect x="37" y="40" width="9" height="5" rx="1" fill="#facc15" />
        <rect x="37" y="47" width="6" height="5" rx="1" fill="#facc15" />
        <circle cx="33.5" cy="14" r="12" fill="#facc15" />
        ${mark(color, 33.5, 14, 7.5, c.main)}
        <rect x="31.5" y="22" width="2" height="26" rx="1" fill="#fef9c3" opacity="0.8" />
      </g>
    </svg>`;
}

// 四角い板張りの扉。しまっている時は色付きの扉、あいた時は扉が脇に
// 開いて床が見える（Issue #146）。開閉はdata-door-open（keys.jsのonStep）で切り替える。
function doorSvg(color, open) {
  const c = COLOR_HEX[color];
  const ledge = '<rect x="4" y="10" width="56" height="52" rx="4" fill="#44403c" />';
  const frame = open
    ? '<path fill-rule="evenodd" d="M4 3 h56 v52 h-56z M9 7 h46 v48 h-46z" fill="#78716c" />'
    : '<rect x="4" y="3" width="56" height="52" rx="4" fill="#78716c" />';
  const inner = open
    ? `<rect x="9" y="7" width="46" height="5" fill="#0f172a" opacity="0.12" />
      <path d="M9 7 L18 10 L18 58 L9 55Z" fill="${c.main}" stroke="${c.dark}" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M11 12 L16 13 L16 30 L11 29Z" fill="none" stroke="${c.dark}" stroke-width="1.2" />`
    : `<rect x="9" y="7" width="46" height="48" rx="2" fill="${c.main}" stroke="${c.dark}" stroke-width="2" />
      <rect x="14" y="11" width="16" height="18" rx="2" fill="none" stroke="${c.dark}" stroke-width="2" />
      <rect x="34" y="11" width="16" height="18" rx="2" fill="none" stroke="${c.dark}" stroke-width="2" />
      <rect x="14" y="33" width="16" height="18" rx="2" fill="none" stroke="${c.dark}" stroke-width="2" />
      <rect x="34" y="33" width="16" height="18" rx="2" fill="none" stroke="${c.dark}" stroke-width="2" />
      <rect x="11" y="8" width="42" height="3" fill="${c.light}" opacity="0.7" />
      <circle cx="49" cy="33" r="3" fill="#fbbf24" stroke="#a16207" stroke-width="1" />`;
  return `<svg viewBox="0 0 64 64" class="grid-door-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      ${ledge}${frame}${inner}
    </svg>`;
}

const prefersReduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const slotOf = (color) => typeof document === 'undefined' ? null : document.querySelector(`.key-slot[data-color="${color}"]`);

// carry盤の鍵トレイ（Issue #391）。持っていない色は点線の空き枠（鍵の色で薄く着色）、持った色は盤面と同じ鍵を縮小して入れる。
// 表示専用。keyModeがcarryで、かぎのある盤面のときだけ作る（それ以外はnull）。色の数だけ最初から出す。
export function renderKeyTray(spec) {
  const colors = KEY_COLORS.filter((c) => ids(spec.keys).some((k) => k.color === c));
  if ((spec.keyMode ?? 'carry') !== 'carry' || colors.length === 0) return null;
  const tray = document.createElement('div');
  tray.className = 'sk-key-tray-row key-tray flex items-center justify-center gap-3 shrink-0 -mt-1.5';
  colors.forEach((color) => {
    const slot = document.createElement('span');
    slot.className = 'key-slot relative inline-flex w-12 h-12 rounded-xl border-2';
    slot.dataset.color = color;
    tray.appendChild(slot);
  });
  resetKeyTray(tray);
  return tray;
}

function emptyKeySlot(slot) {
  const c = COLOR_HEX[slot.dataset.color];
  delete slot.dataset.filled;
  slot.classList.remove('bg-amber-50');
  slot.classList.add('border-dashed');
  slot.style.borderColor = `${c.main}99`;
  slot.style.backgroundColor = `${c.main}22`;
  slot.innerHTML = '';
}

// トレイを（演出無しで）全部空き枠へ戻す。drawBoard・ためしなおすで使う。
export function resetKeyTray(tray) {
  tray?.querySelectorAll('.key-slot').forEach(emptyKeySlot);
}

function fillKeySlot(color) {
  const slot = slotOf(color);
  if (!slot) return;
  slot.dataset.filled = 'true';
  slot.classList.remove('border-dashed');
  slot.classList.add('bg-amber-50');
  slot.style.borderColor = '';
  slot.style.backgroundColor = '';
  slot.innerHTML = keySvg(color);
  if (!prefersReduce()) slot.firstElementChild.classList.add('spring-in');
}

// 鍵なしで扉に当たったとき、持っていない色の空き枠を一瞬ゆらす（reduced-motionでは動かさない）。
function shakeKeySlot(color) {
  const slot = slotOf(color);
  if (!slot || slot.dataset.filled === 'true' || prefersReduce()) return;
  slot.classList.remove('key-slot-shake');
  void slot.offsetWidth;
  slot.classList.add('key-slot-shake');
  slot.addEventListener('animationend', () => slot.classList.remove('key-slot-shake'), { once: true });
}

// ドアを開いた見た目にして、開く音を鳴らす（既に開いているドアは何もしない）。
function openDoors(els, doors) {
  let opened = 0;
  doors.forEach((d) => {
    const cell = els?.doorCells.get(keyOf(d));
    if (cell?.dataset.doorOpen === 'true') return;
    opened += 1;
    if (!cell) return;
    cell.dataset.doorOpen = 'true';
    cell.querySelector('.grid-door-svg')?.replaceWith(
      Object.assign(document.createElement('template'), { innerHTML: doorSvg(d.color, true) }).content.firstElementChild
    );
  });
  // ドアが開く音はかぎ取得の直後に重ならないよう約0.25s遅らせる。sfx.jsはブラウザ前提
  // （localStorage使用）なため動的import。Nodeの単体テストはonStepを呼ばないためここでのみ
  // sfx.jsへ依存する（Issue #158）
  if (opened > 0) setTimeout(() => import('../sfx.js').then(({ play }) => play('door')), 250);
}

export const keys = {
  key: 'keys',
  label: 'かぎ・ドア',

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

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す（Issue #70）。
  strip(spec) {
    return { ...spec, keys: [], doors: [] };
  },

  blocks(state, pos, spec) {
    const door = ids(spec.doors).find((d) => d.x === pos.x && d.y === pos.y);
    return Boolean(door) && !state.held.includes(door.color);
  },

  // createStepperが1手進むたびに呼ぶ（engineの状態とは独立にUIの開閉を更新する）。
  // runはstepper1回の実行ごとの作業領域。戻り値は鳴らす効果音名（無ければundefined）。
  onStep({ pos, spec, view, run }) {
    const carry = (spec.keyMode ?? 'carry') === 'carry';
    const els = view.gimmickEls?.keys;
    run.held ??= new Set();
    // carry：持っている色のドアのマスへ入ったとき開く（開いたドアは開いたまま）
    if (carry) {
      const door = ids(spec.doors).find((d) => d.x === pos.x && d.y === pos.y);
      if (door && run.held.has(door.color)) openDoors(els, [door]);
    }
    const found = ids(spec.keys).find((k) => k.x === pos.x && k.y === pos.y);
    if (!found || run.held.has(found.color)) return undefined;
    run.held.add(found.color);
    if (carry) fillKeySlot(found.color);
    const reduce = prefersReduce();
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
    if (!carry) openDoors(els, ids(spec.doors).filter((d) => d.color === found.color));
    return 'key';
  },

  // createStepperが衝突（bumped）した手で呼ぶ。targetは進もうとしたマス。carryで鍵なしのドアに当たったら
  // トレイの空き枠をゆらす（音・文言は足さない。Issue #391）。
  onBump({ target, spec, run }) {
    if ((spec.keyMode ?? 'carry') !== 'carry') return;
    const door = ids(spec.doors).find((d) => d.x === target.x && d.y === target.y);
    if (door && !(run.held ?? new Set()).has(door.color)) shakeKeySlot(door.color);
  },

  // 座標範囲はcheckBoard側で共通に行う。色・対応するかぎ・重なり・盤の大きさを見る。
  validate(board, add, label) {
    const keyList = ids(board.keys);
    const doorList = ids(board.doors);
    if ('keyMode' in board) {
      if (keyList.length === 0 && doorList.length === 0) add('盤面の妥当性', `${label}keyModeはkeys・doorsのある盤面だけに指定できる`);
      else if (!KEY_MODES.includes(board.keyMode)) add('盤面の妥当性', `${label}keyMode=${JSON.stringify(board.keyMode)} が不正（${KEY_MODES.join('・')}のどちらか）`);
    }
    if (keyList.length === 0 && doorList.length === 0) return;
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
      overlap(kind, list, 'water', board.water);
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
      cell.dataset.color = k.color;
      cell.dataset.mark = k.color === 'red' ? 'circle' : 'triangle';
      cell.insertAdjacentHTML('afterbegin', keySvg(k.color));
      keyEls.set(keyOf(k), cell.querySelector('.grid-key-svg'));
    });
    doorList.forEach((d) => {
      const cell = board.querySelector(`.grid-cell[data-x="${d.x}"][data-y="${d.y}"]`);
      if (!cell) return;
      cell.dataset.door = d.color;
      cell.dataset.color = d.color;
      cell.dataset.doorOpen = 'false';
      cell.insertAdjacentHTML('afterbegin', doorSvg(d.color, false));
      doorCells.set(keyOf(d), cell);
    });
    return { keyEls, doorCells };
  },
};
