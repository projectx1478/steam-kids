// keys（かぎとドア）：未所持の色のドアは壁と同じ失敗、所持後は通れる。BFSはかぎ所持を状態に含む（Issue #62）。
export const name = 'engine-grid: keysのドア通行可否・滑走中のドア衝突・BFS・色ごとの対応(Issue #62)';

const base = { grid: { cols: 5, rows: 2 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
const gate = { ...base, walls: [{ x: 2, y: 0 }], keys: [{ x: 0, y: 0, color: 'red' }], doors: [{ x: 2, y: 1, color: 'red' }] };

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const sim = (cmds, spec) =>
    page.evaluate(async ([c, s]) => (await import('/js/engine-grid.js')).simulate(c, s), [cmds, spec]);
  const last = (r) => r.path[r.path.length - 1];

  const closed = await sim(['right', 'right', 'right'], gate);
  await check('かぎ無しでドアに当たると失敗(blockedAt)', async () => JSON.stringify(closed.blockedAt), JSON.stringify([1, 2]));
  await check('ドアの手前で止まる', async () => JSON.stringify(last(closed)), JSON.stringify({ x: 1, y: 1 }));

  const opened = await sim(['up', 'down', 'right', 'right', 'right', 'right'], gate);
  await check('かぎを取ればドアを通れる', async () => JSON.stringify([opened.blockedAt, opened.reachedGoal]), JSON.stringify([[], true]));

  const wrong = await sim(['up', 'down', 'right', 'right'], { ...gate, keys: [{ x: 0, y: 0, color: 'blue' }], doors: [{ x: 2, y: 1, color: 'red' }] });
  await check('違う色のかぎでは開かない', async () => JSON.stringify(wrong.blockedAt), JSON.stringify([3]));

  const slide = await sim(['right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  await check('こおりの滑走で閉じたドアに当たると失敗', async () => JSON.stringify([slide.blockedAt, last(slide)]), JSON.stringify([[0], { x: 1, y: 1 }]));
  const slideOpen = await sim(['up', 'down', 'right'], { ...gate, ice: [{ x: 1, y: 1 }] });
  await check('かぎ所持後は滑走でドアの上まで進む', async () => JSON.stringify([slideOpen.blockedAt, last(slideOpen)]), JSON.stringify([[], { x: 2, y: 1 }]));

  const dist = await page.evaluate(async (s) => {
    const { shortestSteps } = await import('/js/engine-grid.js');
    return [shortestSteps(s), shortestSteps({ ...s, keys: [] }), shortestSteps({ ...s, walls: [{ x: 3, y: 0 }, { x: 3, y: 1 }] })];
  }, gate);
  await check('最短はかぎ経由(6手)・かぎ無しは到達不能・道が無ければ到達不能', async () => JSON.stringify(dist), JSON.stringify([6, null, null]));
}
