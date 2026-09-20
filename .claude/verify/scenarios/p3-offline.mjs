export const name = 'P3: 同期有効・オフライン時もレッスンが完走する';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

export default async function run({ page, check }) {
  // route().abort()はブラウザが「Failed to load resource」をconsole.errorへ出し
  // ハーネスの自動失敗条件に触れるため、fetchをJS層で差し替えてネットワーク層に到達させない。
  await page.addInitScript((endpoint) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith(endpoint)) return Promise.reject(new TypeError('Failed to fetch'));
      return realFetch(input, init);
    };
  }, ENDPOINT);

  await page.goto('/index.html');
  await page.evaluate(() => {
    localStorage.setItem(
      'steamkids.sync',
      JSON.stringify({ enabled: true, syncSecret: 'a'.repeat(32), lastPushedTs: 0, lastError: null })
    );
  });
  await page.reload();

  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await page.click('[data-action="next"]');

  await check('オフラインでもレッスン最終ステップ(summary)まで到達する', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  const syncState = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.sync')));
  await check('push失敗が例外にならずlastErrorに記録される', async () => typeof syncState.lastError, 'string');
}
