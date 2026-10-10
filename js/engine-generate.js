// シードからgrid-runtimeの盤面を生成する純粋関数（Issue #68。DOMに触れない）。同じシードなら同じ盤面。
// 「パラメータ生成＋BFS検証」方式：乱数で配置→shortestPathで制約を判定→満たすまで再試行。
// generatorのスキーマは docs/lesson-schema.md。ギミック（items/ice/keys）はIssue #70で対応。
import { shortestPath, shortestSteps, simulate } from './engine-grid.js';
import { GIMMICKS } from './gimmicks/index.js';
import { KEY_COLORS } from './gimmicks/keys.js';

const MAX_ATTEMPTS = 400;
const ALLOWED = ['up', 'down', 'left', 'right'];

// 32bitシードから[0,1)の乱数列を返す数行のPRNG（外部ライブラリなし）。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const countTurns = (cmds) => cmds.filter((c, i) => i > 0 && c !== cmds[i - 1]).length;

// 制約を満たす盤面が見つからないときの手作り予備盤面（5×5）。壁の列を上か下へ回り込む8手。
const FALLBACK = {
  grid: { cols: 5, rows: 5 },
  start: { x: 0, y: 2 },
  goal: { x: 4, y: 2 },
  walls: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
  items: [],
  allowedCommands: ALLOWED,
  solution: ['right', 'up', 'up', 'right', 'right', 'down', 'down', 'right'],
  maxCommands: 10,
};

// generator.shape の形のプリセット（Issue #338。docs/lesson-schema.md）。水・橋の座標と盤の大きさ。
// 水以外のマスは陸。start・goal・items・walls は水を除いた陸から選ぶ。apart＝startとgoalを別の陸の塊
// （橋のマスを除いて分けた島）に置く暗黙の規則（glassesのみ）。
const rows = (cols, ys) => ys.flatMap((y) => Array.from({ length: cols }, (_, x) => ({ x, y })));
const pts = (list) => list.map(([x, y]) => ({ x, y }));
export const SHAPE_PRESETS = {
  round: {
    grid: { cols: 5, rows: 5 },
    water: pts([[0, 0], [1, 0], [3, 0], [4, 0], [0, 1], [4, 1], [0, 3], [4, 3], [0, 4], [1, 4], [3, 4], [4, 4]]),
    bridge: [],
  },
  bumpy: {
    grid: { cols: 5, rows: 4 },
    water: pts([[0, 0], [1, 0], [2, 0], [4, 0], [0, 1], [2, 2], [3, 2], [2, 3]]),
    bridge: [],
  },
  glasses: {
    grid: { cols: 6, rows: 4 },
    water: [...rows(6, [0, 3]), ...pts([[2, 2], [3, 2]])],
    bridge: pts([[2, 1], [3, 1]]),
    apart: true,
  },
};

// 陸のマスを、橋のマスを除いてつながる塊ごとに分けた番号（橋のマスは -1）。
function islandIds(land, bridge) {
  const key = (p) => `${p.x},${p.y}`;
  const bridgeSet = new Set(bridge.map(key));
  const ids = new Map(bridge.map((p) => [key(p), -1]));
  let next = 0;
  for (const p of land) {
    if (ids.has(key(p))) continue;
    const stack = [p];
    ids.set(key(p), next);
    while (stack.length > 0) {
      const c = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + dx, y: c.y + dy };
        const k = key(n);
        if (ids.has(k) || bridgeSet.has(k) || !land.some((q) => key(q) === k)) continue;
        ids.set(k, next);
        stack.push(n);
      }
    }
    next += 1;
  }
  return ids;
}

const inRange = (n, range) => n >= (range?.min ?? 0) && n <= (range?.max ?? Infinity);

const stripOf = (key, spec) => GIMMICKS.find((g) => g.key === key).strip(spec);
const countOf = (rng, range) => (range ? randInt(rng, range.min ?? 0, range.max ?? 0) : 0);

// items/iceの乱数配置。start/goal/walls確定後の残りセル（free）の先頭から取る。返り値はspecへ
// 展開するフィールドと未使用の残りセル。セルが足りなければnull（この試行を捨てる）。
function placeGimmicks(rng, generator, free) {
  const fields = { items: [] };
  let i = 0;
  const take = (n) => {
    if (i + n > free.length) return null;
    const got = free.slice(i, i + n);
    i += n;
    return got;
  };
  const itemCount = countOf(rng, generator.items);
  if (itemCount > 0) {
    const got = take(itemCount);
    if (!got) return null;
    fields.items = got;
  }
  const iceCount = countOf(rng, generator.ice);
  if (iceCount > 0) {
    const got = take(iceCount);
    if (!got) return null;
    fields.ice = got;
  }
  return { fields, free: free.slice(i) };
}

// かぎとドアの配置（pairCount組。1組＝同色のかぎ1＋ドア1）。ドアは現盤面の最短経路上の1マス、
// かぎはドアを壁扱いにして届く空きマスへ置く（解法関与のための経路配置。受理率確保の狙いもある）。
// keysMustMatter時は「ドアを壁にすると最短が伸びる」マスを最大4回再抽選する（最終判定は呼び出し側
// のチェック）。かぎの候補はpoolの先頭から到達可能なものを取る（pool自体がshuffle済みのため先頭
// 一致でもランダム性は保つ）。配置不能ならnull（この試行を捨てる）。
function placeKeys(rng, pairCount, spec, free, mustMatter) {
  const keys = [];
  const doors = [];
  const used = new Set(
    [spec.start, spec.goal, ...spec.walls, ...(spec.items ?? []), ...(spec.ice ?? [])].map((p) => `${p.x},${p.y}`)
  );
  const pool = free.filter((p) => !used.has(`${p.x},${p.y}`));
  const plain = (extraWalls, goal) => ({
    grid: spec.grid, start: spec.start, goal: goal ?? spec.goal,
    walls: [...spec.walls, ...extraWalls],
  });
  for (let n = 0; n < pairCount; n += 1) {
    const cur = { ...spec, keys, doors };
    const cmds = shortestPath(cur);
    if (!cmds) return null;
    const path = simulate(cmds, cur).path;
    const candidates = path.filter((p, i) => i > 0 && i < path.length - 1 && !used.has(`${p.x},${p.y}`));
    if (candidates.length === 0) return null;
    const baseSteps = shortestSteps(plain([]));
    let door = null;
    const tries = mustMatter ? Math.min(4, candidates.length) : 1;
    for (let t = 0; t < tries && !door; t += 1) {
      const c = candidates[Math.floor(rng() * candidates.length)];
      if (!mustMatter || shortestSteps(plain([c])) > baseSteps) door = c;
    }
    if (!door) return null;
    const color = KEY_COLORS[randInt(rng, 0, KEY_COLORS.length - 1)];
    const key = pool.find((p) => !used.has(`${p.x},${p.y}`)
      && `${p.x},${p.y}` !== `${door.x},${door.y}`
      && shortestSteps(plain([door], p)) !== Infinity);
    if (!key) return null;
    used.add(`${key.x},${key.y}`);
    used.add(`${door.x},${door.y}`);
    keys.push({ ...key, color });
    doors.push({ ...door, color });
  }
  return { keys, doors };
}

// generateMap(generator, seed) -> playステップ相当 {grid, start, goal, walls, items, allowedCommands,
// solution, maxCommands, fallback}。制約：shortestPath{min,max}（最短手数）・minTurns（曲がり角）・
// wallsMustMatter（壁を全部外すと最短手数が短くなる。壁0個は不採用）。
// items/ice/keys（{min,max}の個数）と{items,ice,keys}MustMatterはIssue #70。MustMatterは各ギミックの
// strip(spec)（ギミックを除いた盤面）との最短手数比較で判定（items/keysは「外すと短くなる」、iceは
// 「手数が変わる」）。maxCommands＝最短手数＋maxCommandsSlack。再試行はMAX_ATTEMPTS回で、満たせなければ
// 予備盤面（fallback: true。ギミックなし）を返す。generator.shape（"round"|"bumpy"|"glasses"）は
// SHAPE_PRESETS の水・橋を結果の water・bridge に出し、start・goal・items・walls は陸から選ぶ。generator.shape（"round"|"bumpy"|"glasses"）は
// SHAPE_PRESETS の水・橋（結果の water・bridge）を置き、start・goal・items・walls は陸から選ぶ。
export function generateMap(generator, seed) {
  const rng = mulberry32(seed);
  const preset = generator.shape ? SHAPE_PRESETS[generator.shape] : null;
  const grid = generator.grid ?? preset?.grid;
  const waterKeys = new Set((preset?.water ?? []).map((p) => `${p.x},${p.y}`));
  const cells = [];
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) if (!waterKeys.has(`${x},${y}`)) cells.push({ x, y });
  }
  const islands = preset?.apart ? islandIds(cells, preset.bridge) : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const order = shuffle(rng, cells);
    if (islands) {
      const a = islands.get(`${order[0].x},${order[0].y}`);
      const b = islands.get(`${order[1].x},${order[1].y}`);
      if (a < 0 || b < 0 || a === b) continue;
    }
    const wallCount = Math.min(randInt(rng, generator.walls?.min ?? 0, generator.walls?.max ?? 0), cells.length - 2);
    let spec = { grid, start: order[0], goal: order[1], walls: order.slice(2, 2 + wallCount), items: [] };
    if (preset) spec = { ...spec, water: preset.water, ...(preset.bridge.length > 0 ? { bridge: preset.bridge } : {}) };
    let free = order.slice(2 + wallCount);
    if (generator.items || generator.ice) {
      const placed = placeGimmicks(rng, generator, free);
      if (!placed) continue;
      spec = { ...spec, ...placed.fields };
      free = placed.free;
    }
    const pairCount = countOf(rng, generator.keys);
    if (pairCount > 0) {
      const placedKeys = placeKeys(rng, pairCount, spec, free, Boolean(generator.keysMustMatter));
      if (!placedKeys) continue;
      spec = { ...spec, keys: placedKeys.keys, doors: placedKeys.doors };
    }
    const cmds = shortestPath(spec);
    if (!cmds || !inRange(cmds.length, generator.shortestPath)) continue;
    if (countTurns(cmds) < (generator.minTurns ?? 0)) continue;
    if (generator.wallsMustMatter && shortestSteps({ ...spec, walls: [] }) >= cmds.length) continue;
    if (generator.itemsMustMatter && shortestSteps(stripOf('items', spec)) >= cmds.length) continue;
    if (generator.iceMustMatter && shortestSteps(stripOf('ice', spec)) === cmds.length) continue;
    if (generator.keysMustMatter && shortestSteps(stripOf('keys', spec)) >= cmds.length) continue;
    return {
      ...spec,
      allowedCommands: ALLOWED,
      solution: cmds,
      maxCommands: cmds.length + (generator.maxCommandsSlack ?? 0),
      fallback: false,
    };
  }
  return { ...FALLBACK, fallback: true };
}
