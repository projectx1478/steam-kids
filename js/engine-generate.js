// シードからgrid-runtimeの盤面を生成する純粋関数（Issue #68。DOMに触れない）。同じシードなら同じ盤面。
// 「パラメータ生成＋BFS検証」方式：乱数で配置→shortestPathで制約を判定→満たすまで再試行。
// generatorのスキーマは docs/lesson-schema.md。
import { shortestPath, shortestSteps } from './engine-grid.js';

const MAX_ATTEMPTS = 200;
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

const inRange = (n, range) => n >= (range?.min ?? 0) && n <= (range?.max ?? Infinity);

// generateMap(generator, seed) -> playステップ相当 {grid, start, goal, walls, items, allowedCommands,
// solution, maxCommands, fallback}。制約：shortestPath{min,max}（最短手数）・minTurns（曲がり角）・
// wallsMustMatter（壁を全部外すと最短手数が短くなる。壁0個は不採用）。maxCommands＝最短手数＋maxCommandsSlack。
// itemsは0固定（ギミック対応はR3）。MAX_ATTEMPTS回で満たせなければ予備盤面（fallback: true）。
export function generateMap(generator, seed) {
  const rng = mulberry32(seed);
  const { grid } = generator;
  const cells = [];
  for (let y = 0; y < grid.rows; y += 1) for (let x = 0; x < grid.cols; x += 1) cells.push({ x, y });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const order = shuffle(rng, cells);
    const wallCount = Math.min(randInt(rng, generator.walls?.min ?? 0, generator.walls?.max ?? 0), cells.length - 2);
    const spec = { grid, start: order[0], goal: order[1], walls: order.slice(2, 2 + wallCount), items: [] };
    const cmds = shortestPath(spec);
    if (!cmds || !inRange(cmds.length, generator.shortestPath)) continue;
    if (countTurns(cmds) < (generator.minTurns ?? 0)) continue;
    if (generator.wallsMustMatter && shortestSteps({ ...spec, walls: [] }) >= cmds.length) continue;
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
