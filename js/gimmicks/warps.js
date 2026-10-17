// warps（ワープ）ギミック：同じ組（pair 1か2）の穴は2つ。入口の穴に入ると、もう一方の穴（出口）へ
// 移って止まる。同じ手の中では出口から再ワープしない（redirectが end:true を返し、makeMover
// （engine-grid.js）が出口で連鎖を打ち切る）。後の手で出口へ入り直せば逆向き（元の入口）へワープする。
// ワープ自体は手数に数えない。状態は持たない（Issue #64）。入力は spec.warps:[{x,y,pair}]（省略時は[]）。
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
    const list = spec.warps ?? [];
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
};
