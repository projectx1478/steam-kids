export const name = 'engine-grid: くりかえしの箱{box,times}の経路・stepOwner・innerOwner・チップ数(Issue #66)';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const spec = { grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, walls: [] };

  const r = await page.evaluate(async (s) => {
    const { simulate, chipCount } = await import('/js/engine-grid.js');
    const boxed = simulate([{ box: ['right', 'down'], times: 4 }], s);
    const flat = simulate(['right', 'down', 'right', 'down', 'right', 'down', 'right', 'down'], s);
    const mixed = simulate(['right', { box: ['down'], times: 2 }, { dir: 'right', times: 2 }], s);
    return {
      boxedPath: boxed.path, flatPath: flat.path, reached: boxed.reachedGoal,
      owner: boxed.stepOwner, inner: boxed.innerOwner,
      mixedOwner: mixed.stepOwner, mixedInner: mixed.innerOwner,
      chips: [chipCount(['right']), chipCount([{ dir: 'up', times: 3 }]), chipCount([{ box: ['up', 'down'], times: 2 }, 'left'])],
    };
  }, spec);

  await check('箱の経路は展開したフラット命令と一致', async () => JSON.stringify(r.boxedPath), JSON.stringify(r.flatPath));
  await check('箱でゴールに到達', async () => r.reached, true);
  await check('stepOwnerは箱の外側index(すべて0)', async () => r.owner, Array(8).fill(0));
  await check('innerOwnerは箱内index(0,1の繰り返し)', async () => r.inner, [0, 1, 0, 1, 0, 1, 0, 1]);
  await check('混在: stepOwner', async () => r.mixedOwner, [0, 1, 1, 2, 2]);
  await check('混在: innerOwner(箱の外は-1)', async () => r.mixedInner, [-1, 0, 0, -1, -1]);
  await check('チップ数: 単発1・まとめ1・箱=箱1+中2 と単発1', async () => r.chips, [1, 1, 4]);

  const wall = await page.evaluate(async (s) => {
    const { simulate } = await import('/js/engine-grid.js');
    return simulate([{ box: ['left'], times: 2 }], s);
  }, spec);
  await check('箱内で盤外に当たるとblockedAtは箱のindex', async () => wall.blockedAt.every((i) => i === 0) && wall.blockedAt.length > 0, true);
}
