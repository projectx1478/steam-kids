export const name = 'A4 進行ドット: 数がsteps.lengthと一致・現在位置が表示中ステップと一致';

async function currentDotIndex(page) {
  return page.evaluate(() => {
    const dots = [...document.querySelectorAll('.step-dot')];
    return dots.findIndex((d) => d.dataset.current === 'true');
  });
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');

  await check('ドット数が4個（intro/predict/play/summary）', async () => (await page.$$('.step-dot')).length, 4);
  await check('introで現在ドットが0番目', async () => currentDotIndex(page), 0);

  await page.click('[data-action="start"]');
  await check('predictで現在ドットが1番目', async () => currentDotIndex(page), 1);

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playで現在ドットが2番目', async () => currentDotIndex(page), 2);

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await page.click('[data-action="next"]');
  await check('summaryで現在ドットが3番目', async () => currentDotIndex(page), 3);
  await check('ドット数はステップ遷移後も4個のまま', async () => (await page.$$('.step-dot')).length, 4);
}
