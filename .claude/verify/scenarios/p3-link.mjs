export const name = 'P3: リンクコードで複数端末の履歴が統合表示される';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';
const LESSON = 'cmd-01-susumu';

const LEARNER_A = '11111111-1111-1111-1111-111111111111';
const LEARNER_B = '22222222-2222-2222-2222-222222222222';
const LEARNER_C = '33333333-3333-3333-3333-333333333333';
const LEARNER_D = '44444444-4444-4444-4444-444444444444';
const LEARNER_E = '55555555-5555-5555-5555-555555555555';
const ISSUED_CODE = 'ABCD23';

function ev(id, type, ts, stepId, learnerId) {
  return { eventId: id, learnerId, lessonId: LESSON, stepId, type, ts, payload: {} };
}

function syncState(overrides = {}) {
  return {
    enabled: false,
    syncSecret: null,
    lastPushedTs: 0,
    lastPulledTs: 0,
    lastError: null,
    lastSyncedAt: null,
    ...overrides,
  };
}

async function seed(page, { sync, profile, events }) {
  await page.evaluate(
    ({ sync, profile, events }) => {
      localStorage.setItem('steamkids.sync', JSON.stringify(sync));
      localStorage.setItem('steamkids.profile', JSON.stringify(profile));
      localStorage.setItem('steamkids.events', JSON.stringify(events));
    },
    { sync, profile, events }
  );
}

async function redeemAttempt(browser, origin, { learnerId, code, routeRedeem }) {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto(`${origin}/dashboard.html`);
  await seed(p, { sync: syncState(), profile: { learnerId, label: null, createdAt: 0 }, events: [] });
  await p.route(`${ENDPOINT}/link/redeem*`, routeRedeem);
  await p.route(`${ENDPOINT}/sync*`, (route) => route.fulfill({ json: { events: [] } }));
  await p.reload();
  await p.fill('#link-code-input', code);
  await p.click('[data-action="sync-redeem"]');
  return { context, page: p };
}

export default async function run({ page, check }) {
  // サーバー側の状態を模した可変配列。GET /sync は since 以降を返す実サーバーと同じ絞り込みにする。
  const serverAllEvents = [
    ev('server-e1', 'step_enter', 1000, 's1', LEARNER_A),
    ev('server-e1-clear', 'clear', 1500, 's1', LEARNER_A),
  ];

  // デバイスA: 同期有効・リンクコード発行
  await page.goto('/dashboard.html');
  await seed(page, {
    sync: syncState({ enabled: true, syncSecret: 'a'.repeat(32) }),
    profile: { learnerId: LEARNER_A, label: null, createdAt: 0 },
    events: [],
  });
  await page.route(`${ENDPOINT}/link/issue*`, (route) =>
    route.fulfill({ json: { code: ISSUED_CODE, expiresAt: Date.now() + 24 * 60 * 60 * 1000 } })
  );
  await page.route(`${ENDPOINT}/sync*`, (route) => route.fulfill({ json: { events: [] } }));
  await page.reload();
  await page.click('[data-action="sync-issue-link"]');
  await check(
    '発行したコードが画面に表示される',
    async () => page.$eval('#link-code-display p', (el) => el.textContent),
    ISSUED_CODE
  );
  await check('残り時間が分単位で表示される', async () =>
    (await page.textContent('#link-code-remaining')).includes('分')
  );
  await check(
    '学習者IDの一部が表示される',
    async () => page.textContent('#sync-learner-id'),
    `学習者ID: ****${LEARNER_A.slice(-4)}`
  );

  // デバイスB: 別ブラウザコンテキスト（＝別端末。localStorageは分離される）
  const browser = page.context().browser();
  const origin = new URL(page.url()).origin;
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const autoFailsB = [];
  pageB.on('console', (msg) => {
    if (msg.type() === 'error') autoFailsB.push(msg.text());
  });
  pageB.on('pageerror', (err) => autoFailsB.push(err.message));

  await pageB.goto(`${origin}/dashboard.html`);
  await seed(pageB, {
    sync: syncState(),
    profile: { learnerId: LEARNER_B, label: 'てすと', createdAt: 0 },
    events: [ev('device-b-e1', 'step_enter', 2000, 's2', LEARNER_B)],
  });
  await pageB.route(`${ENDPOINT}/link/redeem*`, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.code !== ISSUED_CODE) {
      await route.fulfill({ status: 404, json: { error: 'code_not_found' } });
      return;
    }
    await route.fulfill({ json: { learnerId: LEARNER_A } });
  });
  await pageB.route(`${ENDPOINT}/sync*`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const since = Number(new URL(req.url()).searchParams.get('since')) || 0;
      await route.fulfill({ json: { events: serverAllEvents.filter((e) => e.ts >= since) } });
    } else {
      await route.fulfill({ json: { acceptedCount: 0 } });
    }
  });
  await pageB.reload();

  await pageB.fill('#link-code-input', ISSUED_CODE.toLowerCase());
  await pageB.click('[data-action="sync-redeem"]');

  await check(
    'redeem後にlearnerIdが発行元(デバイスA)のものへ置き換わる',
    async () => pageB.evaluate(() => JSON.parse(localStorage.getItem('steamkids.profile')).learnerId),
    LEARNER_A
  );
  await check('統合後もレッスンカードは1件だけ', async () => pageB.$$eval('.lesson-card', (els) => els.length), 1);
  await check(
    'デバイスAのステップ(s1)が同じレッスンカードに表示される',
    async () => pageB.getAttribute('.step-row[data-step-id="s1"]', 'data-step-id'),
    's1'
  );
  await check(
    'デバイスBのステップ(s2)も同じレッスンカードに表示される',
    async () => pageB.getAttribute('.step-row[data-step-id="s2"]', 'data-step-id'),
    's2'
  );
  await check(
    'redeem後に表示される学習者IDもデバイスAと同じ',
    async () => pageB.textContent('#sync-learner-id'),
    `学習者ID: ****${LEARNER_A.slice(-4)}`
  );
  await check(
    '横スクロールが発生しない',
    async () => pageB.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );
  await check('デバイスBでコンソールエラーが発生しない', async () => autoFailsB.length, 0);

  // 継続的な同期: デバイスAが後から学習を進めてサーバーへ送信した想定で、
  // デバイスBはダッシュボードを開き直すだけ（再度のコード入力なし）で自動的に最新化される
  serverAllEvents.push(ev('server-e2', 'step_enter', 5000, 's3', LEARNER_A));
  await pageB.reload();
  await check(
    '再訪問だけで新しいステップ(s3)が自動的に反映される',
    async () => pageB.getAttribute('.step-row[data-step-id="s3"]', 'data-step-id'),
    's3'
  );

  // 同期をやめると「同期を始める」ボタンに戻る
  await pageB.click('[data-action="sync-disable"]');
  await check('同期をやめると状態表示が無効になる', async () => pageB.textContent('#sync-status'), '同期: 無効');
  await check(
    '同期をやめると「同期を始める」ボタンが再表示される',
    async () => pageB.isVisible('[data-action="sync-register"]')
  );

  await contextB.close();

  // 異常系: 存在しないコード（404）
  const notFound = await redeemAttempt(browser, origin, {
    learnerId: LEARNER_C,
    code: 'ZZZZ99',
    routeRedeem: (route) => route.fulfill({ status: 404, json: { error: 'code_not_found' } }),
  });
  await check(
    '存在しないコードでメッセージが表示される',
    async () => notFound.page.textContent('#sync-message'),
    'コードが見つかりません'
  );
  await notFound.context.close();

  // 異常系: 期限切れ（410）
  const expired = await redeemAttempt(browser, origin, {
    learnerId: LEARNER_D,
    code: ISSUED_CODE,
    routeRedeem: (route) => route.fulfill({ status: 410, json: { error: 'code_expired' } }),
  });
  await check(
    '期限切れコードでメッセージが表示される',
    async () => expired.page.textContent('#sync-message'),
    'コードの有効期限が切れています。再発行してください'
  );
  await expired.context.close();

  // 異常系: 使用済み（410）
  const used = await redeemAttempt(browser, origin, {
    learnerId: LEARNER_E,
    code: ISSUED_CODE,
    routeRedeem: (route) => route.fulfill({ status: 410, json: { error: 'code_already_used' } }),
  });
  await check(
    '使用済みコードでメッセージが表示される',
    async () => used.page.textContent('#sync-message'),
    'このコードは既に使用されています'
  );
  await used.context.close();

  // 子ども画面(index.html)からダッシュボードへの目立たないリンク
  const contextChild = await browser.newContext();
  const pageChild = await contextChild.newPage();
  await pageChild.goto(`${origin}/index.html`);
  await check('子ども画面にダッシュボードへのリンクがある', async () =>
    pageChild.getAttribute('.dashboard-link', 'href'),
    'dashboard.html'
  );
  const linkBox = await pageChild.locator('.dashboard-link').boundingBox();
  await check('リンクのタップ領域が48px四方以上', async () => linkBox.width >= 48 && linkBox.height >= 48);
  await contextChild.close();
}
