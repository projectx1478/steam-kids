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

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す。
  strip(spec) {
    return { ...spec, periodic: [] };
  },

  // 盤面の妥当性。形（period 2〜4・openは相異なる整数で空でなく全手番でもない）、他要素との重なり、
  // paint・repeatBox・groupRepeatsとの併用禁止。必須性（常に開とみなした盤の最短）はtools/validate-lessons.mjsのplay側。
  validate(board, add, label) {
    if (board.periodic === undefined) return;
    if (!Array.isArray(board.periodic) || board.periodic.length === 0) {
      add('盤面の妥当性', `${label}periodic が空、または配列でない`);
      return;
    }
    const grid = board.grid || {};
    if (grid.cols > 6 || grid.rows > 6) add('盤面の妥当性', `${label}periodicのある盤面は6×6以内（${grid.cols}×${grid.rows}）`);
    if (list(board.paint).length > 0) add('盤面の妥当性', `${label}periodic は paint と併用できない`);
    // 周期をまたぐ箱・同方向まとめは手番とずれるため、周期ドア盤では使わせない（初期は禁止で簡潔に）。
    if (board.repeatBox === true || board.groupRepeats === true) {
      add('盤面の妥当性', `${label}periodic は repeatBox・groupRepeats と併用できない（箱の展開が手番の周期をまたぐため。4方向のみ）`);
    }
    const keyOf = (p) => `${p.x},${p.y}`;
    const sets = [
      ['壁', list(board.walls)],
      ['start', board.start ? [board.start] : []],
      ['goal', board.goal ? [board.goal] : []],
      ['items', list(board.items)],
      ['ice', list(board.ice)],
      ['cushion', list(board.cushion)],
      ['keys', list(board.keys)],
      ['doors', list(board.doors)],
      ['switches', list(board.switches)],
      ['switchesのtargets', list(board.switches).flatMap((s) => list(s?.targets))],
    ].map(([name, pts]) => [name, new Set(pts.filter((p) => p && typeof p.x === 'number').map(keyOf))]);
    const seen = new Set();
    board.periodic.forEach((d, i) => {
      if (!d || !Number.isInteger(d.x) || !Number.isInteger(d.y)) {
        add('盤面の妥当性', `${label}periodic[${i}] が{x,y,period,open}でない`);
        return;
      }
      if (d.x < 0 || d.x >= grid.cols || d.y < 0 || d.y >= grid.rows) add('座標範囲', `${label}periodic[${i}]=${JSON.stringify(d)} が盤外`);
      for (const [name, set] of sets) if (set.has(keyOf(d))) add('盤面の妥当性', `${label}periodic[${i}] が${name}と重なる`);
      if (seen.has(keyOf(d))) add('盤面の妥当性', `${label}periodic[${i}] が他のperiodicと座標重複`);
      seen.add(keyOf(d));
      if (!Number.isInteger(d.period) || d.period < 2 || d.period > 4) {
        add('盤面の妥当性', `${label}periodic[${i}] のperiod=${JSON.stringify(d.period)} が2〜4の整数でない`);
        return;
      }
      const open = d.open;
      if (!Array.isArray(open) || open.length === 0) {
        add('盤面の妥当性', `${label}periodic[${i}] のopenが空、または配列でない`);
      } else if (open.some((v) => !Number.isInteger(v) || v < 0 || v >= d.period) || new Set(open).size !== open.length) {
        add('盤面の妥当性', `${label}periodic[${i}] のopen=${JSON.stringify(open)} が0以上period未満の相異なる整数でない`);
      } else if (open.length === d.period) {
        add('盤面の妥当性', `${label}periodic[${i}] のopenが全手番を含む（常に開）`);
      }
    });
  },
};
