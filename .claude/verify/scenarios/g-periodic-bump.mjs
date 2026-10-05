// periodic（周期ドア）の失敗：閉じたドアに入る手はbumpで止まり、手番は進まず、文言は「ドアが しまって いたよ」(Issue #310)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'periodic bump: 閉じたドアで実行停止・手番はそのまま・periodicのヒント文言(Issue #310)';

const lesson = {
  lessonId: 'g-periodic-bump',
  unitId: 'g-periodic',
  title: 'periodic bump',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ドア' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ドアは あく？',
      grid: { cols: 3, rows: 2 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      periodic: [{ x: 1, y: 0, period: 2, open: [1] }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'right', 'right', 'up'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const turnOf = (page) => page.$eval('.grid-cell[data-periodic]', (c) => `${c.dataset.periodicOpen}/${c.dataset.periodicTurn}`);

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  for (const c of ['right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('閉じたドアに入る手でbump音（実行停止）', () => page.evaluate(() => window.__sfxLog.filter((x) => x === 'bump').length), 1);
  await check('手番は進まず閉のまま（手番0）', () => turnOf(page), 'false/0');
  await check('ヒントは periodic の文言', () => page.$eval('[data-hint="periodic"] p.text-sm', (el) => el.textContent), 'ドアが しまって いたよ');

  await clickRetry(page);
  await check('もういちどでヒントが消え、手番0に戻る', async () => [(await page.$$('[data-hint]')).length, await turnOf(page)].join(), '0,false/0');
}
