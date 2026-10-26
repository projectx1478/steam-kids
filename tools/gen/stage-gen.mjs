// 1盤の生成（Issue #337 段2）。js/engine-generate.js の骨格（配置→最短→制約判定→再試行）を tools/ に書き直したもの。
// 入力は stageGen（docs/lesson-schema.md の予定仕様）。実行時は使わない。js/ は変えない。
import { shortestPath, shortestSteps, simulate } from '../../js/engine-grid.js';
import { GIMMICKS, mattersFor } from '../../js/gimmicks/index.js';
import { KEY_COLORS } from '../../js/gimmicks/keys.js';
import { mulberry32 } from '../../js/engine-generate.js';
import { iceMustMatter, keysMustMatter, warpsMustMatter, periodicMustMatter, paintMustMatter, waterMustMatter } from '../lib/must-matter.mjs';
import { OPEN_COUNT } from '../../js/gimmicks/periodic.js';

// 生成器の出力が変わるときに上げる。stageGen.ver と gen.ver を揃えて書き直す。
export const GEN_VERSION = 1;
const MAX_ATTEMPTS = 400;
// 探索量の上限（Issue #394）。js/engine-grid.js の探索は中でノード数を数えないため、1回の探索の状態数の見積り
// （マス数 × 2^(どんぐり＋かぎ組＋スイッチ)）を足し上げて決定的に打ち切る（時計は使わない）。
// 400回の再試行をすべて使い切る最悪でも、6×6でどんぐり1〜2個程度の盤は 100万を超えないので、従来の挙動と変わらない。
// 20×20 の最悪（予備盤なし）の実測は docs/tools.md。
export const MAX_WORK = 1_000_000;
// 探索量の上限で打ち切ったときの戻り値（予備盤なしの null と区別する）
export const GEN_ABORTED = Symbol('GEN_ABORTED');
const ALLOWED = ['up', 'down', 'left', 'right'];

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const countOf = (rng, range) => (range ? randInt(rng, range.min ?? 0, range.max ?? 0) : 0);
const inRange = (n, range) => n >= (range?.min ?? 0) && n <= (range?.max ?? Infinity);
const keyOf = (p) => `${p.x},${p.y}`;
const countTurns = (cmds) => cmds.filter((c, i) => i > 0 && c !== cmds[i - 1]).length;

function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// どんぐりの必須性は tools/lib/must-matter.mjs へ移動（既存の import 先を変えないため再 export）
export { itemsMustMatter } from '../lib/must-matter.mjs';

// 最短の手数と曲がり角数（難しさの主・補助指標）
export function metrics(board) {
  return { steps: board.solution.length, turns: countTurns(board.solution) };
}

// 回転・鏡写し8通りの正規形（辞書順で最小の文字列）。ギミックは色も含める。
export function canonicalKey(board) {
  const { cols, rows } = board.grid;
  const flips = [
    (x, y) => [x, y, cols, rows],
    (x, y) => [cols - 1 - x, y, cols, rows],
    (x, y) => [x, rows - 1 - y, cols, rows],
    (x, y) => [cols - 1 - x, rows - 1 - y, cols, rows],
    (x, y) => [y, x, rows, cols],
    (x, y) => [rows - 1 - y, x, rows, cols],
    (x, y) => [y, cols - 1 - x, rows, cols],
    (x, y) => [rows - 1 - y, cols - 1 - x, rows, cols],
  ];
  const layers = [
    ['s', board.start ? [board.start] : []], ['g', board.goal ? [board.goal] : []],
    ['w', board.walls ?? []], ['i', board.items ?? []], ['c', board.ice ?? []],
    ['k', board.keys ?? []], ['d', board.doors ?? []],
  ];
  // cushion・switches の層は空でないときだけ足す（既存の正規形を変えない）
  if (board.cushion?.length) layers.push(['u', board.cushion]);
  if (board.switches?.length) {
    layers.push(['x', board.switches.map(({ x, y }) => ({ x, y }))]);
    layers.push(['t', board.switches.flatMap((s) => s.targets)]);
  }
  // warps の層（x,y,pair）も空でないときだけ足す。pair は色の欄に入れる。
  if (board.warps?.length) layers.push(['p', board.warps.map(({ x, y, pair }) => ({ x, y, color: pair }))]);
  // 周期ドアの層（x,y,period）も空でないときだけ足す。period は色の欄に入れる。
  if (board.periodic?.length) layers.push(['q', board.periodic.map(({ x, y, period }) => ({ x, y, color: period }))]);
  // 色ぬりの目標の層も空でないときだけ足す。
  if (board.paint?.length) layers.push(['n', board.paint]);
  // 水の層も空でないときだけ足す（橋は描画専用なので含めない）。
  if (board.water?.length) layers.push(['e', board.water]);
  let best = null;
  for (const f of flips) {
    const parts = layers.map(([tag, cells]) => {
      const list = cells.map((p) => `${f(p.x, p.y).slice(0, 2).join(',')}${p.color ?? ''}`).sort();
      return `${tag}:${list.join(';')}`;
    });
    const [, , w, h] = f(0, 0);
    const text = `${w}x${h}|${parts.join('|')}`;
    if (best === null || text < best) best = text;
  }
  return best;
}

// かぎとドアの配置（engine-generate の placeKeys と同じ考え方）。ドアは現盤の最短経路上の1マス、
// かぎはドアを壁扱いにして届く空きマス。ドアを壁にすると最短が伸びるマスを最大4回選び直す。
function placeKeys(rng, pairCount, spec, free) {
  const keys = [];
  const doors = [];
  const used = new Set(
    [spec.start, spec.goal, ...spec.walls, ...(spec.items ?? []), ...(spec.ice ?? [])].map(keyOf)
  );
  const pool = free.filter((p) => !used.has(keyOf(p)));
  const plain = (extraWalls, goal) => ({
    grid: spec.grid, start: spec.start, goal: goal ?? spec.goal, walls: [...spec.walls, ...extraWalls],
  });
  for (let n = 0; n < pairCount; n += 1) {
    const cur = { ...spec, keys, doors };
    const cmds = shortestPath(cur);
    if (!cmds) return null;
    const path = simulate(cmds, cur).path;
    const candidates = path.filter((p, i) => i > 0 && i < path.length - 1 && !used.has(keyOf(p)));
    if (candidates.length === 0) return null;
    const baseSteps = shortestSteps(plain([]));
    let door = null;
    const tries = Math.min(4, candidates.length);
    for (let t = 0; t < tries && !door; t += 1) {
      const c = candidates[Math.floor(rng() * candidates.length)];
      if (shortestSteps(plain([c])) > baseSteps) door = c;
    }
    if (!door) return null;
    const color = KEY_COLORS[randInt(rng, 0, KEY_COLORS.length - 1)];
    const key = pool.find((p) => !used.has(keyOf(p)) && keyOf(p) !== keyOf(door)
      && shortestSteps(plain([door], p)) !== Infinity);
    if (!key) return null;
    used.add(keyOf(key));
    used.add(keyOf(door));
    keys.push({ ...key, color });
    doors.push({ ...door, color });
  }
  return { keys, doors };
}

// スイッチ（open・1組＝スイッチ1＋対象1）の配置。対象は現盤の最短経路上の1マス（壁になる）、スイッチは
// 対象を壁扱いにしても盤が解ける空きマス。見つからなければ null。
function placeSwitches(rng, pairCount, spec, free) {
  const switches = [];
  const used = new Set(
    [spec.start, spec.goal, ...spec.walls, ...(spec.items ?? []), ...(spec.ice ?? []), ...(spec.cushion ?? []),
      ...(spec.keys ?? []), ...(spec.doors ?? [])].map(keyOf)
  );
  const pool = free.filter((p) => !used.has(keyOf(p)));
  for (let n = 0; n < pairCount; n += 1) {
    const cur = { ...spec, switches };
    const cmds = shortestPath(cur);
    if (!cmds) return null;
    const path = simulate(cmds, cur).path;
    const candidates = path.filter((p, i) => i > 0 && i < path.length - 1 && !used.has(keyOf(p)));
    if (candidates.length === 0) return null;
    const target = candidates[Math.floor(rng() * candidates.length)];
    const sw = pool.find((p) => !used.has(keyOf(p)) && keyOf(p) !== keyOf(target)
      && shortestSteps({ ...spec, switches: [...switches, { x: p.x, y: p.y, targets: [{ x: target.x, y: target.y }] }] }) !== Infinity);
    if (!sw) return null;
    used.add(keyOf(sw));
    used.add(keyOf(target));
    switches.push({ x: sw.x, y: sw.y, targets: [{ x: target.x, y: target.y }] });
  }
  return switches;
}

// いま盤で使われているマス（start・goal・壁・items・ice・cushion・かぎ・ドア・スイッチとその対象・warps・periodic・water）。
// warps・periodic・water の配置が避けるマスを1か所に集める（Issue #531）。
function occupied(spec) {
  const cells = [spec.start, spec.goal, ...spec.walls, ...(spec.items ?? []), ...(spec.ice ?? []), ...(spec.cushion ?? []),
    ...(spec.keys ?? []), ...(spec.doors ?? []), ...(spec.warps ?? []), ...(spec.periodic ?? []), ...(spec.water ?? [])];
  for (const s of spec.switches ?? []) cells.push(s, ...(s.targets ?? []));
  return new Set(cells.map(keyOf));
}

// ワープ（pair 1・2 を組ごとに2個）の配置。入口は現盤の最短経路上の中間マス、出口は未使用の床。
// 穴に入ると組のもう一方へ移るので、その組を足すと最短が縮む出口だけを選ぶ。見つからなければ null。
function placeWarps(rng, pairCount, spec, free) {
  const warps = [];
  const used = occupied(spec);
  const pool = free.filter((p) => !used.has(keyOf(p)));
  for (let n = 0; n < pairCount; n += 1) {
    const pair = n + 1;
    const cur = { ...spec, warps };
    const cmds = shortestPath(cur);
    if (!cmds) return null;
    const path = simulate(cmds, cur).path;
    const candidates = path.filter((p, i) => i > 0 && i < path.length - 1 && !used.has(keyOf(p)));
    if (candidates.length === 0) return null;
    const entry = candidates[Math.floor(rng() * candidates.length)];
    const curSteps = cmds.length;
    const exit = pool.find((p) => !used.has(keyOf(p)) && keyOf(p) !== keyOf(entry)
      && shortestSteps({ ...spec, warps: [...warps, { x: entry.x, y: entry.y, pair }, { x: p.x, y: p.y, pair }] }) < curSteps);
    if (!exit) return null;
    used.add(keyOf(entry));
    used.add(keyOf(exit));
    warps.push({ x: entry.x, y: entry.y, pair }, { x: exit.x, y: exit.y, pair });
  }
  return warps;
}

// 周期ドア（period 3・4 のみ）の配置。ドアは現盤の最短経路上の中間マスで、そこへ入る手番が閉の位相になる
// period を選ぶ（開いているうちに通るだけの飾りにしない）。period 2 は生成しない。見つからなければ null。
const PERIODS = [3, 4];
function placePeriodic(rng, doorCount, spec) {
  const periodic = [];
  const used = occupied(spec);
  for (let n = 0; n < doorCount; n += 1) {
    const cur = { ...spec, periodic };
    const cmds = shortestPath(cur);
    if (!cmds) return null;
    const path = simulate(cmds, cur).path;
    // path[i] へ入る手は moveOf[i-1] 番目（氷の滑走・ワープ・停止で path と手が1対1でなくても正しい）。
    // 手番は1手ごとに1進むので、手の番号＝その手の手番。その手番で閉じる period だけを候補にする。
    // 停止で積まれる重複のマス（直前と同じ位置）は入る手ではないので除く。
    const { moveOf } = simulate(cmds, cur);
    const options = [];
    path.forEach((p, i) => {
      if (i === 0 || i === path.length - 1 || used.has(keyOf(p))) return;
      if (keyOf(p) === keyOf(path[i - 1])) return;
      const turn = moveOf[i - 1];
      for (const period of PERIODS) if (turn % period >= OPEN_COUNT[period]) options.push({ p, period });
    });
    if (options.length === 0) return null;
    const { p, period } = options[Math.floor(rng() * options.length)];
    used.add(keyOf(p));
    periodic.push({ x: p.x, y: p.y, period });
  }
  return periodic;
}

// 色ぬり（paint）の目標。start からの自己回避ランダムウォーク（長さ＝目標マス数 len）の細い経路型。
// 歩いたマスのうち直前の1マス以外とは隣り合わないので、2×2 などの塊は作らない。末端を goal にする
// （goal は spec.goal を上書き）。壁は踏まない。行き止まりなら null。目標マス数の上限は検査側（4〜8）。
const PAINT_BUDGET = 3000; // 混在時の経路探索の節点数の上限
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 混在時（#531 段2。水とだけ併用）は避けるマスを occupied(spec) に広げる（水マス・どんぐり・氷などを目標にしない。start・goal は除く）。
// 単独時は壁だけ避ける（旧経路。乱数の消費も結果も変えない）。
function placePaint(rng, len, spec, mixed = false) {
  const walls = mixed ? occupied(spec) : new Set(spec.walls.map(keyOf));
  if (mixed) { walls.delete(keyOf(spec.start)); walls.delete(keyOf(spec.goal)); }
  // aim があれば、そのマスを踏むまでは 8 割の確率で近づく向きへ歩く（混在時に川の隙間へ向かう）。
  const walkOnce = (aim) => {
    const walk = [{ x: spec.start.x, y: spec.start.y }];
    const seen = new Set([keyOf(spec.start)]);
    while (walk.length < len) {
      const last = walk[walk.length - 1];
      const next = DIRS.map(([dx, dy]) => ({ x: last.x + dx, y: last.y + dy })).filter((p) => {
        if (p.x < 0 || p.y < 0 || p.x >= spec.grid.cols || p.y >= spec.grid.rows) return false;
        if (walls.has(keyOf(p)) || seen.has(keyOf(p))) return false;
        return DIRS.every(([dx, dy]) => {
          const q = { x: p.x + dx, y: p.y + dy };
          return !seen.has(keyOf(q)) || keyOf(q) === keyOf(last);
        });
      });
      if (next.length === 0) return null;
      let p;
      if (aim && !seen.has(keyOf(aim)) && rng() < 0.8) {
        const dist = (q) => Math.abs(q.x - aim.x) + Math.abs(q.y - aim.y);
        const best = Math.min(...next.map(dist));
        const near = next.filter((q) => dist(q) === best);
        p = near[Math.floor(rng() * near.length)];
      } else {
        p = next[Math.floor(rng() * next.length)];
      }
      walk.push(p);
      seen.add(keyOf(p));
    }
    return walk;
  };
  if (!mixed) {
    const walk = walkOnce();
    return walk && { paint: walk, goal: walk[walk.length - 1] };
  }
  // 混在時は、水に挟まれた隙間（橋になるマス）を途中で通る経路を、順序を乱数で振った深さ優先で探す（川を渡る目標にする）。
  // 隙間に届かない枝は残り手数で切る。塗りが飾りにならないよう、塗り無しの最短（水ありのまま）より経路が長いものだけ採る
  // （paintMustMatter と同じ向き）。探索は PAINT_BUDGET 節点で打ち切る（決定的）。
  const water = new Set((spec.water ?? []).map(keyOf));
  const at = (p, dx, dy) => water.has(`${p.x + dx},${p.y + dy}`);
  const crosses = (p) => (at(p, -1, 0) && at(p, 1, 0)) || (at(p, 0, -1) && at(p, 0, 1));
  const aims = [];
  for (let y = 0; y < spec.grid.rows; y += 1) {
    for (let x = 0; x < spec.grid.cols; x += 1) if (!water.has(`${x},${y}`) && !walls.has(`${x},${y}`) && crosses({ x, y })) aims.push({ x, y });
  }
  if (water.size > 0 && aims.length === 0) return null;
  const toAim = (q) => Math.min(...aims.map((a) => Math.abs(q.x - a.x) + Math.abs(q.y - a.y)));
  let budget = PAINT_BUDGET;
  const walk = [{ x: spec.start.x, y: spec.start.y }];
  const seen = new Set([keyOf(spec.start)]);
  const dfs = () => {
    const last = walk[walk.length - 1];
    if (walk.length === len) {
      if (water.size > 0 && !walk.some((p, i) => i > 0 && i < len - 1 && crosses(p))) return false;
      return shortestSteps({ ...spec, goal: last }) < len - 1;
    }
    if (budget <= 0) return false;
    budget -= 1;
    const crossed = water.size === 0 || walk.some((p) => aims.some((a) => keyOf(a) === keyOf(p)));
    for (const p of shuffle(rng, DIRS.map(([dx, dy]) => ({ x: last.x + dx, y: last.y + dy })))) {
      if (p.x < 0 || p.y < 0 || p.x >= spec.grid.cols || p.y >= spec.grid.rows) continue;
      if (walls.has(keyOf(p)) || seen.has(keyOf(p))) continue;
      if (!DIRS.every(([dx, dy]) => {
        const q = { x: p.x + dx, y: p.y + dy };
        return !seen.has(keyOf(q)) || keyOf(q) === keyOf(last);
      })) continue;
      // 隙間をまだ通っていなければ、隙間の先に最低 1 マス残る手数で届くこと
      if (!crossed && toAim(p) + 1 > len - walk.length - 1) continue;
      walk.push(p);
      seen.add(keyOf(p));
      if (dfs()) return true;
      walk.pop();
      seen.delete(keyOf(p));
    }
    return false;
  };
  return dfs() ? { paint: [...walk], goal: walk[walk.length - 1] } : null;
}

// 水（water）の配置。盤を横か縦に横切る直線上の連続した (水マス数+1) マスのうち1マスだけ水にせず（隙間）、
// 残りを水にした帯。水・橋を外した盤の最短より実際の最短が +2 以上長いものだけ採る（帯が迂回を強いる）。
// 水は壁・start・goal に重ねない。waterMode は呼び出し側が cushion 固定で付ける。条件に合わなければ null。
// paint と併用のとき（detour=false）は、goal が後で目標の末端に置き換わるので、この仮の goal での迂回条件は見ない（橋を通る経路は placePaint 側で求める）。
function placeWater(rng, waterCount, spec, detour = true) {
  const { cols, rows } = spec.grid;
  const horizontal = rng() < 0.5; // true: 横一列の帯（行 y 固定）
  const lineLen = horizontal ? cols : rows;
  const lineCount = horizontal ? rows : cols;
  const span = waterCount + 1;
  if (span > lineLen) return null;
  const line = Math.floor(rng() * lineCount);
  const from = Math.floor(rng() * (lineLen - span + 1));
  const gap = from + Math.floor(rng() * span);
  const blocked = occupied(spec);
  const water = [];
  for (let i = from; i < from + span; i += 1) {
    if (i === gap) continue;
    const p = horizontal ? { x: i, y: line } : { x: line, y: i };
    if (blocked.has(keyOf(p))) return null;
    water.push(p);
  }
  const base = shortestSteps(spec);
  const actual = shortestSteps({ ...spec, water, waterMode: 'cushion' });
  if (base === Infinity || actual === Infinity || (detour && actual < base + 2)) return null;
  return water;
}

// 橋は最短確定後に置く。最短経路の中間マスのうち、反対側の2辺（左右か上下）がどちらも水のマス。なければ null（橋なし）。
function placeBridge(spec, cmds) {
  const water = new Set(spec.water.map(keyOf));
  const used = new Set([spec.start, spec.goal, ...spec.walls, ...spec.water].map(keyOf));
  const path = simulate(cmds, spec).path;
  const at = (p, dx, dy) => water.has(`${p.x + dx},${p.y + dy}`);
  const found = path.find((p, i) => i > 0 && i < path.length - 1 && !used.has(keyOf(p))
    && ((at(p, -1, 0) && at(p, 1, 0)) || (at(p, 0, -1) && at(p, 0, 1))));
  return found ? [{ x: found.x, y: found.y }] : null;
}

// teach のギミックの必須性
function teachMatters(teach, board) {
  const dist = board.solution.length;
  if (teach === 'items') return mattersFor('items', board, dist);
  const play = { ...board, maxCommands: dist };
  if (teach === 'ice') return iceMustMatter(play).matters;
  if (teach === 'keys') return keysMustMatter(play).matters;
  if (teach === 'cushion') return mattersFor('cushion', board, dist);
  if (teach === 'switches') return mattersFor('switches', board, dist);
  if (teach === 'warps') return warpsMustMatter(play).matters;
  if (teach === 'periodic') return periodicMustMatter(play, dist).matters;
  if (teach === 'paint') return paintMustMatter(play, dist).matters;
  if (teach === 'water') return waterMustMatter(play, dist).matters;
  return true;
}

// generateBoard(stageGen, seed) -> 盤 {grid,start,goal,walls,items,[ice],[keys,doors],allowedCommands,solution,maxCommands}。
// 400回の再試行で受理できなければ null（予備盤は作らない）。探索量が maxWork を超えたら GEN_ABORTED（盤は採用しない）。
export function generateBoard(stageGen, seed, { maxWork = MAX_WORK, maxAttempts = MAX_ATTEMPTS } = {}) {
  const rng = mulberry32(seed);
  const gim = stageGen.gimmicks ?? {};
  const allowed = stageGen.allowedCommands ?? ALLOWED;
  let work = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (work > maxWork) return GEN_ABORTED;
    const grid = {
      cols: randInt(rng, stageGen.grid.cols.min, stageGen.grid.cols.max),
      rows: randInt(rng, stageGen.grid.rows.min, stageGen.grid.rows.max),
    };
    const cells = [];
    for (let y = 0; y < grid.rows; y += 1) for (let x = 0; x < grid.cols; x += 1) cells.push({ x, y });
    const order = shuffle(rng, cells);
    const wallCount = Math.min(countOf(rng, stageGen.walls), cells.length - 2);
    let spec = { grid, start: order[0], goal: order[1], walls: order.slice(2, 2 + wallCount), items: [] };
    let free = order.slice(2 + wallCount);
    let cursor = 0;
    const take = (n) => {
      if (cursor + n > free.length) return null;
      const got = free.slice(cursor, cursor + n);
      cursor += n;
      return got;
    };
    const itemCount = countOf(rng, gim.items);
    if (itemCount > 0) {
      const got = take(itemCount);
      if (!got) continue;
      spec = { ...spec, items: got };
    }
    const iceCount = countOf(rng, gim.ice);
    if (iceCount > 0) {
      const got = take(iceCount);
      if (!got) continue;
      spec = { ...spec, ice: got };
    }
    free = free.slice(cursor);
    const pairCount = countOf(rng, gim.keys);
    if (pairCount > 0) {
      work += cells.length * 2 ** (itemCount + pairCount);
      const placed = placeKeys(rng, pairCount, spec, free);
      if (!placed) continue;
      spec = { ...spec, keys: placed.keys, doors: placed.doors };
      // keyMode（Issue #391）は指定されたときだけ盤へ付ける（乱数は引かない。無指定＝carry）
      if (stageGen.keyMode) spec = { ...spec, keyMode: stageGen.keyMode };
    }
    // cushion→switches は既存の乱数消費の後ろ。範囲未指定なら乱数を引かない。
    const cushionCount = gim.cushion ? countOf(rng, gim.cushion) : 0;
    if (cushionCount > 0) {
      const taken = new Set(
        [...(spec.keys ?? []), ...(spec.doors ?? [])].map(keyOf)
      );
      const got = free.filter((p) => !taken.has(keyOf(p))).slice(0, cushionCount);
      if (got.length < cushionCount) continue;
      spec = { ...spec, cushion: got };
    }
    const switchCount = gim.switches ? countOf(rng, gim.switches) : 0;
    if (switchCount > 0) {
      work += cells.length * 2 ** (itemCount + switchCount);
      const placed = placeSwitches(rng, switchCount, spec, free);
      if (!placed) continue;
      spec = { ...spec, switches: placed };
    }
    // items・かぎ・スイッチは状態数を倍にする。warps・water・periodic の配置中の探索見積りへ掛ける（単独指定では 1）。
    const stateMul = 2 ** (itemCount + pairCount + switchCount);
    // warps は switches の後ろ。範囲未指定なら乱数を引かない（既存 seed の盤を変えない）。
    const warpCount = gim.warps ? countOf(rng, gim.warps) : 0;
    if (warpCount > 0) {
      work += cells.length * warpCount * 4 * stateMul;
      const placed = placeWarps(rng, warpCount, spec, free);
      if (!placed) continue;
      spec = { ...spec, warps: placed };
    }
    // water は warps の後ろ（順序：水→色ぬり→周期ドア。warps・periodic・water は1種までなので同時には来ない。色ぬりは水とだけ併用）。範囲未指定なら乱数を引かない。
    // 水は状態を増やさないので、見積りは 水なし・水ありの探索 2 回分（マス数 × 4）。waterMode は cushion 固定。
    const waterCount = gim.water ? countOf(rng, gim.water) : 0;
    if (waterCount > 0) {
      work += cells.length * 4 * stateMul;
      const placed = placeWater(rng, waterCount, spec, !gim.paint);
      if (!placed) continue;
      spec = { ...spec, water: placed, waterMode: 'cushion' };
    }
    // periodic は warps の後ろ。範囲未指定なら乱数を引かない。状態数は周期（最大 lcm(3,4)=12）倍。
    const periodicCount = gim.periodic ? countOf(rng, gim.periodic) : 0;
    if (periodicCount > 0) {
      work += cells.length * periodicCount * 12 * stateMul;
      const placed = placePeriodic(rng, periodicCount, spec);
      if (!placed) continue;
      spec = { ...spec, periodic: placed };
    }
    // paint は periodic の後ろ（水とだけ併用できる。periodic とは同時に来ない）。範囲未指定なら乱数を引かない。目標マス数は 4〜8（検査側）。
    // 塗り集合は目標外で枝刈りされるので、状態数の見積りは マス数 × 目標マス数 × 8。
    const paintLen = gim.paint ? countOf(rng, gim.paint) : 0;
    if (paintLen > 0) {
      work += cells.length * paintLen * 8;
      const mixed = Boolean(spec.water || spec.warps || spec.periodic || spec.keys || spec.switches || spec.cushion
        || spec.items?.length || spec.ice?.length);
      const placed = placePaint(rng, paintLen, spec, mixed);
      if (!placed) continue;
      spec = { ...spec, goal: placed.goal, paint: placed.paint };
    }
    work += cells.length * 2 ** (itemCount + pairCount + switchCount) * (periodicCount > 0 ? 12 : 1);
    const cmds = shortestPath(spec, { maxDepth: stageGen.shortestPath.max });
    if (!cmds || !inRange(cmds.length, stageGen.shortestPath)) continue;
    if (countTurns(cmds) < (stageGen.minTurns ?? 0)) continue;
    if (cmds.some((c) => !allowed.includes(c))) continue;
    // 橋は最短が確定してから置く（置けなければ橋なし）。
    if (spec.water) {
      const bridge = placeBridge(spec, cmds);
      if (bridge) spec = { ...spec, bridge };
    }
    const board = { ...spec, allowedCommands: allowed, solution: cmds, maxCommands: cmds.length };
    // teach＋新たに混ぜた1種（warps・periodic・water のうち指定されたもの。teach と同じなら重ねない）を判定する。
    // paint×water は、水が最短を伸ばさない（目標の細い経路は水を踏まない）ので、水の必須性の代わりに
    // 「目標の経路が橋のマス（水に挟まれた隙間）を通る」ことを求める（川を渡る盤にする）。
    const paintWater = board.paint?.length > 0 && board.water?.length > 0;
    if (paintWater && !board.bridge) continue;
    if (stageGen.teach) {
      const mixed = ['warps', 'periodic', 'water'].find((k) => board[k]?.length > 0 && k !== stageGen.teach);
      if (!(paintWater && stageGen.teach === 'water') && !teachMatters(stageGen.teach, board)) continue;
      if (mixed && !(paintWater && mixed === 'water') && !teachMatters(mixed, board)) continue;
    }
    return board;
  }
  return null;
}
