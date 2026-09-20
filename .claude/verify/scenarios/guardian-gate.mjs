// Issue #37: dashboard.htmlは合言葉ゲートで保護する。初回設定必須・誤入力/正入力・
// bfcache/戻る操作での再ロックをDOMで確認する。

export const name = '保護者ゲート: 初回設定・誤入力/正入力・戻る操作での再ロック(Issue #37)';

export default async function run({ page, check }) {
  // 1: パスコード未設定の端末は設定フォームが表示され、ダッシュボード本体は描画されない
  await page.goto('/dashboard.html');
  await check('未設定時は#dashboard-appがhidden', async () =>
    (await page.getAttribute('#dashboard-app', 'class')).split(' ').includes('hidden')
  );
  await check('未設定時は設定フォームが表示される', async () => page.isVisible('#gate-setup'));
  await check('未設定時はログインフォームが非表示', async () => page.isVisible('#gate-login'), false);
  await check('未設定時はレッスンカードが描画されない', async () => (await page.$$('.lesson-card')).length, 0);

  const setupBox = await page.locator('#gate-setup').boundingBox();
  const setupBtnBox = await page.locator('#gate-setup-submit').boundingBox();
  await check('設定フォームの入力欄が48px以上', async () => setupBox.height >= 48);
  await check('設定ボタンが48px四方以上', async () => setupBtnBox.width >= 48 && setupBtnBox.height >= 48);

  // 2: 3文字以下は拒否される（ダッシュボードは表示されない）
  await page.fill('#gate-setup-passcode', 'abc');
  await page.fill('#gate-setup-confirm', 'abc');
  await page.click('#gate-setup-submit');
  await check('3文字は拒否されエラーが出る', async () => (await page.textContent('#gate-setup-status')).length > 0);
  await check('3文字ではダッシュボードが表示されない', async () => page.isVisible('#dashboard-app'), false);

  // 3: 確認用が一致しない場合も拒否される
  await page.fill('#gate-setup-passcode', 'testtest');
  await page.fill('#gate-setup-confirm', 'different');
  await page.click('#gate-setup-submit');
  await check('確認不一致でダッシュボードが表示されない', async () => page.isVisible('#dashboard-app'), false);

  // 4: 4文字以上・確認一致で設定成功し、ダッシュボードが表示される
  await page.fill('#gate-setup-passcode', 'testtest');
  await page.fill('#gate-setup-confirm', 'testtest');
  await page.click('#gate-setup-submit');
  await check('設定成功で#dashboard-appのhiddenが外れる', async () => page.isVisible('#dashboard-app'));
  await check('設定成功で#auth-gateが隠れる', async () => page.isVisible('#auth-gate'), false);

  // 5: 生の合言葉がlocalStorageに残らない
  const guardianRaw = await page.evaluate(() => localStorage.getItem('steamkids.guardian'));
  await check('生の合言葉が保存されない', async () => !guardianRaw.includes('testtest'));

  // 6: 戻る操作(back_forward)でゲートが再表示される
  await page.goto('/index.html');
  await page.goBack();
  await check('戻り操作後は#dashboard-appがhidden(再ロック)', async () => page.isVisible('#dashboard-app'), false);
  await check('戻り操作後はログインフォームが表示される(既に合言葉設定済み)', async () => page.isVisible('#gate-login'));

  // 7: 誤入力ではダッシュボードが開かない
  await page.fill('#gate-login-passcode', 'wrongwrong');
  await page.click('#gate-login-submit');
  await check('誤入力で#dashboard-appはhiddenのまま', async () => page.isVisible('#dashboard-app'), false);
  await check('誤入力でエラー文言が1つ表示される', async () => (await page.textContent('#gate-login-status')).length > 0);

  // 8: 正しい合言葉でダッシュボードが開く
  await page.fill('#gate-login-passcode', 'testtest');
  await page.click('#gate-login-submit');
  await check('正入力で#dashboard-appのhiddenが外れる', async () => page.isVisible('#dashboard-app'));

  // 9: 375px幅で横スクロールが発生しない
  await check(
    '375px幅で横スクロールが発生しない',
    async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );

  // 10: 「とじる」ボタンで手動ロックできる
  const lockBox = await page.locator('#gate-lock-btn').boundingBox();
  await check('とじるボタンが48px四方以上', async () => lockBox.width >= 48 && lockBox.height >= 48);
  await page.click('#gate-lock-btn');
  await check('とじるボタンで#dashboard-appがhiddenになる', async () => page.isVisible('#dashboard-app'), false);
}
