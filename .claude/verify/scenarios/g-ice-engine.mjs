export const name = 'engine-grid: iceの滑走・停止位置・blockedAt・pickups・BFS(Issue #61)';

const base = { grid: { cols: 5, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const sim = (cmds, spec) =>
    page.evaluate(async ([c, s]) => (await import('/js/engine-grid.js')).simulate(c, s), [cmds, spec]);
  const last = (r) => r.path[r.path.length - 1];

  // こおりが続く限り滑り、盤端で止まる。goal到達＝最終位置で判定
  // 単独のこおりは1マス滑って通常マスで止まる（Issue #61 修正）
  const single = await sim(['right'], { ...base, ice: [{ x: 1, y: 1 }] });
  await check('こおり1マスなら次の通常マスで止まる', async () => JSON.stringify(last(single)), JSON.stringify({ x: 2, y: 1 }));
  await check('滑走したマスだけslidがtrue', async () => JSON.stringify(single.slid), JSON.stringify([false, true]));
  const iceRun = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
  const edge = await sim(['right'], { ...base, ice: iceRun });
  await check('こおりの連続を滑りきり盤端で停止する', async () => JSON.stringify(last(edge)), JSON.stringify({ x: 4, y: 1 }));
  await check('滑走は1マスずつpathへ展開される', async () => edge.path.length, 5);
  await check('滑走の各マスは同一stepOwner', async () => JSON.stringify(edge.stepOwner), JSON.stringify([0, 0, 0, 0]));
  await check('盤端での滑走停止はblockedAtに入らない', async () => edge.blockedAt.length, 0);
  await check('滑走後の位置がゴールならreachedGoal', async () => edge.reachedGoal, true);

  // 壁の手前で止まり、失敗になる（Issue #136）
  const wall = await sim(['right'], { ...base, walls: [{ x: 3, y: 1 }], ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }] });
  await check('壁の手前で停止する', async () => JSON.stringify(last(wall)), JSON.stringify({ x: 2, y: 1 }));
  await check('滑走中に壁へ当たるとblockedAtに入る', async () => JSON.stringify(wall.blockedAt), JSON.stringify([0]));
  await check('滑走で壁に当たった最後のpathだけbumped', async () => JSON.stringify(wall.bumped), JSON.stringify([false, false, true]));

  // 通常マスのゴールで止まる
  const pass = await sim(['right'], { ...base, goal: { x: 2, y: 1 }, ice: [{ x: 1, y: 1 }] });
  await check('こおりの次の通常マスがゴールならそこで止まりクリア', async () => JSON.stringify([last(pass), pass.reachedGoal]), JSON.stringify([{ x: 2, y: 1 }, true]));

  // start上のこおりでは滑らない
  const onStart = await sim(['up'], { ...base, ice: [{ x: 0, y: 1 }] });
  await check('start上では滑らない（最初の移動のみ）', async () => JSON.stringify(last(onStart)), JSON.stringify({ x: 0, y: 0 }));

  // 最初の1マスが壁・盤外ならblockedAt
  const bump = await sim(['left'], { ...base, ice: [{ x: 1, y: 1 }] });
  await check('盤外への手は従来どおりblockedAt', async () => JSON.stringify(bump.blockedAt), JSON.stringify([0]));

  // 滑走中のどんぐり回収
  const acorn = await sim(['right'], { ...base, items: [{ x: 3, y: 1 }], ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }] });
  await check('滑走中に通過したどんぐりを回収する', async () => acorn.remainingItems.length, 0);
  await check('回収はそのマスのpickupsに入る', async () => JSON.stringify(acorn.pickups), JSON.stringify([[], [], [0]]));

  // {dir,times}：滑走後の位置から次の反復。壁際では次はbump
  const rep = await sim([{ dir: 'right', times: 2 }], { ...base, ice: iceRun });
  await check('times反復は滑走後の位置から行い、壁際ではblockedAt', async () => JSON.stringify([last(rep), rep.blockedAt]), JSON.stringify([{ x: 4, y: 1 }, [0]]));

  // 最短手数（ice無し=4手 / iceで短縮）
  const steps = await page.evaluate(async (s) => {
    const { shortestSteps } = await import('/js/engine-grid.js');
    return [shortestSteps(s), shortestSteps({ ...s, ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }] })];
  }, base);
  await check('shortestStepsがiceの滑走を反映する（4手→1手）', async () => JSON.stringify(steps), JSON.stringify([4, 1]));
  const unreachable = await page.evaluate(async (s) => {
    const { shortestSteps } = await import('/js/engine-grid.js');
    // (1,0)〜(3,0)がこおり。停止できるのは両端(0,0)/(4,0)のみで、goal(2,0)には止まれない
    return String(shortestSteps({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [], ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] }));
  }, base);
  await check('滑ってゴールへ止まれない盤面はInfinity', async () => unreachable, 'Infinity');
}
