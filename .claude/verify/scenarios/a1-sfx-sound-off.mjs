export const name = 'A1 効果音: ?sound=offは未設定時に既定ミュートになる（Issue #93でおとトグルはdashboardへ移動）';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu&sound=off');
  await check('?sound=offで既定ミュート', async () => page.evaluate(async () => (await import('/js/sfx.js')).isMuted()));

  await page.click('[data-action="start"]');
  await check('ミュート中は__sfxLogが0件', async () => page.evaluate(() => window.__sfxLog.length), 0);

  await page.evaluate(async () => (await import('/js/sfx.js')).setMuted(false));
  await check('APIで解除できる', async () => page.evaluate(async () => (await import('/js/sfx.js')).isMuted()), false);
}
