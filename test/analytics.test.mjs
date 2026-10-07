// 移行元: .claude/verify/scenarios/p2-analytics.mjs（ブラウザ不要）。実行: npm run test:unit
// P2: 学習ログの集計と詰まりアラート判定（純粋関数）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../js/analytics.js';

const LESSON = 'test-lesson';
const STEP = 's1';

function ev(type, ts, payload = {}) {
  return { eventId: `e${ts}-${type}`, learnerId: 'l1', lessonId: LESSON, stepId: STEP, type, ts, payload };
}
const step = (events, now = 1000) => summarize(events, now).lessons[LESSON].steps[STEP];

test('analytics: やり直し3回以上でretryアラート', () => {
  assert.equal(step([ev('retry', 1), ev('retry', 2)]).alerts.includes('retry'), false, 'retryが2件ではアラートが出ない');
  assert.equal(step([ev('retry', 1), ev('retry', 2), ev('retry', 3)]).alerts.includes('retry'), true, 'retryが3件でアラートが出る');
});

test('analytics: 長尺試作の一覧IDはalertsだけ空（retryCountは集計する）', () => {
  const events = [ev('retry', 1), ev('retry', 2), ev('retry', 3)];
  const inList = summarize(events, 1000, { longTrialIds: [LESSON] }).lessons[LESSON].steps[STEP];
  assert.deepEqual(inList.alerts, [], '一覧IDはalertsが空');
  assert.equal(inList.retryCount, 3, '一覧IDでもretryCountは3');
  const other = summarize(events, 1000, { longTrialIds: ['other'] }).lessons[LESSON].steps[STEP];
  assert.deepEqual(other.alerts, ['retry'], '一覧外IDはretryアラート');
  assert.deepEqual(step(events).alerts, ['retry'], '第3引数省略時は従来どおり');
});

test('analytics: 滞在時間が中央値の2倍以上（サンプル3件以上）でdwellアラート', () => {
  const dwellEvents = (lastDwellMs) => [
    ev('step_enter', 0),
    ev('step_leave', 10), // dwell 10
    ev('step_enter', 20),
    ev('step_leave', 30), // dwell 10
    ev('step_enter', 40),
    ev('step_leave', 40 + lastDwellMs), // dwell lastDwellMs（中央値10）
  ];
  assert.equal(step(dwellEvents(19)).alerts.includes('dwell'), false, '滞在時間が中央値の1.9倍ではアラートが出ない');
  assert.equal(step(dwellEvents(20)).alerts.includes('dwell'), true, '滞在時間が中央値の2.0倍でアラートが出る');

  const twoSamplesHugeRatio = [ev('step_enter', 0), ev('step_leave', 10), ev('step_enter', 20), ev('step_leave', 1000)];
  assert.equal(step(twoSamplesHugeRatio).alerts.includes('dwell'), false, '滞在サンプルが2件では倍率に関わらずアラートが出ない');
});

test('analytics: 予想の直近2件がともに不正解でpredictアラート', () => {
  const lastTrue = [ev('predict', 1, { correct: false }), ev('predict', 2, { correct: true })];
  const lastTwoFalse = [ev('predict', 1, { correct: false }), ev('predict', 2, { correct: false })];
  assert.equal(step(lastTrue).alerts.includes('predict'), false, '直近の予想が正解ならアラートが出ない');
  assert.equal(step(lastTwoFalse).alerts.includes('predict'), true, '直近2件がともに不正解ならアラートが出る');
});

test('analytics: 空配列でもlessonsは空・recentDaysは7日分', () => {
  const empty = summarize([], 1000);
  assert.equal(Object.keys(empty.lessons).length, 0, '空配列でもlessonsが空オブジェクトで返る');
  assert.equal(empty.recentDays.length, 7, '空配列でもrecentDaysが7日分返る');
  assert.equal(empty.recentDays.every((d) => d.count === 0), true, '空配列のrecentDaysは全日0件');
});

test('analytics: レッスン状態と離脱地点', () => {
  assert.equal(summarize([ev('step_enter', 1), ev('clear', 2)], 1000).lessons[LESSON].status, 'cleared', 'step_enter+clearでレッスン状態がcleared');
  assert.equal(summarize([ev('step_enter', 1), ev('abandon', 2)], 1000).lessons[LESSON].abandonedStepId, STEP, 'clearを伴わないabandonが離脱地点になる');
  const abandonedThenCleared = [ev('step_enter', 1), ev('abandon', 2), ev('step_enter', 3), ev('clear', 4)];
  assert.equal(summarize(abandonedThenCleared, 1000).lessons[LESSON].abandonedStepId, null, 'abandon後にclearすれば離脱地点はnull');
});
