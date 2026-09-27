export const name = 'A1 効果音: ミュートボタン(dashboard)の切替とlocalStorageへの永続化（Issue #93でdashboardへ移動）';

const PASSCODE = 'testtest';

// ふりがな・おとの設定はdashboard(保護者ゲート内)へ移った（Issue #93）。合言葉を設定して開く。
async function openDashboard(page) {
  await page.goto('/dashboard.html');
  await page.evaluate(async (passcode) => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode(passcode);
  }, PASSCODE);
  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
}

export default async function run({ page, check }) {
  await openDashboard(page);
  await check('既定は非ミュート', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'false');

  await page.click('#sound-toggle');
  await check('クリックでミュートになる', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'true');

  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('ミュート中は__sfxLogが0件', async () => page.evaluate(() => window.__sfxLog.length), 0);

  await openDashboard(page);
  await check('dashboard再訪後もミュートが維持される', async () => page.getAttribute('#sound-toggle', 'data-muted'), 'true');
}
