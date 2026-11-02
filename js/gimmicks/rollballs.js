// rollBalls（転がす球）・pits（おとし穴）ギミック（Issue #287）。ロボットが進む先に球があれば
// 同じ向きへ1マス転がし（1手）、転がし先が埋まっていないおとし穴なら球は穴に埋まる。
// 転がせない手（先が盤外・壁・他の球）と、埋まっていないおとし穴へ入る手は壁と同じ失敗。
// 状態：{ balls: [{x,y}|null], filled: [boolean] }（ballsは初期位置と同じ添字。穴に埋まった球はnull）。
// render・onStep・onBump は段2。
const list = (v) => (Array.isArray(v) ? v : []);
const keyOf = (p) => `${p.x},${p.y}`;
const isPoint = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OTHERS = ['items', 'ice', 'cushion', 'water', 'bridge', 'keys', 'doors', 'switches', 'groupWalls', 'paint', 'periodic', 'warps'];

export const rollBalls = {
  key: 'rollBalls',
  label: '転がす球',

  initState(spec) {
    const balls = list(spec.rollBalls);
    if (balls.length === 0) return null;
    return {
      balls: balls.map((b) => (isPoint(b) ? { x: b.x, y: b.y } : null)),
      filled: list(spec.pits).map(() => false),
    };
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  // 例 "rb:2,1/0"：生きている球の位置を x,y の昇順で ; 連結 ＋ / ＋ 埋まった穴の添字ビット。
  stateKey(state) {
    if (!state) return '';
    const pos = state.balls
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map(keyOf)
      .join(';');
    const bits = state.filled.reduce((sum, f, i) => (f ? sum + 2 ** i : sum), 0);
    return `rb:${pos}/${bits}`;
  },

  // 球のあるマスと、埋まっていないおとし穴。
  blocks(state, pos, spec) {
    if (!state) return false;
    if (state.balls.some((b) => b && b.x === pos.x && b.y === pos.y)) return true;
    return list(spec.pits).some((c, i) => c && c.x === pos.x && c.y === pos.y && !state.filled[i]);
  },

  // pos へ dir 向きで入る直前。球が無ければ null、動かせなければ { ok:false }、
  // 動かせたら { ok:true, state, move:{from,to,fill} }。1手で動かせるのは1球。
  roll(state, pos, dir, spec, isOpen) {
    if (!state) return null;
    const idx = state.balls.findIndex((b) => b && b.x === pos.x && b.y === pos.y);
    if (idx < 0) return null;
    const [dx, dy] = DELTA[dir];
    const to = { x: pos.x + dx, y: pos.y + dy };
    const pitIdx = list(spec.pits).findIndex((c, i) => c && c.x === to.x && c.y === to.y && !state.filled[i]);
    if (pitIdx < 0 && !isOpen(to)) return { ok: false };
    const balls = state.balls.slice();
    const filled = state.filled.slice();
    if (pitIdx >= 0) {
      balls[idx] = null;
      filled[pitIdx] = true;
    } else {
      balls[idx] = to;
    }
    return { ok: true, state: { balls, filled }, move: { from: { x: pos.x, y: pos.y }, to, fill: pitIdx >= 0 ? pitIdx : null } };
  },

  // 必須性の比較用：球を外し、おとし穴を壁にした盤。
  strip(spec) {
    return { ...spec, rollBalls: [], walls: [...list(spec.walls), ...list(spec.pits)], pits: [] };
  },

  // 座標範囲・個数・重なり・併用を見る（paint・periodic と同じくここで整数・盤内も検査する）。
  validate(board, add, label) {
    const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null);
    if (!has(board.rollBalls) && !has(board.pits)) return;
    const NAME = '盤面の妥当性';
    for (const k of ['rollBalls', 'pits']) {
      if (board[k] !== undefined && !Array.isArray(board[k])) add(NAME, `${label}${k} が配列でない`);
    }
    const balls = list(board.rollBalls);
    const pits = list(board.pits);
    if (balls.length > 2) add(NAME, `${label}rollBalls が3個以上（${balls.length}個。2個まで）`);
    if (pits.length > balls.length && balls.length > 0) add(NAME, `${label}pits が rollBalls より多い（pits ${pits.length}個・rollBalls ${balls.length}個）`);
    if (balls.length > 0 && pits.length === 0) add(NAME, `${label}rollBalls があるのに pits が空`);
    if (pits.length > 0 && balls.length === 0) add(NAME, `${label}pits があるのに rollBalls が空`);

    const grid = board.grid || {};
    const set = (pts) => new Set(list(pts).filter(isPoint).map(keyOf));
    const walls = set(board.walls);
    const start = board.start ? set([board.start]) : new Set();
    const goal = board.goal ? set([board.goal]) : new Set();
    const check = (kind, points, other, otherName) => {
      const seen = new Set();
      points.forEach((c, i) => {
        if (!isPoint(c)) {
          add(NAME, `${label}${kind}[${i}] が整数の{x,y}でない`);
          return;
        }
        if (c.x < 0 || c.y < 0 || c.x >= grid.cols || c.y >= grid.rows) add(NAME, `${label}${kind}[${i}]=${JSON.stringify(c)} が盤外`);
        if (seen.has(keyOf(c))) add(NAME, `${label}${kind}[${i}] が他の${kind}と座標重複`);
        seen.add(keyOf(c));
        for (const [name, s] of [['壁', walls], ['start', start], ['goal', goal], [otherName, other]]) {
          if (s.has(keyOf(c))) add(NAME, `${label}${kind}[${i}] が${name}と重なる`);
        }
      });
    };
    check('rollBalls', balls, set(pits), 'pits');
    check('pits', pits, set(balls), 'rollBalls');

    for (const k of OTHERS) {
      if (has(board[k])) add(NAME, `${label}rollBalls・pits と ${k} は同じ盤に置けない（併用禁止）`);
    }
    for (const k of ['repeatBox', 'groupRepeats']) {
      if (board[k] === true) add(NAME, `${label}rollBalls・pits と ${k} は併用できない`);
    }
  },
};
