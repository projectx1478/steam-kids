// 1盤の生成（Issue #337 段2）。js/engine-generate.js の骨格（配置→最短→制約判定→再試行）を tools/ に書き直したもの。
// 入力は stageGen（docs/lesson-schema.md の予定仕様）。実行時は使わない。js/ は変えない。
import { shortestPath, shortestSteps, simulate } from '../../js/engine-grid.js';
import { GIMMICKS } from '../../js/gimmicks/index.js';
import { KEY_COLORS } from '../../js/gimmicks/keys.js';
import { mulberry32 } from '../../js/engine-generate.js';
import { iceMustMatter, keysMustMatter } from '../lib/must-matter.mjs';

// 生成器の出力が変わるときに上げる。stageGen.ver と gen.ver を揃えて書き直す。
export const GEN_VERSION = 1;
const MAX_ATTEMPTS = 400;
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

// どんぐりの必須性：どんぐりを除いた盤の最短 < 実際の最短 (generateMap の itemsMustMatter と同じ向き)
export function itemsMustMatter(spec, dist) {
  const strip = GIMMICKS.find((g) => g.key === 'items').strip(spec);
  return shortestSteps(strip) < dist;
}

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

// teach のギミックの必須性
function teachMatters(teach, board) {
  const dist = board.solution.length;
  if (teach === 'items') return itemsMustMatter(board, dist);
  const play = { ...board, maxCommands: dist };
  if (teach === 'ice') return iceMustMatter(play).matters;
  if (teach === 'keys') return keysMustMatter(play).matters;
  return true;
}

// generateBoard(stageGen, seed) -> 盤 {grid,start,goal,walls,items,[ice],[keys,doors],allowedCommands,solution,maxCommands}。
// 400回の再試行で受理できなければ null（予備盤は作らない）。
export function generateBoard(stageGen, seed) {
  const rng = mulberry32(seed);
  const gim = stageGen.gimmicks ?? {};
  const allowed = stageGen.allowedCommands ?? ALLOWED;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
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
      const placed = placeKeys(rng, pairCount, spec, free);
      if (!placed) continue;
      spec = { ...spec, keys: placed.keys, doors: placed.doors };
    }
    const cmds = shortestPath(spec);
    if (!cmds || !inRange(cmds.length, stageGen.shortestPath)) continue;
    if (countTurns(cmds) < (stageGen.minTurns ?? 0)) continue;
    if (cmds.some((c) => !allowed.includes(c))) continue;
    const board = { ...spec, allowedCommands: allowed, solution: cmds, maxCommands: cmds.length };
    if (stageGen.teach && !teachMatters(stageGen.teach, board)) continue;
    return board;
  }
  return null;
}
