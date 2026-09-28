export const name = 'ダッシュボード: 3本を完走するとレッスンカードが3枚表示される(Issue #31)';
import { clearLesson } from '../helpers.mjs';

const PASSCODE = 'testtest';

export default async function run({ page, check }) {
  await clearLesson(page, 'cmd-01-susumu');
  await clearLesson(page, 'cmd-02-mijikaku');
  await clearLesson(page, 'cmd-03-naosu');

  await page.goto('/dashboard.html');
  await page.evaluate(async (passcode) => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode(passcode);
  }, PASSCODE);
  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');

  await check('3本ぶんのレッスンカードが表示される', async () => (await page.$$('.lesson-card')).length, 3);
  await check(
    '3本ともクリア状態(cleared)で表示される',
    async () => (await page.$$('.lesson-card[data-status="cleared"]')).length,
    3
  );

  // ふりがな・おとの設定はdashboardへ移った（Issue #93）。
  await check('dashboardにふりがなトグルがある', async () => (await page.$('#furigana-toggle')) !== null);
  await check('dashboardにおとトグルがある', async () => (await page.$('#sound-toggle')) !== null);
  await page.click('#furigana-toggle');
  await check('ふりがなトグルでaria-pressedが切り替わる', async () => page.getAttribute('#furigana-toggle', 'aria-pressed'), 'false');
}
