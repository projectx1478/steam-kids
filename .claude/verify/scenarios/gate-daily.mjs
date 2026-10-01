// Issue #217: 子ども画面（index.html）の日次保護者ゲート。
// config.mjsが注入する当日認証済みシードを、sessionStorageのフラグで止めてから検証する。

export const name = '子ども画面の日次保護者ゲート: 設定・通過・ロック・同日スキップ(Issue #217)';

const PASSCODE = 'testtest';

export default async function run({ page, check }) {
  await page.clock.install();
  await page.goto('/index.html');
  await page.evaluate(() => {
    sessionStorage.setItem('e2e.noGateSeed', '1');
    localStorage.removeItem('steamkids.gateDate');
    localStorage.removeItem('steamkids.guardian');
  });

  // 1: 合言葉未設定 → 設定画面
  await page.reload();
  await page.waitForSelector('#parental-gate');
  await check('未設定なら設定画面が出る', async () => page.getAttribute('#parental-gate-submit', 'data-mode'), 'setup');
  await page.fill('#parental-gate-passcode', PASSCODE);
  await page.fill('#parental-gate-confirm', 'different');
  await page.click('#parental-gate-submit');
  await check('確認不一致では通過できない', async () => page.isVisible('#parental-gate'));
  await page.fill('#parental-gate-confirm', PASSCODE);
  await page.click('#parental-gate-submit');
  await page.waitForSelector('#parental-gate', { state: 'detached' });
  await check('設定後に通過しゲートが消える', async () => page.isVisible('#parental-gate'), false);

  const raw = await page.evaluate(() => localStorage.getItem('steamkids.guardian'));
  await check('localStorageに平文の合言葉が無い', () => raw !== null && !raw.includes(PASSCODE));
  const stored = await page.evaluate(() => localStorage.getItem('steamkids.gateDate'));
  await check('最終認証日がローカル日付YYYY-MM-DDで保存される', () => /^\d{4}-\d{2}-\d{2}$/.test(stored));

  // 2: 同日の再読込・?lesson=直リンクはスキップ
  await page.reload();
  await check('同日の再読込ではゲートが出ない', async () => page.isVisible('#parental-gate'), false);

  // 3: 翌日扱い → ログイン画面。誤りは通過不可、5回ミスで30秒ロック
  await page.evaluate(() => localStorage.setItem('steamkids.gateDate', '2000-01-01'));
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.waitForSelector('#parental-gate');
  await check('直リンク起動でも未認証ならゲートが出る', async () => page.getAttribute('#parental-gate-submit', 'data-mode'), 'login');
  for (let i = 0; i < 5; i++) {
    await page.fill('#parental-gate-passcode', 'wrongwrong');
    await page.click('#parental-gate-submit');
    await page.waitForFunction((n) => {
      const s = document.getElementById('parental-gate-status').textContent;
      return n < 4 ? s.includes('違います') : s.includes('秒');
    }, i);
  }
  await check('誤りでは通過できない', async () => page.isVisible('#parental-gate'));
  await check('5回ミスで入力不可になり残り秒数が出る', async () => {
    const t = await page.textContent('#parental-gate-status');
    return (await page.isDisabled('#parental-gate-passcode')) && /あと\d+秒/.test(t);
  });
  await page.clock.runFor(31000);
  await check('30秒後に入力可能へ戻る', async () => !(await page.isDisabled('#parental-gate-passcode')));

  // 4: 正解で通過し、通過後にレッスンが開始される
  await page.fill('#parental-gate-passcode', PASSCODE);
  await page.click('#parental-gate-submit');
  await page.waitForSelector('#parental-gate', { state: 'detached' });
  await check('正解で通過しゲートが消える', async () => page.isVisible('#parental-gate'), false);
}
