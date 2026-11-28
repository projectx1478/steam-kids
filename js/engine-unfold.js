// unfold-cube（てんかいず・はこ）の展開図エンジン（純関数。DOM・保存に触れない。Issue #289）。
// cells＝[{x,y}]。格子は cols×rows。正解＝preset を含み、立方体の展開図になる格子内の6マス集合。

export const CUBE_CELLS = 6;

const key = (c) => c.x + ',' + c.y;
const byYX = (a, b) => a.y - b.y || a.x - b.x;

// 先頭マス＝y 最小・同 y なら x 最小のマス。
export function headCell(cells) {
  return [...cells].sort(byYX)[0];
}

// 立方体を1マス転がしたときの面の入れ替え。o＝{b:下,t:上,n:北,s:南,e:東,w:西} の面id。
function roll(o, d) {
  if (d === 'E') return { b: o.e, e: o.t, t: o.w, w: o.b, n: o.n, s: o.s };
  if (d === 'W') return { b: o.w, w: o.t, t: o.e, e: o.b, n: o.n, s: o.s };
  if (d === 'S') return { b: o.s, s: o.t, t: o.n, n: o.b, e: o.e, w: o.w };
  return { b: o.n, n: o.t, t: o.s, s: o.b, e: o.e, w: o.w }; // 'N'
}

// 折る順＝上・右・下・左。
const FOLD_DIRS = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];

// 先頭マスから幅優先で折っていく。{ faces: マスkey→面id, overlap: null | [先に取ったマス, 今来たマス] }
function fold(cells) {
  const set = new Map(cells.map((c) => [key(c), c]));
  const start = headCell(cells);
  const ori = new Map([[key(start), { b: 0, t: 1, n: 2, s: 3, e: 4, w: 5 }]]);
  const byFace = new Map([[0, start]]);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi += 1) {
    const c = queue[qi];
    for (const [d, dx, dy] of FOLD_DIRS) {
      const nx = set.get(key({ x: c.x + dx, y: c.y + dy }));
      if (!nx) continue;
      const o = roll(ori.get(key(c)), d);
      if (ori.has(key(nx))) {
        // 閉路（2×2 など）で食い違う。
        if (ori.get(key(nx)).b !== o.b) return { ori, overlap: [byFace.get(o.b) ?? c, nx] };
        continue;
      }
      if (byFace.has(o.b)) return { ori, overlap: [byFace.get(o.b), nx] };
      ori.set(key(nx), o);
      byFace.set(o.b, nx);
      queue.push(nx);
    }
  }
  return { ori, overlap: null };
}

// 立方体の展開図か（6マス・重複なし・連結・折って6面が全部異なる）。
export function isCubeNet(cells) {
  if (!Array.isArray(cells) || cells.length !== CUBE_CELLS) return false;
  if (new Set(cells.map(key)).size !== CUBE_CELLS) return false;
  const { ori, overlap } = fold(cells);
  return overlap === null && ori.size === CUBE_CELLS;
}

// 同じ面に重なる最初の2マス。重なりが無い（展開図か、非連結で折れない）ときは null。
// 規約：先頭マス＝y 最小・同 y なら x 最小のマス。そこから幅優先で隣を上・右・下・左の順に折っていき、
// すでに別のマスが取っている面に来たマスを見つけた時点で、[先に取ったマス, 今来たマス]。
export function firstOverlap(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return null;
  return fold(cells).overlap;
}

// 最大の連結成分に入らないマス（y,x 順）。同じ大きさなら先頭マスを含む成分を最大とみなす。
export function disconnectedCells(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return [];
  const set = new Map(cells.map((c) => [key(c), c]));
  const comp = new Map();
  const sizes = [];
  const head = headCell(cells);
  const order = [head, ...[...cells].sort(byYX)];
  for (const c of order) {
    if (comp.has(key(c))) continue;
    const id = sizes.length;
    comp.set(key(c), id);
    const queue = [c];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const a = queue[qi];
      for (const [, dx, dy] of FOLD_DIRS) {
        const k = key({ x: a.x + dx, y: a.y + dy });
        if (set.has(k) && !comp.has(k)) {
          comp.set(k, id);
          queue.push(set.get(k));
        }
      }
    }
    sizes.push(queue.length);
  }
  let big = 0; // 先頭マスの成分（id 0）が先に来るので、同数なら id 0 が残る
  sizes.forEach((n, i) => { if (n > sizes[big]) big = i; });
  return [...cells].filter((c) => comp.get(key(c)) !== big).sort(byYX);
}

// 折り上げの木（Issue #713）。main（離れたマスを除いた集合）を、先頭マスを根（面0）に幅優先で上・右・下・左の順にたどる。
// 木の辺は未訪問のマスだけ（訪問済みへの辺は切る）。面id＝roll の b（0底・1ふた・2北・3南・4東・5西）。
// nodes＝訪問順 [{x,y,parent,dir,face}]、over＝同じ面を2マス以上が持つマス（y,x 順）、holes＝どのマスも持たない面（昇順）。
export function foldTree(cells) {
  const empty = { nodes: [], over: [], holes: [0, 1, 2, 3, 4, 5] };
  if (!Array.isArray(cells) || cells.length === 0) return empty;
  const far = new Set(disconnectedCells(cells).map(key));
  const main = cells.filter((c) => !far.has(key(c)));
  const set = new Map(main.map((c) => [key(c), c]));
  const start = headCell(main);
  const ori = new Map([[key(start), { b: 0, t: 1, n: 2, s: 3, e: 4, w: 5 }]]);
  const nodes = [{ x: start.x, y: start.y, parent: null, dir: null, face: 0 }];
  for (let qi = 0; qi < nodes.length; qi += 1) {
    const c = nodes[qi];
    for (const [d, dx, dy] of FOLD_DIRS) {
      const nk = key({ x: c.x + dx, y: c.y + dy });
      if (!set.has(nk) || ori.has(nk)) continue;
      const o = roll(ori.get(key(c)), d);
      ori.set(nk, o);
      nodes.push({ x: c.x + dx, y: c.y + dy, parent: { x: c.x, y: c.y }, dir: d, face: o.b });
    }
  }
  const count = new Map();
  nodes.forEach((n) => count.set(n.face, (count.get(n.face) || 0) + 1));
  const over = nodes.filter((n) => count.get(n.face) > 1).map((n) => ({ x: n.x, y: n.y })).sort(byYX);
  const holes = [0, 1, 2, 3, 4, 5].filter((f) => !count.has(f));
  return { nodes, over, holes };
}

const netsCache = new Map();

// 格子内の展開図（6マス集合）を全部。各集合は y,x 順。
function allNets(cols, rows) {
  const ck = `${cols}x${rows}`;
  if (netsCache.has(ck)) return netsCache.get(ck);
  const all = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) all.push({ x, y });
  const res = [];
  const pick = [];
  const rec = (i) => {
    if (pick.length === CUBE_CELLS) {
      const cs = pick.map((j) => all[j]);
      if (isCubeNet(cs)) res.push(cs);
      return;
    }
    if (i >= all.length || pick.length + (all.length - i) < CUBE_CELLS) return;
    pick.push(i);
    rec(i + 1);
    pick.pop();
    rec(i + 1);
  };
  rec(0);
  netsCache.set(ck, res);
  return res;
}

// 格子内の全展開図（preset なし）。
export function gridNets(cols, rows) {
  return allNets(cols, rows).map((n) => n.map((c) => ({ ...c })));
}

// preset を含む展開図（正解）を全部。
export function solutionsOf(cols, rows, preset) {
  const need = (preset || []).map(key);
  return allNets(cols, rows)
    .filter((n) => { const s = new Set(n.map(key)); return need.every((k) => s.has(k)); })
    .map((n) => n.map((c) => ({ ...c })));
}

export function countSolutions(cols, rows, preset) {
  const need = (preset || []).map(key);
  return allNets(cols, rows).filter((n) => { const s = new Set(n.map(key)); return need.every((k) => s.has(k)); }).length;
}

// --- 色ぬり（unfold-02。Issue #811）。向かい合う面＝折り上げの face {0,1}・{2,3}・{4,5}（根がどこでも成り立つ）。 ---
export const COLOR_IDS = ['a', 'b', 'c'];
const OPEN_BOX_CELLS = 5;
const OPPOSITE_FACE = [1, 0, 3, 2, 5, 4];

const isXY = (c) => c !== null && typeof c === 'object' && Number.isInteger(c.x) && Number.isInteger(c.y);

// ふたのない箱の展開図か（5マス・重複なし・連結・折って5面が全部異なり、どのマスも持たない面がちょうど1つ＝ふた）。
export function isOpenBoxNet(cells) {
  if (!Array.isArray(cells) || cells.length !== OPEN_BOX_CELLS || !cells.every(isXY)) return false;
  if (new Set(cells.map(key)).size !== OPEN_BOX_CELLS) return false;
  if (disconnectedCells(cells).length > 0) return false;
  const { over, holes } = foldTree(cells);
  return over.length === 0 && holes.length === 1;
}

// ふたの向かいの面（そこ）のマス {x,y}。ふたのない箱の展開図でなければ null。
export function baseCell(cells) {
  if (!isOpenBoxNet(cells)) return null;
  const { nodes, holes } = foldTree(cells);
  const n = nodes.find((m) => m.face === OPPOSITE_FACE[holes[0]]);
  return n ? { x: n.x, y: n.y } : null;
}

// 向かい合う組。立方体かふたのない箱の展開図のときだけ。face {0,1}・{2,3}・{4,5} の順、両面がそろう組のみ。組の中は y,x 順。
export function oppositePairs(cells) {
  if (!(isCubeNet(cells) || isOpenBoxNet(cells))) return [];
  const byFace = new Map(foldTree(cells).nodes.map((n) => [n.face, { x: n.x, y: n.y }]));
  const res = [];
  for (const f of [0, 2, 4]) {
    if (byFace.has(f) && byFace.has(f + 1)) res.push([byFace.get(f), byFace.get(f + 1)].sort(byYX));
  }
  return res;
}

// 色がそろわない最初の組（oppositePairs の順）。colors＝{ "x,y": 色 }。全部そろえば null。
export function firstColorMismatch(cells, colors) {
  const col = colors || {};
  for (const pair of oppositePairs(cells)) {
    const c0 = col[key(pair[0])];
    if (c0 === undefined || c0 === null || c0 !== col[key(pair[1])]) return pair;
  }
  return null;
}

// 正解の数。空き（cells − given − そこ）を3色で塗る 3^k 通りのうち、全部の組がそろうもの。given＝{ "x,y": 色 }。
export function colorSolutionCount(cells, given) {
  const base = baseCell(cells);
  const g = given || {};
  const blanks = cells.filter((c) => g[key(c)] === undefined && !(base && key(base) === key(c)));
  const colors = { ...g };
  let count = 0;
  const rec = (i) => {
    if (i === blanks.length) {
      if (firstColorMismatch(cells, colors) === null) count += 1;
      return;
    }
    for (const c of COLOR_IDS) {
      colors[key(blanks[i])] = c;
      rec(i + 1);
    }
    delete colors[key(blanks[i])];
  };
  rec(0);
  return count;
}

// 展開図の型（回転・反転の8通りを平行移動で寄せた文字列のうち最小）。
const SHAPE_TRANSFORMS = [
  (x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x],
  (x, y) => [-x, y], (x, y) => [y, x], (x, y) => [x, -y], (x, y) => [-y, -x],
];
export function netShapeKey(cells) {
  const keys = SHAPE_TRANSFORMS.map((f) => {
    const pts = cells.map((c) => { const [x, y] = f(c.x, c.y); return { x, y }; });
    const mx = Math.min(...pts.map((p) => p.x));
    const my = Math.min(...pts.map((p) => p.y));
    return pts.map((p) => ({ x: p.x - mx, y: p.y - my })).sort(byYX).map(key).join('|');
  });
  return keys.sort()[0];
}
