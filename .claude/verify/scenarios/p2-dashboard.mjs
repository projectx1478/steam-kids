export const name = 'P2: ダッシュボード画面（詰まりアラート表示）';

const LESSON = 'cmd-01-susumu';

function ev(type, ts, stepId, payload = {}) {
  return { eventId: `e${ts}-${type}-${stepId}`, learnerId: 'l1', lessonId: LESSON, stepId, type, ts, payload };
}

// s3に詰まりアラート3条件すべてを満たすイベント列を作る（やり直し3回・滞在時間中央値の2倍・予想2連続不正解）。
function alertEvents() {
  return [
    ev('step_enter', 0, 's1'),
    ev('step_leave', 1000, 's1'),
    ev('step_enter', 1000, 's2'),
    ev('predict', 1500, 's2', { correct: false }),
    ev('predict', 1800, 's2', { correct: false }),
    ev('step_leave', 2000, 's2'),
    ev('step_enter', 2000, 's3'),
    ev('step_leave', 2010, 's3'), // dwell 10
    ev('step_enter', 2100, 's3'),
    ev('step_leave', 2110, 's3'), // dwell 10
    ev('step_enter', 2200, 's3'),
    ev('retry', 2205, 's3'),
    ev('retry', 2210, 's3'),
    ev('retry', 2215, 's3'),
    ev('step_leave', 2220, 's3'), // dwell 20 = median(10)*2
  ];
}

async function seed(page, events) {
  await page.evaluate((events) => localStorage.setItem('steamkids.events', JSON.stringify(events)), events);
}

export default async function run({ page, check, shot }) {
  // 1: イベントが無い状態で開いても落ちない
  await page.goto('/dashboard.html');
  await check('空状態でも見出しが表示される', async () => page.textContent('#lessons-section'), 'まだ記録がありません');
  await check('空状態でも直近7日セクションが7件表示される', async () => (await page.$$('.recent-day')).length, 7);

  // 2: 既知のイベントを注入するとアラート該当ステップが強調表示され、理由が併記される
  await seed(page, alertEvents());
  await page.reload();
  await check(
    's3がアラート対象になる',
    async () => page.getAttribute('.step-row[data-step-id="s3"]', 'data-alert'),
    'true'
  );
  await check(
    's1はアラート対象にならない',
    async () => page.getAttribute('.step-row[data-step-id="s1"]', 'data-alert'),
    'false'
  );
  const reasons = await page.textContent('.step-row[data-step-id="s3"] .alert-reasons');
  await check('やり直し理由が併記される', async () => reasons.includes('やり直し'));
  await check('滞在時間理由が併記される', async () => reasons.includes('滞在時間'));
  const s2reasons = await page.textContent('.step-row[data-step-id="s2"] .alert-reasons');
  await check('予想理由が併記される', async () => s2reasons.includes('予想'));

  // 3: 表示4項目すべてが画面上に表示される
  await check('レッスン状態が表示される', async () => page.getAttribute('.lesson-card', 'data-status'), 'in_progress');
  const s3Text = await page.textContent('.step-row[data-step-id="s3"]');
  await check('やり直し回数の文言が含まれる', async () => s3Text.includes('やり直し'));
  await check('滞在時間の文言が含まれる', async () => s3Text.includes('滞在時間'));

  // 離脱地点の確認（別シードで検証）
  await seed(page, [ev('step_enter', 0, 's1'), ev('abandon', 100, 's1')]);
  await page.reload();
  await check(
    '離脱地点が表示される',
    async () => page.getAttribute('.lesson-card', 'data-status'),
    'in_progress'
  );
  await check('離脱地点のテキストが表示される', async () => page.textContent('.abandoned-at'), '離脱地点: s1');

  await check('直近7日の取り組みが表示される', async () => (await page.$$('.recent-day')).length, 7);
  await shot('lesson-with-alert');

  // 4: 呼び名を入力してリロードすると保持される。イベントには書かれない
  await seed(page, alertEvents());
  await page.reload();
  await page.fill('#label-input', 'たろう');
  await page.locator('#label-input').blur();
  await page.reload();
  await check('呼び名がリロード後も保持される', async () => page.inputValue('#label-input'), 'たろう');
  const eventsAfterLabel = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events')));
  await check('呼び名の保存でイベント件数が変わらない', async () => eventsAfterLabel.length, alertEvents().length);

  // 5: 横向き・縦向きどちらでも横スクロールが発生しない
  await check(
    '横スクロールが発生しない',
    async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );
}
