export const name = 'engine-grid: 壁で停止／盤外で停止／最短6手でゴール到達';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const spec = {
    grid: { cols: 4, rows: 4 },
    start: { x: 0, y: 3 },
    goal: { x: 3, y: 0 },
    walls: [{ x: 2, y: 2 }],
  };

  const wallCase = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['up', 'up', 'right', 'right', 'down'], s);
  }, spec);
  await check('壁の手前で停止する', async () => wallCase.path.at(-1), { x: 2, y: 1 });
  await check('壁ぶつかりがblockedAtに記録される', async () => wallCase.blockedAt.includes(4));

  const boundsCase = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['down'], s);
  }, spec);
  await check('盤外は移動せずその場に停止', async () => boundsCase.path.at(-1), { x: 0, y: 3 });
  await check('盤外がblockedAtに記録される', async () => boundsCase.blockedAt.includes(0));

  const clearCase = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['up', 'up', 'up', 'right', 'right', 'right'], s);
  }, spec);
  await check('最短6手でゴール到達', async () => clearCase.reachedGoal, true);
  await check('ゴール座標に一致', async () => clearCase.path.at(-1), { x: 3, y: 0 });
}
