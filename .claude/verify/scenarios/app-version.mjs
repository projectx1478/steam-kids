// Issue #28: js/config.jsのAPP_VERSIONとservice-worker.jsのCACHE_NAMEが一致すること、
// ダッシュボードのフッタに版数が表示されることを確認する(二重管理の機械チェック)。

export const name = 'APP_VERSIONとCACHE_NAMEが一致し、ダッシュボードに表示される(Issue #28)';

export default async function run({ page, check }) {
  await page.goto('/dashboard.html');

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
