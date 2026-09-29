import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'ice: 実行後のロボット位置・data-ice描画・クリア(Issue #61)';

const lesson = {
  lessonId: 'g-ice-flow',
  unitId: 'g-ice',
  title: 'ice',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'こおり' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'すべって どこで とまる？',
      grid: { cols: 5, rows: 2 },
      start: { x: 0, y: 1 },
      goal: { x: 4, y: 0 },
      walls: [],
      ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'up'],
      maxCommands: 4,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);
  await check('こおりのマスにdata-iceが付く', async () => (await page.$$('.grid-cell[data-ice="true"]')).length, 3);
  await check('こおりは指定座標(1,1)', async () => page.getAttribute('.grid-cell[data-ice="true"]', 'data-x'), '1');

  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await page.waitForTimeout(600);
  await check('滑走中は効果音slideが鳴る', async () => (await page.evaluate(() => window.__sfxLog)).filter((n) => n === 'slide').length, 3);
  const pos = await page.evaluate(() => {
    const t = document.querySelector('.grid-player').getBoundingClientRect();
    const c = document.querySelector('.grid-cell[data-x="4"][data-y="1"]').getBoundingClientRect();
    return { dx: Math.abs(t.x - c.x), dy: Math.abs(t.y - c.y) };
  });
  await check('rightだけでロボットが右端(4,1)まで滑る', async () => pos.dx < 2 && pos.dy < 2, true);
  await check('ゴール(4,0)へ届かないためクリア表示にならない', async () => (await page.$$('[data-result="clear"]')).length, 0);

  await clickRetry(page);
  await page.click('[data-command="right"]');
  await page.click('[data-command="up"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('right→upでクリアできる', async () => (await page.$$('[data-action="next"]')).length, 1);
}
