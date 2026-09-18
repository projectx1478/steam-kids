export const name = 'P3: sync push/pull（固定レスポンス）';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

async function setSyncState(page, state) {
  await page.evaluate((s) => localStorage.setItem('steamkids.sync', JSON.stringify(s)), state);
}

async function setEvents(page, events) {
  await page.evaluate((e) => localStorage.setItem('steamkids.events', JSON.stringify(e)), events);
}

async function getSyncState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.sync')));
}

async function getEvents(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events') || '[]'));
}

export default async function run({ page, check }) {
  await page.goto('/index.html');

  // push: lastPushedTs以降(>=)のイベントのみ送信され、成功後にlastPushedTsが最大tsまで進む
  let pushedBody = null;
  await page.route(`${ENDPOINT}/sync*`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      pushedBody = JSON.parse(req.postData());
      await route.fulfill({ json: { acceptedCount: pushedBody.events.length } });
    } else {
      await route.fulfill({ json: { events: [] } });
    }
  });

  await setSyncState(page, {
    enabled: true,
    syncSecret: 'a'.repeat(32),
    lastPushedTs: 100,
    lastPulledTs: 0,
    lastError: null,
  });
  await setEvents(page, [
    { eventId: 'e1', learnerId: 'l1', lessonId: 'cmd-01-susumu', stepId: 's1', type: 'run', ts: 50, payload: {} },
    { eventId: 'e2', learnerId: 'l1', lessonId: 'cmd-01-susumu', stepId: 's1', type: 'run', ts: 100, payload: {} },
    { eventId: 'e3', learnerId: 'l1', lessonId: 'cmd-01-susumu', stepId: 's1', type: 'run', ts: 150, payload: {} },
  ]);

  await page.evaluate(async () => {
    const { push } = await import('/js/sync.js');
    await push();
  });

  await check('lastPushedTs以降(>=)のイベントのみ送信される', async () => pushedBody.events.length, 2);
  const stateAfterPush = await getSyncState(page);
  await check('push後にlastPushedTsが最大tsまで進む', async () => stateAfterPush.lastPushedTs, 150);
  await check('push成功でlastErrorがnullになる', async () => stateAfterPush.lastError, null);

  // pull: サーバーから返るイベントがlocalStorageへマージされ、lastPulledTsが進む
  await page.route(`${ENDPOINT}/sync*`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        json: {
          events: [
            { eventId: 'r1', learnerId: 'l1', lessonId: 'cmd-01-susumu', stepId: 's2', type: 'clear', ts: 300, payload: {} },
          ],
        },
      });
    } else {
      await route.fulfill({ json: { acceptedCount: 0 } });
    }
  });

  await page.evaluate(async () => {
    const { pull } = await import('/js/sync.js');
    await pull();
  });

  const eventsAfterPull = await getEvents(page);
  await check('pull結果がlocalStorageへマージされる', async () => eventsAfterPull.some((e) => e.eventId === 'r1'));
  const stateAfterPull = await getSyncState(page);
  await check('pull後にlastPulledTsが受信イベントの最大tsまで進む', async () => stateAfterPull.lastPulledTs, 300);

  // pullが0件のときはlastPulledTsを更新しない
  await page.route(`${ENDPOINT}/sync*`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') await route.fulfill({ json: { events: [] } });
    else await route.fulfill({ json: { acceptedCount: 0 } });
  });
  await page.evaluate(async () => {
    const { pull } = await import('/js/sync.js');
    await pull();
  });
  const stateAfterEmptyPull = await getSyncState(page);
  await check('0件pullではlastPulledTsが変わらない', async () => stateAfterEmptyPull.lastPulledTs, 300);

  // 同期が無効な端末はfetchしない
  await setSyncState(page, {
    enabled: false,
    syncSecret: null,
    lastPushedTs: 0,
    lastPulledTs: 0,
    lastError: null,
  });
  let fetchCalled = false;
  await page.route(`${ENDPOINT}/sync*`, async (route) => {
    fetchCalled = true;
    await route.fulfill({ json: { events: [] } });
  });
  await page.evaluate(async () => {
    const { push, pull } = await import('/js/sync.js');
    await push();
    await pull();
  });
  await check('同期未有効ではfetchが発生しない', async () => fetchCalled, false);
}
