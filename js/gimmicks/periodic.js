// periodic（周期ドア）ギミック：決まった手数ごとに開閉するドア。閉じている手に入ると壁と同じ失敗（Issue #310）。
// 手番(turn)は1手の移動が終わった時点で tick が1進める。判定はその手の開始時の turn mod period が open に含まれるか。
// 状態は有限にするため、turn は全ドアの period の最小公倍数(cycle)で丸めて持つ。
const list = (v) => (Array.isArray(v) ? v : []);
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;

export const periodic = {
  key: 'periodic',

  // state: { turn: 手番（0〜cycle-1）, cycle: 全ドアのperiodの最小公倍数（ドア無しは1）, doors: spec.periodicの写し }
  initState(spec) {
    const doors = list(spec.periodic);
    return { turn: 0, cycle: doors.reduce((c, d) => lcm(c, d.period), 1), doors };
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  // ドア無しの盤は定数（BFSの状態数を増やさない）。ある盤は手番をcycleで割った余り。
  stateKey(state) {
    return state.doors.length === 0 ? 'periodic' : `periodic:${state.turn % state.cycle}`;
  },

  // 閉じているドア（turn mod period が open に含まれない）は通行不可。soft にしない（壁と同じ失敗）。
  blocks(state, pos) {
    return state.doors.some((d) => d.x === pos.x && d.y === pos.y && !list(d.open).includes(state.turn % d.period));
  },

  // 1手の移動が終わった時点で1度だけ呼ぶ（呼び出し側は段1-2）。不変更新。
  tick(state) {
    return { ...state, turn: (state.turn + 1) % state.cycle };
  },

  // 盤面の妥当性検証は段2で追加する。
  validate() {},
};
