export const name = 'A1 効果音: ミュートボタンの切替とlocalStorageへの永続化';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('既定は非ミュート', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'false');

  await page.click('#sound-toggle');
  await check('クリックでミュートになる', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'true');

  await page.click('[data-action="start"]');
  await check('ミュート中は__sfxLogが0件', async () => page.evaluate(() => window.__sfxLog.length), 0);

  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('リロード後もミュートが維持される', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'true');
}
