// warps（ワープ）ギミック：同じ組（pair 1か2）の穴は2つ。入口の穴に入ると、もう一方の穴（出口）へ
// 移って止まる。同じ手の中では出口から再ワープしない（redirectが end:true を返し、makeMover
// （engine-grid.js）が出口で連鎖を打ち切る）。後の手で出口へ入り直せば逆向き（元の入口）へワープする。
// ワープ自体は手数に数えない。状態は持たない（Issue #64）。入力は spec.warps:[{x,y,pair}]（省略時は[]）。
// 組ごとの配色（main=縁、dark=渦、light=穴の地）。1組目=紫＋★、2組目=橙＋■。かぎの赤まる・青さんかくと
// 見分けがつくよう、形（★■）と色（紫・橙）の両方を変える。色名は盤のデータに持たない（pairの番号のみ）。
const PAIR_HEX = {
  1: { main: '#7e22ce', dark: '#581c87', light: '#e9d5ff' },
  2: { main: '#ea580c', dark: '#9a3412', light: '#fed7aa' },
};

function starPath(cx, cy, r, fill) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return `<path d="${d}Z" fill="${fill}" stroke="${fill}" stroke-width="1.5" stroke-linejoin="round" />`;
}

const squareMark = (cx, cy, r, fill) =>
  `<rect x="${cx - r * 0.85}" y="${cy - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" rx="2" fill="${fill}" />`;

// うずまきの穴。外縁の輪＋渦の腕、中央に白地の円板と形の印（mock/ の見本どおり）。
function warpSvg(pair) {
  const c = PAIR_HEX[pair] ?? PAIR_HEX[1];
  const m = pair === 2 ? squareMark(32, 32, 11, c.main) : starPath(32, 32, 13, c.main);
  return `<svg viewBox="0 0 64 64" class="grid-warp-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="${c.light}" stroke="${c.main}" stroke-width="5" />
      <path d="M32 6 A26 26 0 0 1 58 32 M32 58 A26 26 0 0 1 6 32" fill="none" stroke="${c.main}" stroke-width="3" stroke-linecap="round" opacity="0.55" />
      <path d="M32 12 C48 12 54 28 46 40 C38 52 20 48 18 34 C16 22 28 18 36 24" fill="none" stroke="${c.dark}" stroke-width="2.5" stroke-linecap="round" opacity="0.5" />
      <circle cx="32" cy="32" r="15" fill="#fff" stroke="${c.main}" stroke-width="2.5" />${m}
    </svg>`;
}

export const warps = {
  key: 'warps',
  label: 'ワープ',

  initState() {
    return {};
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  // 状態を持たないのでBFSの重複排除キーには寄与しない（空文字は連結から省かれる）。
  stateKey() {
    return '';
  },

  // いま入ったマスが穴なら、同じ組のもう一方の穴へ移して止める。向きは変えない（出口で止まるので
  // 向きは使われない）。相手の穴が無い（検査前の不正な盤）ときは何もしない。
  redirect(state, pos, dir, spec) {
    const list = Array.isArray(spec.warps) ? spec.warps : [];
    const here = list.find((w) => w.x === pos.x && w.y === pos.y);
    if (!here) return null;
    const other = list.find((w) => w.pair === here.pair && !(w.x === here.x && w.y === here.y));
    if (!other) return null;
    return { pos: { x: other.x, y: other.y }, dir, end: true };
  },

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す。
  strip(spec) {
    return { ...spec, warps: [] };
  },

  // 盤の形式検査（盤外・pair・重なり等）は段3で checkBoard に足す。ここでは何もしない。
  validate() {},

  // 穴のセルへSVGを重ねる。data-warp=組の番号（1|2）、data-mark=形（star|square）。色名はデータに持たない。
  render({ board, warps: list = [] }) {
    (Array.isArray(list) ? list : []).forEach((w) => {
      const cell = board.querySelector(`.grid-cell[data-x="${w.x}"][data-y="${w.y}"]`);
      if (!cell) return;
      cell.dataset.warp = String(w.pair);
      cell.dataset.mark = w.pair === 1 ? 'star' : 'square';
      cell.insertAdjacentHTML('afterbegin', warpSvg(w.pair));
    });
  },
};
