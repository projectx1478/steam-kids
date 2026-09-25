export const name = 'A1 効果音: ?sound=offは未設定時に既定ミュートになる';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu&sound=off');
  await check('?sound=offで既定ミュート', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'true');

  await page.click('[data-action="start"]');
  await check('ミュート中は__sfxLogが0件', async () => page.evaluate(() => window.__sfxLog.length), 0);

  await page.click('#sound-toggle');
  await check('ボタンで解除できる', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'false');
}
