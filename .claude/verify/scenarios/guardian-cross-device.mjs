// Issue #45: ローカルに合言葉未設定の端末（=2台目以降。link/redeemで同じ学習者IDに接続済み）は、
// サーバー側(/guardian/exists)に既に設定済みか確認してから「設定」と「ログイン」を出し分ける。
// route().fulfill({status:4xx,...})は「HTTP 4xx」「console.error」双方でハーネスの自動失敗条件に
// 触れるため、/guardian/authの成功/失敗はfetch差し替えで返す（guardian-offline.mjsと同方式）。

export const name = '保護者ゲート: 2台目以降は合言葉「設定」ではなく「ログイン」が出る(Issue #45)';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';
const PASSCODE = 'testtest';
const LEARNER_ID = '88888888-8888-8888-8888-888888888888';

function syncState() {
  return {
    enabled: true,
    syncSecret: 'd'.repeat(32),
    lastPushedTs: 0,
    lastError: null,
    lastSyncedAt: null,
  };
}

async function seedLinkedDeviceWithoutLocalPasscode(page) {
  await page.evaluate(
    ({ sync, profile }) => {
      localStorage.setItem('steamkids.sync', JSON.stringify(sync));
      localStorage.setItem('steamkids.profile', JSON.stringify(profile));
      localStorage.setItem('steamkids.events', JSON.stringify([]));
    },
    { sync: syncState(), profile: { learnerId: LEARNER_ID, label: null, createdAt: 0 } }
  );
}

function routeSync(page) {
  return page.route(`${ENDPOINT}/sync*`, (route) => route.fulfill({ json: { events: [] } }));
}

// /guardian/authは正解時のみ200を返す実サーバーの挙動を模す。誤り時にroute.fulfillで401を返すと
// ハーネスの自動失敗条件(HTTP 4xx・console.error)に触れるため、fetch自体を差し替えて判定する
// （guardian-offline.mjsと同方式）。addInitScriptはコンテキスト単位のため、新しいブラウザ
// コンテキストを作るたびに個別に呼ぶ必要がある。
function installGuardianAuthMock(target) {
  return target.addInitScript(
    ({ endpoint, passcode }) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith(`${endpoint}/guardian/auth`)) {
          const body = init && init.body ? JSON.parse(init.body) : {};
          if (body.passcode === passcode) {
            return Promise.resolve(
              new Response(JSON.stringify({ token: 'test-guardian-token', exp: Date.now() + 6 * 60 * 60 * 1000 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        return realFetch(input, init);
      };
    },
    { endpoint: ENDPOINT, passcode: PASSCODE }
  );
}

export default async function run({ page, check }) {
  await installGuardianAuthMock(page);

  // 1: サーバー側に既に設定済み(exists:true)の場合、ローカル未設定でも「ログイン」が出る
  await page.goto('/dashboard.html');
  await seedLinkedDeviceWithoutLocalPasscode(page);
  await page.route(`${ENDPOINT}/guardian/exists*`, (route) => route.fulfill({ json: { exists: true } }));
  await routeSync(page);
  await page.reload();

  await check('2台目でも#gate-setupではなく#gate-loginが出る', async () => page.isVisible('#gate-login'));
  await check('2台目では#gate-setupが表示されない', async () => page.isVisible('#gate-setup'), false);
  await check('他端末の合言葉を入力する案内が表示される', async () => page.isVisible('#gate-login-hint'));

  // 2: 誤った合言葉はサーバー照合で弾かれ、解錠されない
  await page.fill('#gate-login-passcode', 'wrongwrong');
  await page.click('#gate-login-submit');
  await check('誤入力ではダッシュボードが開かない', async () => page.isVisible('#dashboard-app'), false);
  await check('誤入力でエラー文言が表示される', async () => (await page.textContent('#gate-login-status')).length > 0);

  // 3: 1台目と同じ合言葉ならサーバー照合で解錠でき、以後ローカルにも保存される
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
  await check('サーバー照合成功でダッシュボードが開く', async () => page.isVisible('#dashboard-app'));

  const guardianRaw = await page.evaluate(() => localStorage.getItem('steamkids.guardian'));
  await check('解錠成功でローカルにもハッシュが保存される', () => guardianRaw !== null);
  await check('生の合言葉はローカルに残らない', () => !guardianRaw.includes(PASSCODE));

  // 4: 一度ローカルに保存されれば、次回以降はサーバーへ問い合わせず通常のローカル照合になる
  await page.click('#gate-lock-btn');
  await check('とじるボタンでロックされる', async () => page.isVisible('#dashboard-app'), false);
  await check('2回目以降は#gate-login-hintが出ない(ローカル照合に切り替わる)', async () => page.isVisible('#gate-login-hint'), false);
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
  await check('ローカル照合に切り替わっても同じ合言葉で解錠できる', async () => page.isVisible('#dashboard-app'));

  // 5: サーバー側に未設定(exists:false)の場合は、従来どおり「設定」画面が出る（真の初回端末）
  const contextFirst = await page.context().browser().newContext();
  const pageFirst = await contextFirst.newPage();
  await pageFirst.goto(new URL('/dashboard.html', page.url()).toString());
  await pageFirst.evaluate(
    ({ sync, profile }) => {
      localStorage.setItem('steamkids.sync', JSON.stringify(sync));
      localStorage.setItem('steamkids.profile', JSON.stringify(profile));
      localStorage.setItem('steamkids.events', JSON.stringify([]));
    },
    { sync: syncState(), profile: { learnerId: '99999999-9999-9999-9999-999999999999', label: null, createdAt: 0 } }
  );
  await pageFirst.route(`${ENDPOINT}/guardian/exists*`, (route) => route.fulfill({ json: { exists: false } }));
  await routeSync(pageFirst);
  await pageFirst.reload();
  await check('サーバー未設定なら真の初回端末として#gate-setupが出る', async () => pageFirst.isVisible('#gate-setup'));
  await contextFirst.close();

  // 6: サーバーへ到達できない場合は、従来どおり「設定」画面にフォールバックする
  const contextOffline = await page.context().browser().newContext();
  const pageOffline = await contextOffline.newPage();
  await pageOffline.addInitScript((endpoint) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith(`${endpoint}/guardian/exists`)) return Promise.reject(new TypeError('Failed to fetch'));
      return realFetch(input, init);
    };
  }, ENDPOINT);
  await pageOffline.goto(new URL('/dashboard.html', page.url()).toString());
  await pageOffline.evaluate(
    ({ sync, profile }) => {
      localStorage.setItem('steamkids.sync', JSON.stringify(sync));
      localStorage.setItem('steamkids.profile', JSON.stringify(profile));
      localStorage.setItem('steamkids.events', JSON.stringify([]));
    },
    { sync: syncState(), profile: { learnerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', label: null, createdAt: 0 } }
  );
  await routeSync(pageOffline);
  await pageOffline.reload();
  await check('サーバー未到達時は#gate-setupにフォールバックする', async () => pageOffline.isVisible('#gate-setup'));
  await contextOffline.close();

  // 7: 実際の2台目の操作順序を再現する。ブラウザ初回起動(sync未有効・合言葉未設定)では
  // #gate-setupしか出せないため、合言葉を決める前にリンクコードで接続できる入口
  // (#gate-setup-link-*)から接続し、以後は#guardian/existsの判定でログイン画面に切り替わる
  // ことを確認する（今回の実機不具合の実際の再現経路）。
  const ISSUE_CODE = 'ABCD23';
  const contextNew = await page.context().browser().newContext();
  const pageNew = await contextNew.newPage();
  await installGuardianAuthMock(pageNew);
  await pageNew.goto(new URL('/dashboard.html', page.url()).toString());
  await pageNew.route(`${ENDPOINT}/link/redeem*`, (route) => route.fulfill({ json: { learnerId: LEARNER_ID } }));
  await pageNew.route(`${ENDPOINT}/guardian/exists*`, (route) => route.fulfill({ json: { exists: true } }));
  await routeSync(pageNew);
  // 新規コンテキストの初回goto直後はpageshow(bfcache)絡みの予期しないリロードが発生することが
  // ある環境がある(Issue #43で確認済み・本シナリオとは無関係)。先に明示的にreloadして
  // 以後のクリック操作中に割り込まれないようにする。
  await pageNew.reload();

  await check('真っ新な端末は#gate-setupが出る', async () => pageNew.isVisible('#gate-setup'));
  await check('リンクコード接続フォームは既定で非表示', async () => pageNew.isVisible('#gate-setup-link-form'), false);
  await pageNew.click('#gate-setup-link-toggle');
  await check('トグルでリンクコード接続フォームが開く', async () => pageNew.isVisible('#gate-setup-link-form'));

  await pageNew.fill('#gate-setup-link-code', ISSUE_CODE);
  await pageNew.click('#gate-setup-link-submit');

  await check('接続成功で合言葉「設定」ではなく「ログイン」に切り替わる', async () => pageNew.isVisible('#gate-login'));
  await check('接続成功後は#gate-setupが表示されない', async () => pageNew.isVisible('#gate-setup'), false);
  await check('接続直後も他端末の合言葉を入力する案内が出る', async () => pageNew.isVisible('#gate-login-hint'));

  await pageNew.fill('#gate-login-passcode', PASSCODE);
  await pageNew.click('#gate-login-submit');
  await check('1台目と同じ合言葉でダッシュボードが開く', async () => pageNew.isVisible('#dashboard-app'));
  await contextNew.close();
}
