// クッション：歩き・滑走でぶつかっても失敗にならず手前で止まる。壁・盤外は滑走中でも失敗（Issue #136）。
// 実レッスンに依存しないようrouteLessonのインライン最小盤面で書く。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'cushion: 歩き・滑走で止まっても失敗にならず続行、盤外への滑走は失敗(Issue #136)';

const lesson = {
  lessonId: 'g-cushion-flow',
  unitId: 'g-cushion',
  title: 'cushion',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'クッション' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      walls: [],
      ice: [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
      cushion: [{ x: 2, y: 0 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'down', 'right', 'right', 'right', 'up'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const base = { grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 1 }, walls: [] };
const sfxCount = (page, n) => page.evaluate((s) => window.__sfxLog.filter((x) => x === s).length, n);

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  // --- エンジン ---
  const sim = (cmds, spec) =>
    page.evaluate(async ([c, s]) => (await import('/js/engine-grid.js')).simulate(c, s), [cmds, spec]);
  const walk = await sim(['right', 'right'], { ...base, cushion: [{ x: 1, y: 0 }] });
  await check('歩きでクッションに当たっても失敗にならない', async () => walk.blockedAt.length, 0);
  await check('当たった手は現在位置を重複で積む', async () => JSON.stringify([walk.path.length, walk.bumped]), JSON.stringify([3, [false, false]]));
  const slide = await sim(['right'], { ...base, ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }], cushion: [{ x: 3, y: 0 }] });
  await check('滑走はクッションの手前で止まる', async () => JSON.stringify(slide.path[slide.path.length - 1]), JSON.stringify({ x: 2, y: 0 }));
  await check('滑走でクッションに当たっても失敗にならない', async () => slide.blockedAt.length, 0);
  const edge = await sim(['right'], { ...base, ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }] });
  await check('盤外へ滑ると失敗（blockedAt）', async () => JSON.stringify([edge.blockedAt, edge.bumped[edge.bumped.length - 1]]), JSON.stringify([[0], true]));
  const dist = await page.evaluate(async (s) => {
    const { shortestSteps } = await import('/js/engine-grid.js');
    return [shortestSteps({ ...s, goal: { x: 4, y: 0 } }), shortestSteps({ ...s, goal: { x: 4, y: 0 }, cushion: [{ x: 2, y: 0 }] })];
  }, base);
  await check('最短手数はクッションを通れない前提（4手→6手）', async () => JSON.stringify(dist), JSON.stringify([4, 6]));

  // --- UI：クッションで止まっても続行してクリア ---
  await check('クッションのマスにdata-cushionが付く', async () => (await page.$$('.grid-cell[data-cushion="true"]')).length, 1);
  for (const c of ['right', 'down', 'right', 'right', 'right', 'up']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('クッション音が鳴る', () => sfxCount(page, 'cushion'), 1);
  await check('bump音は鳴らない', () => sfxCount(page, 'bump'), 0);
  await check('リトライは出ずクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);

  // --- UI：盤外への滑走は失敗して止まる ---
  await enterPlay(page, lesson.lessonId);
  await page.evaluate(() => (window.__sfxLog.length = 0));
  for (const c of ['right', 'down', 'down', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await check('盤外へ滑るとbump音が鳴る', () => sfxCount(page, 'bump'), 1);
  await check('失敗後の手(right)は再生されない', async () => (await page.$$('.grid-footprint')).length, 3);
}
