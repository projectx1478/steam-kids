export const name = 'A4 navigator.vibrate未定義環境: タップ操作でconsole.error・例外が発生しない';

export default async function run({ page, check }) {
  // navigator.vibrateが存在しない環境を再現する（非対応端末を模す）。
  // vibrateはNavigator.prototype上のメソッドなのでdeleteでは消えず、代入で上書きする。
  await page.addInitScript(() => {
    window.navigator.vibrate = undefined;
  });
  await page.goto('/index.html?lesson=cmd-01-susumu');

  await check('navigator.vibrateが未定義', async () => page.evaluate(() => typeof navigator.vibrate), 'undefined');

  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');

  const commands = ['up', 'up', 'up', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-command="right"]');
  await page.click('[data-action="clear-all"]');
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  // console.error/pageerrorはrun.mjsが自動検知するため、ここまで到達すればタップ操作は安全に完了している。
  await check('ゴールまで到達する', async () => page.getAttribute('#stage', 'data-step'), 'play');
}
