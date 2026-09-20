// Issue #37: 保護者ゲートの閲覧解錠はオフラインでも行える（ローカルPBKDF2照合のみ）。
// route().abort()はブラウザがconsole.errorを出しハーネスの自動失敗条件に触れるため、
// fetchをJS層で差し替えてネットワーク層に到達させない（p3-offline.mjsと同方式）。

export const name = '保護者ゲート: オフラインでも解錠できる。同期系ボタンはdisabled(Issue #37)';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

export default async function run({ page, check }) {
  await page.addInitScript((endpoint) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith(endpoint)) return Promise.reject(new TypeError('Failed to fetch'));
      return realFetch(input, init);
    };
    // navigator.onLineをfalse固定にし、UI側のオフライン分岐も同時に検証する
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
  }, ENDPOINT);

  await page.goto('/dashboard.html');

  // 事前に合言葉を設定済みの端末を模す（setPasscode()はローカルPBKDF2のみでネットワーク不使用）
  await page.evaluate(async () => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode('testtest');
  });
  await page.reload();

  await check('オフラインでもログインフォームが表示される', async () => page.isVisible('#gate-login'));

  // 誤入力もローカル照合のみで完結する
  await page.fill('#gate-login-passcode', 'wrongwrong');
  await page.click('#gate-login-submit');
  await check('オフラインでも誤入力を検出できる', async () => (await page.textContent('#gate-login-status')).length > 0);

  // 正しい合言葉でオフラインのまま解錠できる
  await page.fill('#gate-login-passcode', 'testtest');
  await page.click('#gate-login-submit');
  await check('オフラインでも正入力で解錠できる', async () => page.isVisible('#dashboard-app'));

  // 同期は未有効な端末のため「同期を始める」ボタンのみが表示される
  await check('同期未有効時は「同期を始める」ボタンが表示される', async () => page.isVisible('[data-action="sync-register"]'));

  // 同期を有効化した状態を模し、「別のタブレットとつなぐ」がオフラインでdisabledになることを確認する
  await page.evaluate(() => {
    localStorage.setItem(
      'steamkids.sync',
      JSON.stringify({ enabled: true, syncSecret: 'a'.repeat(32), lastPushedTs: 0, lastError: null, lastSyncedAt: null })
    );
  });
  await page.click('#gate-lock-btn');
  await page.fill('#gate-login-passcode', 'testtest');
  await page.click('#gate-login-submit');

  await check(
    'オフライン時は「別のタブレットとつなぐ」がdisabled',
    async () => page.isDisabled('[data-action="sync-issue-link"]')
  );
  await check('オフライン時は理由が表示される', async () => (await page.textContent('.sync-offline-reason')).length > 0);
}
