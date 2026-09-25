export const name = 'A2 reduced-motion(既定): アニメーション0件でも移動・足あとは機能する';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  await check('reduced-motion時は__gridAnimLogが0件', async () => page.evaluate(() => window.__gridAnimLog.length), 0);
  await check('reduced-motion時も足あとは6個記録される', async () => (await page.$$('.grid-footprint')).length, 6);
}
