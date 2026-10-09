// water／bridge：盤の water・bridge と同じ数・向きのタイルが描かれ、水に進んでも失敗にならず手前で止まる（Issue #338）。
// waterMode:"bump" なら壁と同じ失敗。実レッスンに依存しないようrouteLessonのインライン最小盤面で書く。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'water: 水・橋のタイル数と向きが盤と一致、水に進むと失敗にならず止まる(Issue #338)';

// 眼鏡型（6×4）：1行目・4行目と (2,2)(3,2) が水、(2,1)(3,1) が橋（上下が水なので横に渡る）。
const water = [];
for (let x = 0; x < 6; x++) water.push({ x, y: 0 }, { x, y: 3 });
water.push({ x: 2, y: 2 }, { x: 3, y: 2 });
const bridge = [{ x: 2, y: 1 }, { x: 3, y: 1 }];

const lesson = {
  lessonId: 'g-water-flow',
  unitId: 'g-water',
  title: 'water',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'みず' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 6, rows: 4 },
      start: { x: 0, y: 1 },
      goal: { x: 5, y: 1 },
      walls: [],
      water,
      bridge,
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const base = { grid: { cols: 3, rows: 2 }, start: { x: 0, y: 1 }, goal: { x: 2, y: 1 }, walls: [], water: [{ x: 0, y: 0 }] };
const sfxCount = (page, n) => page.evaluate((s) => window.__sfxLog.filter((x) => x === s).length, n);

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  // --- DOM：タイル数・向きが盤の water・bridge と一致 ---
  await check('水のタイル数が盤のwaterと同じ', async () => (await page.$$('.grid-cell[data-water="true"]')).length, water.length);
  await check('橋のタイル数が盤のbridgeと同じ', async () => (await page.$$('.grid-cell[data-bridge="true"]')).length, bridge.length);
  await check('水の座標が盤のwaterと一致', async () =>
    JSON.stringify(
      await page.$$eval('.grid-cell[data-water="true"]', (els) => els.map((e) => [Number(e.dataset.x), Number(e.dataset.y)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]))
    ),
    JSON.stringify(water.map((c) => [c.x, c.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]))
  );
  await check('上下が水の橋は横に渡る(h)', async () => await page.$$eval('.grid-cell[data-bridge="true"]', (els) => els.map((e) => e.dataset.bridgeDir)), ['h', 'h']);
  await check('水と橋のマスに壁・ゴールの印は付かない', async () => (await page.$$('.grid-cell[data-water="true"][data-goal], .grid-cell[data-bridge="true"][data-goal]')).length, 0);
  // 左右が水の橋は縦に渡る(v)。renderGridを直接呼んで確かめる。
  const vertical = await page.evaluate(async () => {
    const { renderGrid } = await import('/js/ui-grid.js');
    const { el } = renderGrid({
      grid: { cols: 3, rows: 1 },
      walls: [],
      water: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
      bridge: [{ x: 1, y: 0 }],
      playerPos: { x: 1, y: 0 },
    });
    return [el.querySelectorAll('[data-water="true"]').length, el.querySelector('[data-bridge="true"]')?.dataset.bridgeDir];
  });
  await check('左右が水の橋は縦に渡る(v)', async () => JSON.stringify(vertical), JSON.stringify([2, 'v']));

  // --- エンジン：cushion型（既定）は失敗にならず止まる、bump型は失敗 ---
  const sim = (cmds, spec) =>
    page.evaluate(async ([c, s]) => (await import('/js/engine-grid.js')).simulate(c, s), [cmds, spec]);
  const soft = await sim(['up'], base);
  await check('水に進んでも失敗にならない(cushion型)', async () => soft.blockedAt.length, 0);
  await check('水の手前で止まる', async () => JSON.stringify(soft.path[soft.path.length - 1]), JSON.stringify({ x: 0, y: 1 }));
  const hard = await sim(['up'], { ...base, waterMode: 'bump' });
  await check('waterMode:"bump"では壁と同じ失敗', async () => hard.blockedAt.length, 1);

  // --- UI：水に進んでも続行してクリア、水の音が鳴る ---
  for (const c of ['up', 'right', 'right', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('水の音(splash)が鳴る', () => sfxCount(page, 'splash'), 1);
  await check('bump音は鳴らない', () => sfxCount(page, 'bump'), 0);
  await check('リトライは出ずクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);

  // --- 通常モーション：kind=water のbounce（水しぶき） ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, lesson.lessonId);
  await page.click('[data-command="up"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('水に止まるとkind=waterのbounce', async () =>
    (await page.evaluate(() => window.__gridAnimLog.filter((e) => e.type === 'bounce').map((e) => e.kind))).includes('water'),
    true
  );
}
