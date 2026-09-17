export const name = 'P2: 学習ログの集計と詰まりアラート判定（純粋関数）';

const LESSON = 'test-lesson';
const STEP = 's1';

function ev(type, ts, payload = {}) {
  return { eventId: `e${ts}-${type}`, learnerId: 'l1', lessonId: LESSON, stepId: STEP, type, ts, payload };
}

async function summarize(page, events, now = 1000) {
  return page.evaluate(
    async ({ events, now }) => {
      const { summarize } = await import('/js/analytics.js');
      return summarize(events, now);
    },
    { events, now }
  );
}

export default async function run({ page, check }) {
  await page.goto('/index.html');

  // 1: やり直し3回以上
  const retry2 = [ev('retry', 1), ev('retry', 2)];
  const retry3 = [ev('retry', 1), ev('retry', 2), ev('retry', 3)];
  await check(
    'retryが2件ではアラートが出ない',
    async () => (await summarize(page, retry2)).lessons[LESSON].steps[STEP].alerts.includes('retry'),
    false
  );
  await check(
    'retryが3件でアラートが出る',
    async () => (await summarize(page, retry3)).lessons[LESSON].steps[STEP].alerts.includes('retry'),
    true
  );

  // 2・3: 滞在時間（サンプル3件・中央値の倍率）
  function dwellEvents(lastDwellMs) {
    return [
      ev('step_enter', 0),
      ev('step_leave', 10), // dwell 10
      ev('step_enter', 20),
      ev('step_leave', 30), // dwell 10
      ev('step_enter', 40),
      ev('step_leave', 40 + lastDwellMs), // dwell lastDwellMs（中央値10）
    ];
  }
  await check(
    '滞在時間が中央値の1.9倍ではアラートが出ない',
    async () => (await summarize(page, dwellEvents(19))).lessons[LESSON].steps[STEP].alerts.includes('dwell'),
    false
  );
  await check(
    '滞在時間が中央値の2.0倍でアラートが出る',
    async () => (await summarize(page, dwellEvents(20))).lessons[LESSON].steps[STEP].alerts.includes('dwell'),
    true
  );

  const twoSamplesHugeRatio = [ev('step_enter', 0), ev('step_leave', 10), ev('step_enter', 20), ev('step_leave', 1000)];
  await check(
    '滞在サンプルが2件では倍率に関わらずアラートが出ない',
    async () =>
      (await summarize(page, twoSamplesHugeRatio)).lessons[LESSON].steps[STEP].alerts.includes('dwell'),
    false
  );

  // 4: 予想の直近2件
  const predictLastTrue = [ev('predict', 1, { correct: false }), ev('predict', 2, { correct: true })];
  const predictLastTwoFalse = [ev('predict', 1, { correct: false }), ev('predict', 2, { correct: false })];
  await check(
    '直近の予想が正解ならアラートが出ない',
    async () =>
      (await summarize(page, predictLastTrue)).lessons[LESSON].steps[STEP].alerts.includes('predict'),
    false
  );
  await check(
    '直近2件がともに不正解ならアラートが出る',
    async () =>
      (await summarize(page, predictLastTwoFalse)).lessons[LESSON].steps[STEP].alerts.includes('predict'),
    true
  );

  // 5: 空配列
  const empty = await summarize(page, []);
  await check('空配列でもlessonsが空オブジェクトで返る', async () => Object.keys(empty.lessons).length, 0);
  await check('空配列でもrecentDaysが7日分返る', async () => empty.recentDays.length, 7);
  await check(
    '空配列のrecentDaysは全日0件',
    async () => empty.recentDays.every((d) => d.count === 0)
  );

  // レッスン状態・離脱地点の確認
  const cleared = [ev('step_enter', 1), ev('clear', 2)];
  await check(
    'step_enter+clearでレッスン状態がcleared',
    async () => (await summarize(page, cleared)).lessons[LESSON].status,
    'cleared'
  );
  const abandoned = [ev('step_enter', 1), ev('abandon', 2)];
  await check(
    'clearを伴わないabandonが離脱地点になる',
    async () => (await summarize(page, abandoned)).lessons[LESSON].abandonedStepId,
    STEP
  );
  const abandonedThenCleared = [ev('step_enter', 1), ev('abandon', 2), ev('step_enter', 3), ev('clear', 4)];
  await check(
    'abandon後にclearすれば離脱地点はnull',
    async () => (await summarize(page, abandonedThenCleared)).lessons[LESSON].abandonedStepId,
    null
  );
}
