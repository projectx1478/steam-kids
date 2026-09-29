// switches：踏む前の対象は壁と同じ失敗、踏めば通れる。BFSは踏んだスイッチを状態に含む（Issue #63）。
export const name = 'engine-grid: switchesの通行可否・滑走中の衝突・BFS・複数スイッチ(Issue #63)';

const base = { grid: { cols: 5, rows: 2 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
const gate = { ...base, walls: [{ x: 2, y: 0 }], switches: [{ x: 0, y: 0, targets: [{ x: 2, y: 1 }] }] };

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const sim = (cmds, spec) =>
    page.evaluate(async ([c, s]) => (await import('/js/engine-grid.js')).simulate(c, s), [cmds, spec]);
  const last = (r) => r.path[r.path.length - 1];

  const closed = await sim(['right', 'right', 'right'], gate);
  await check('踏まずに対象へ当たると失敗(blockedAt)', async () => JSON.stringify(closed.blockedAt), JSON.stringify([1, 2]));
  await check('対象の手前で止まる', async () => JSON.stringify(last(closed)), JSON.stringify({ x: 1, y: 1 }));

  const opened = await sim(['up', 'down', 'right', 'right', 'right', 'right'], gate);
  await check('スイッチを踏めば対象を通れる', async () => JSON.stringify([opened.blockedAt, opened.reachedGoal]), JSON.stringify([[], true]));

  const slide = await sim(['right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  await check('こおりの滑走で未解除の対象に当たると失敗', async () => JSON.stringify([slide.blockedAt, last(slide)]), JSON.stringify([[0], { x: 1, y: 1 }]));
  const slideOpen = await sim(['up', 'down', 'right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  await check('踏んだ後は滑走で対象の上まで進む', async () => JSON.stringify([slideOpen.blockedAt, last(slideOpen)]), JSON.stringify([[], { x: 2, y: 1 }]));

  const two = {
    ...base,
    switches: [{ x: 0, y: 0, targets: [{ x: 1, y: 1 }] }, { x: 2, y: 0, targets: [{ x: 3, y: 1 }] }],
  };
  const half = await sim(['up', 'down', 'right', 'right', 'right'], two);
  await check('片方のスイッチだけでは2つ目の対象で失敗', async () => JSON.stringify(half.blockedAt), JSON.stringify([4]));

  const dist = await page.evaluate(async ([g, t]) => {
    const { shortestSteps } = await import('/js/engine-grid.js');
    return [shortestSteps(g), shortestSteps({ ...g, switches: [{ x: 4, y: 0, targets: [{ x: 2, y: 1 }] }] }), shortestSteps(t)];
  }, [gate, two]);
  await check('最短はスイッチ経由(6手)・スイッチに届かなければ到達不能', async () => JSON.stringify(dist.slice(0, 2)), JSON.stringify([6, null]));
  await check('スイッチ2つを踏む最短は6手', async () => dist[2], 6);
}
