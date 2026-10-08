export const name = 'A3 reduced-motion(既定): ゴールしても紙ふぶき(DOM・canvas)が生成されない';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await enterPlay(page, 'cmd-01-susumu');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  await check('reduced-motion時は紙ふぶきが0個', async () => (await page.$$('.grid-confetti')).length, 0);
  await check(
    'reduced-motion時は結果ダイアログに紙吹雪の canvas が無い',
    async () => (await page.$$('canvas[data-clear-confetti]')).length,
    0,
  );
}
