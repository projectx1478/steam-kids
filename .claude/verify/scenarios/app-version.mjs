// Issue #28: js/config.jsのAPP_VERSIONとservice-worker.jsのCACHE_NAMEが一致すること、
// ダッシュボードのフッタに版数が表示されることを確認する(二重管理の機械チェック)。

export const name = 'APP_VERSIONとCACHE_NAMEが一致し、ダッシュボードに表示される(Issue #28)';

export default async function run({ page, check }) {
  await page.goto('/dashboard.html');
  // Issue #37: dashboard.htmlは合言葉ゲートで保護される。本シナリオの主眼はゲートではないため、
  // ローカルPBKDF2照合のみで解錠して素通りする（ネットワーク不使用）。
  await page.evaluate(async () => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode('testtest');
  });
  await page.reload();
  await page.fill('#gate-login-passcode', 'testtest');
  await page.click('#gate-login-submit');

  const appVersion = await page.evaluate(async () => {
    const mod = await import('/js/config.js');
    return mod.APP_VERSION;
  });

  const cacheName = await page.evaluate(async () => {
    const code = await (await fetch('/service-worker.js')).text();
    const match = code.match(/CACHE_NAME\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
  });

  await check('service-worker.jsにCACHE_NAMEが定義されている', () => typeof cacheName === 'string' && cacheName.length > 0);
  await check('APP_VERSIONとCACHE_NAMEが一致する', () => appVersion === cacheName);

  await check('ダッシュボードのフッタに版数が表示される', async () => page.textContent('#version-footer'), appVersion);
}
