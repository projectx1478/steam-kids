// build-egg（たまごの みち。play.egg）のエンジン。画面（ui-egg.js）と validate（tools/lib/validate/egg.mjs）が共有する（Issue #290）。
// 決定論：整数のみ・乱数なし・sqrt なし。1ステップ＝たまごが1マス進む。結果は状態列の計算だけで決まる（描画に依存しない）。
// 向き 0=下 1=左 2=上 3=右。板は4段階（/ \ - |）の離散反射表。横へ曲がると2マス・上へ曲がると1マス進んで落下に戻る。

export const MAX_STEPS = 600;
export const ANGLES = ['/', '\\', '-', '|'];

// 結果ごとの文言（ひらがな・20字以内・否定語なし。validate が同じ検査をかける）。
export const EGG_TEXT = {
  nest: 'たまごは あんぜん！',
  fall: 'たまごが おちちゃった',
  wrongNest: 'べつの すに はいったよ',
  timeout: 'たまごが ぐるぐる まわったよ',
  try: 'ためす',
  undo: 'もどす',
};

const DX = [0, -1, 0, 1];
const DY = [1, 0, -1, 0];
const REVERSE = [2, 3, 0, 1];
// REFLECT[角度][入る向き] = 出る向き（-1＝そのまま通過）
const REFLECT = [
  [1, 0, 3, 2], // '/'
  [3, 2, 1, 0], // '\'
  [2, -1, 0, -1], // '-'
  [-1, 3, -1, 1], // '|'
];
const GLIDE = [0, 2, 1, 2]; // 出る向き別の滑走マス数

const key = (c, r) => r * 10 + c;

// egg＝play.egg（col・grid・nests・obstacles）。placements＝[{col,row,angle(0〜3)}]。
// 戻り値 { result: 'nest'|'wrongNest'|'fall'|'timeout', steps, path } 。path はたまごの通ったマス列（落下位置を含む）。
export function simulate(egg, placements) {
  const { cols, rows } = egg.grid;
  const plate = new Map(placements.map((p) => [key(p.col, p.row), p.angle]));
  const block = new Set(egg.obstacles.map((o) => key(o.col, o.row)));
  const nest = new Map(egg.nests.map((n) => [key(n.col, n.row), n.correct ? 'nest' : 'wrongNest']));
  let c = egg.col;
  let r = -1;
  let dir = 0;
  let k = 0;
  const path = [{ col: c, row: r }];
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const nc = c + DX[dir];
    const nr = r + DY[dir];
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
      path.push({ col: nc, row: nr });
      return { result: 'fall', steps: step, path };
    }
    if (block.has(key(nc, nr))) { dir = REVERSE[dir]; k = GLIDE[dir] || 1; continue; }
    c = nc; r = nr;
    path.push({ col: c, row: r });
    const hit = nest.get(key(c, r));
    if (hit) return { result: hit, steps: step, path };
    const a = plate.get(key(c, r));
    const out = a === undefined ? -1 : REFLECT[a][dir];
    if (out >= 0) { dir = out; k = GLIDE[out]; }
    else if (dir !== 0) { k -= 1; if (k <= 0) { dir = 0; k = 0; } }
  }
  return { result: 'timeout', steps: MAX_STEPS, path };
}

export const isSolved = (egg, placements) => simulate(egg, placements).result === 'nest';

// 全探索：places から1〜limit 個を選び、各4向き。
export function solve(egg) {
  const t0 = performance.now();
  const P = egg.places;
  const limit = egg.limit;
  const bySize = new Array(limit + 1).fill(0);
  const space = new Array(limit + 1).fill(0);
  const outcomes = { nest: 0, wrongNest: 0, fall: 0, timeout: 0 };
  const sols = [];
  const cur = [];
  const walk = (start) => {
    const n = cur.length;
    space[n] += 1;
    const r = simulate(egg, cur).result;
    outcomes[r] += 1;
    if (r === 'nest' && n > 0) { bySize[n] += 1; if (sols.length < 100000) sols.push(cur.map((p) => ({ ...p }))); }
    if (n === limit) return;
    for (let i = start; i < P.length; i += 1) {
      for (let a = 0; a < ANGLES.length; a += 1) {
        cur.push({ col: P[i].col, row: P[i].row, angle: a });
        walk(i + 1);
        cur.pop();
      }
    }
  };
  walk(0);
  let minParts = null;
  for (let n = 1; n <= limit; n += 1) if (bySize[n] > 0) { minParts = n; break; }
  const minSols = minParts === null ? [] : sols.filter((s) => s.length === minParts);
  return {
    minParts,
    solutions: bySize.reduce((a, b) => a + b, 0),
    minSolutions: minParts === null ? 0 : bySize[minParts],
    bySize,
    space: space.reduce((a, b) => a + b, 0) - 1, // 空置きを除く
    outcomes,
    sample: minSols[0] || null,
    ms: performance.now() - t0,
  };
}
