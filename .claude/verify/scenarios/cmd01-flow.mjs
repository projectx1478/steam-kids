export const name = 'cmd-01-susumu: intro→predict→play→summaryの遷移';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('初期ステップはintro', async () => page.getAttribute('#stage', 'data-step'), 'intro');

  await page.click('[data-action="start"]');
  await check('predictへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'predict');

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('表示中ステップは常に1つ（#stageは1個）', async () => (await page.$$('#stage')).length, 1);

  await page.click('[data-action="next"]');
  await check('summaryへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'summary');
}
