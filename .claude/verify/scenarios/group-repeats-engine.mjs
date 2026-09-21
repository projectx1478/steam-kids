export const name = 'engine-grid/ui-commands: まとめ命令({dir,times})の経路・stepOwner・表示(Issue #48)';

export default async function run({ page, check }) {
  await page.goto('/index.html');

  const spec = {
    grid: { cols: 4, rows: 4 },
    start: { x: 0, y: 3 },
    goal: { x: 3, y: 0 },
    walls: [{ x: 2, y: 2 }],
  };

  const grouped = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate([{ dir: 'up', times: 3 }, { dir: 'right', times: 3 }], s);
  }, spec);
  const flat = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate(['up', 'up', 'up', 'right', 'right', 'right'], s);
  }, spec);

  await check('まとめ命令とフラット命令で経路が一致', async () => JSON.stringify(grouped.path), JSON.stringify(flat.path));
  await check('まとめ命令でもゴールに到達', async () => grouped.reachedGoal, true);
  await check(
    'stepOwnerが元のチップindex(0が3回・1が3回)を指す',
    async () => JSON.stringify(grouped.stepOwner),
    JSON.stringify([0, 0, 0, 1, 1, 1])
  );

  const blockedCase = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate([{ dir: 'down', times: 5 }], s);
  }, spec);
  await check('盤外へのまとめ命令はその場で停止', async () => blockedCase.path.at(-1), { x: 0, y: 3 });
  await check('blockedAtは元のチップindex(0)を記録', async () => JSON.stringify(blockedCase.blockedAt), JSON.stringify([0, 0, 0, 0, 0]));

  const labels = await page.evaluate(async () => {
    const { renderCommandQueue } = await import('/js/ui-commands.js');
    const container = document.createElement('ul');
    document.body.appendChild(container);
    renderCommandQueue(container, {
      commands: [
        { dir: 'down', times: 5 },
        { dir: 'up', times: 1 },
      ],
      activeIndex: -1,
      onRemove: () => {},
    });
    const texts = [...container.querySelectorAll('.command-chip span')].map((el) => el.textContent);
    container.remove();
    return texts;
  });
  await check('times>=2は「した ×5」形式で表示', async () => labels[0], 'した ×5');
  await check('times=1はまとめ表示を付けない', async () => labels[1], 'うえ');
}
