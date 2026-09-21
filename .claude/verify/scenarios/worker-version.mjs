// Issue #29: 同期Worker(手動wrangler deploy)とクライアント(GitHub Pages自動配信)の版数ズレを
// X-Worker-Versionヘッダで検知し、ダッシュボードに警告バナーを表示する。子ども画面には出さない。

export const name = 'X-Worker-Version: 版数ズレ検知でダッシュボードに警告バナーが出る(Issue #29)';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';
const PASSCODE = 'testtest';
const LEARNER_ID = '77777777-7777-7777-7777-777777777777';
const MATCHING_VERSION = 'steam-kids-sync-v2'; // js/sync.js の EXPECTED_WORKER_VERSION と同値
const MISMATCHED_VERSION = 'steam-kids-sync-v0';

function syncState() {
  return {
    enabled: true,
    syncSecret: 'v'.repeat(32),
    lastPushedTs: 0,
    lastError: null,
    lastSyncedAt: null,
    workerVersionMismatch: false,
  };
}

async function seed(page) {
  await page.evaluate(
    async ({ sync, profile, passcode }) => {
      localStorage.setItem('steamkids.sync', JSON.stringify(sync));
      localStorage.setItem('steamkids.profile', JSON.stringify(profile));
      localStorage.setItem('steamkids.events', JSON.stringify([]));
      const guardian = await import('/js/guardian.js');
      await guardian.setPasscode(passcode);
    },
    { sync: syncState(), profile: { learnerId: LEARNER_ID, label: null, createdAt: 0 }, passcode: PASSCODE }
  );
}

async function unlock(page) {
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
}

// version=nullはヘッダ無し(デプロイ前の旧Worker)を模す
function routeWithVersion(page, version) {
  const headers = version === null ? {} : { 'X-Worker-Version': version };
  return page.route(`${ENDPOINT}/sync*`, async (route) => {
    const json = route.request().method() === 'GET' ? { events: [] } : { acceptedCount: 0 };
    await route.fulfill({ headers, json });
  });
}

function bannerCount(page) {
  return page.$$eval('#worker-version-warning', (els) => els.length);
}

export default async function run({ page, check }) {
  await page.goto('/dashboard.html');
  await seed(page);

  // 1: EXPECTED_WORKER_VERSIONと一致する場合、バナー要素は0個
  await routeWithVersion(page, MATCHING_VERSION);
  await page.reload();
  await unlock(page);
  await check('一致時はバナー要素が0個', () => bannerCount(page), 0);

  // 2: 不一致の場合、バナーが1個表示される
  await routeWithVersion(page, MISMATCHED_VERSION);
  await page.reload();
  await unlock(page);
  await check('不一致時はバナーが1個表示される', () => bannerCount(page), 1);
  await check('バナーに文言が表示される', async () => (await page.textContent('#worker-version-warning')).length > 0);

  // 3: ヘッダ無し(デプロイ前の旧Worker)も不一致として扱う
  await routeWithVersion(page, null);
  await page.reload();
  await unlock(page);
  await check('ヘッダ無しも不一致として扱われる', () => bannerCount(page), 1);

  // 4: 子ども画面(index.html)にはバナーを出さない
  await page.goto('/index.html');
  await check('子ども画面にはバナー要素が無い', () => bannerCount(page), 0);

  // 5: 375px幅で横スクロールが発生しない(不一致でバナー表示中の状態のまま確認)
  await page.goto('/dashboard.html');
  await unlock(page);
  await check(
    '375px幅で横スクロールが発生しない',
    () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );
}
