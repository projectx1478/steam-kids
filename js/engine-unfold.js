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
