// engine-generate: シード再現・1000件の制約充足・予備マップ・fallback盤面の妥当性（Issue #68）。
export const name = 'engine-generate: 同一シード再現・1000件が解けて制約充足・予備盤面(Issue #68)';

const generator = {
  grid: { cols: 5, rows: 5 },
  walls: { min: 3, max: 6 },
  shortestPath: { min: 5, max: 8 },
  minTurns: 2,
  wallsMustMatter: true,
  maxCommandsSlack: 2,
};

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const r = await page.evaluate(async (g) => {
    const { generateMap } = await import('/js/engine-generate.js');
    const { simulate, shortestSteps } = await import('/js/engine-grid.js');
    const turns = (c) => c.filter((x, i) => i > 0 && x !== c[i - 1]).length;
    let sameSeed = true;
    for (let s = 0; s < 100; s += 1) {
      if (JSON.stringify(generateMap(g, s)) !== JSON.stringify(generateMap(g, s))) sameSeed = false;
    }
    const diff = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generateMap(g, s)))).size;
    let unsolved = 0, badRange = 0, badTurns = 0, decorative = 0, badMax = 0, fallbacks = 0, badOverlap = 0;
    for (let s = 0; s < 1000; s += 1) {
      const m = generateMap(g, s);
      if (m.fallback) fallbacks += 1;
      const res = simulate(m.solution, m);
      if (!(res.reachedGoal && res.blockedAt.length === 0)) unsolved += 1;
      if (m.solution.length < g.shortestPath.min || m.solution.length > g.shortestPath.max) badRange += 1;
      if (turns(m.solution) < g.minTurns) badTurns += 1;
      if (shortestSteps({ ...m, walls: [] }) >= m.solution.length) decorative += 1;
      if (m.maxCommands !== m.solution.length + g.maxCommandsSlack) badMax += 1;
      const keys = [m.start, m.goal, ...m.walls].map((p) => `${p.x},${p.y}`);
      if (new Set(keys).size !== keys.length || m.walls.length < g.walls.min || m.walls.length > g.walls.max) badOverlap += 1;
    }
    const impossible = generateMap({ ...g, shortestPath: { min: 50, max: 60 } }, 1);
    const fbRes = simulate(impossible.solution, impossible);
    return {
      sameSeed, diff, unsolved, badRange, badTurns, decorative, badMax, fallbacks, badOverlap,
      fb: [impossible.fallback, fbRes.reachedGoal, fbRes.blockedAt.length, shortestSteps(impossible) === impossible.solution.length, impossible.maxCommands >= impossible.solution.length],
    };
  }, generator);
  await check('同一シードで同一マップ（100シード）', async () => r.sameSeed, true);
  await check('異なるシードで盤面が変わる（20シード中10種以上）', async () => r.diff >= 10, true);
  await check('1000件すべてsolutionでクリアできる', async () => r.unsolved, 0);
  await check('最短手数が範囲内', async () => r.badRange, 0);
  await check('曲がり角がminTurns以上', async () => r.badTurns, 0);
  await check('飾りの壁が無い（壁を外すと短くなる）', async () => r.decorative, 0);
  await check('maxCommands＝最短手数＋slack', async () => r.badMax, 0);
  await check('壁数が範囲内で座標重複なし', async () => r.badOverlap, 0);
  await check('通常制約では予備盤面に落ちない', async () => r.fallbacks, 0);
  await check('満たせない制約では予備盤面が返り、解ける最短解を持つ', async () => JSON.stringify(r.fb), JSON.stringify([true, true, 0, true, true]));

  // Issue #142：曲がり角が最少の最短経路を返す（ジグザグ経路で判定しない）
  // Issue #143：wallsMustMatterでは壁0個の盤面を返さない
  const q = await page.evaluate(async (g) => {
    const { shortestPath } = await import('/js/engine-grid.js');
    const { generateMap } = await import('/js/engine-generate.js');
    const path = shortestPath({ grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [{ x: 0, y: 2 }], items: [] });
    const turns = (c) => c.filter((x, i) => i > 0 && x !== c[i - 1]).length;
    let zeroWalls = 0;
    let strictOk = 0;
    for (let s = 0; s < 300; s += 1) {
      const m = generateMap({ ...g, walls: { min: 0, max: 2 } }, s);
      if (!m.fallback && m.walls.length === 0) zeroWalls += 1;
      const strict = generateMap({ ...g, minTurns: 2, shortestPath: { min: 4, max: 4 } }, s);
      if (strict.fallback || turns(strict.solution) >= 2) strictOk += 1;
    }
    return { pathLen: path.length, turns: turns(path), zeroWalls, strictOk };
  }, generator);
  await check('最短経路は曲がり角最少（4手・曲がり角1）', async () => JSON.stringify([q.pathLen, q.turns]), JSON.stringify([4, 1]));
  await check('walls.min=0でも壁0個の盤面は返らない', async () => q.zeroWalls, 0);
  await check('minTurns=2のsolutionは曲がり角2以上（最少経路で判定）', async () => q.strictOk, 300);
}
