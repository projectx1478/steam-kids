export const name = 'engine-grid: play.itemsの回収・pickups・remainingItems(Issue #60)';

export default async function run({ page, check }) {
  await page.goto('/index.html');

  const spec = {
    grid: { cols: 3, rows: 1 },
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 0 },
    walls: [],
    items: [{ x: 1, y: 0 }],
  };

  const collected = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['right', 'right'], s);
  }, spec);
  await check('全item回収でremainingItemsが空', async () => collected.remainingItems.length, 0);
  await check('itemに乗った手のpickupsにインデックス0が入る', async () => JSON.stringify(collected.pickups), JSON.stringify([[0], []]));
  await check('reachedGoalはtrue', async () => collected.reachedGoal, true);

  const skipped = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    // 1行盤面でupは盤外なのでstart(0,0)に留まり、item(1,0)を踏まない
    return simulate(['up'], s);
  }, spec);
  await check('item未回収時はremainingItemsに残る', async () => JSON.stringify(skipped.remainingItems), JSON.stringify(spec.items));

  const dupSpec = { ...spec, items: [{ x: 1, y: 0 }, { x: 1, y: 0 }] };
  const dup = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['right', 'right'], s);
  }, dupSpec);
  await check('同一マスの複数itemも1回の通過でまとめて回収', async () => dup.remainingItems.length, 0);
}
