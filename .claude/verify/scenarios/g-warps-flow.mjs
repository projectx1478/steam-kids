import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'warps: 入口の穴→出口へ移って止まる・同じ手で再ワープしない・data-warp描画・クリア(Issue #64)';

const lesson = {
  lessonId: 'g-warps-flow',
  unitId: 'g-warps',
  title: 'warps',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ワープ' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ワープで むこうへ',
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 1 },
      goal: { x: 4, y: 2 },
      walls: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      warps: [{ x: 1, y: 1, pair: 1 }, { x: 3, y: 2, pair: 1 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right'],
      maxCommands: 2,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

// ロボットの左上が、指定マスの左上と一致するか（アニメ後の位置）。
const robotAt = (page, x, y) =>
  page.evaluate(
    ([cx, cy]) => {
      const t = document.querySelector('.grid-player').getBoundingClientRect();
      const c = document.querySelector(`.grid-cell[data-x="${cx}"][data-y="${cy}"]`).getBoundingClientRect();
      return Math.abs(t.x - c.x) < 2 && Math.abs(t.y - c.y) < 2;
    },
    [x, y]
  );

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);
  await check('穴のマスにdata-warp=1が2つ付く', async () => (await page.$$('.grid-cell[data-warp="1"]')).length, 2);
  await check('1組目の印は星(data-mark=star)', async () => page.getAttribute('.grid-cell[data-warp="1"]', 'data-mark'), 'star');

  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await page.waitForTimeout(600);
  await check('rightだけで入口(1,1)から出口(3,2)へ移って止まる（同じ手で入口へ戻らない）', async () => robotAt(page, 3, 2), true);
  await check('ゴール(4,2)へは届かないためクリア表示にならない', async () => (await page.$$('[data-result="clear"]')).length, 0);

  await clickRetry(page);
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('right→right（出口から続けて進む）でクリアできる', async () => (await page.$$('[data-action="next"]')).length, 1);
}
