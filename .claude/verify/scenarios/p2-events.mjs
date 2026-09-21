export const name = 'P2: イベントのlocalStorage永続化と学習者プロファイル';

async function toPlayStep(page) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
}

async function clearLesson(page) {
  await toPlayStep(page);
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
}

async function getLearnerId(page) {
  return page.evaluate(async () => {
    const { S } = await import('/js/state.js');
    return S.learnerId;
  });
}

async function getEventCount(page) {
  return page.evaluate(async () => {
    const { getEvents } = await import('/js/events.js');
    return getEvents().length;
  });
}

async function getAbandonCount(page) {
  return page.evaluate(async () => {
    const { getEvents } = await import('/js/events.js');
    return getEvents().filter((e) => e.type === 'abandon').length;
  });
}

export default async function run({ page, check }) {
  // 1・2: リロードしてもlearnerIdとイベントが失われない
  await toPlayStep(page);
  const learnerIdBefore = await getLearnerId(page);
  const countBefore = await getEventCount(page);

  await page.reload();
  await check('リロード後も初期ステップはintro', async () => page.getAttribute('#stage', 'data-step'), 'intro');
  await check('learnerIdがリロード後も同一', async () => getLearnerId(page), learnerIdBefore);
  await check(
    'イベント件数がリロード後も失われない',
    async () => (await getEventCount(page)) >= countBefore
  );

  // 3: 上限5000件で古い順に破棄
  await page.evaluate(async () => {
    const { appendEvent } = await import('/js/storage.js');
    for (let i = 0; i < 5001; i += 1) {
      appendEvent({
        eventId: `cap-test-${i}`,
        learnerId: 'l',
        lessonId: 'cmd-01-susumu',
        stepId: 's1',
        type: 'run',
        ts: i,
        payload: {},
      });
    }
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events')));
  await check('保存件数が上限5000件に収まる', async () => stored.length, 5000);
  await check('最古のイベント（0件目）が破棄されている', async () => stored[0].eventId, 'cap-test-1');

  // 4a: hidden化でabandonが1件だけ増える（visibilitychangeとpagehideの二重発火を1件に丸める）
  await page.goto('/index.html?lesson=cmd-01-susumu');
  const abandonBeforeHidden = await getAbandonCount(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  await check(
    'hidden化でabandonが1件だけ増える',
    async () => (await getAbandonCount(page)) - abandonBeforeHidden,
    1
  );

  // 4b: クリア後にhiddenにしてもabandonは増えない
  await clearLesson(page);
  const abandonBeforeClearHidden = await getAbandonCount(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await check(
    'クリア後のhidden化ではabandonが増えない',
    async () => (await getAbandonCount(page)) - abandonBeforeClearHidden,
    0
  );

  // 5: localStorageが不正なJSONでも子ども画面は通常どおり起動する
  await page.evaluate(() => {
    localStorage.setItem('steamkids.events', '{not valid json');
    localStorage.setItem('steamkids.profile', '{not valid json');
  });
  await page.reload();
  await check(
    '不正なJSONで汚れていても通常どおりintroから起動する',
    async () => page.getAttribute('#stage', 'data-step'),
    'intro'
  );
  await check('起動後は新しいlearnerIdが発行される', async () => typeof (await getLearnerId(page)), 'string');
}
