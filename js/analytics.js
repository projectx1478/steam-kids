// 学習ログの集計と詰まりアラート判定の純粋関数。DOM・localStorageに触れない。
const RETRY_ALERT_THRESHOLD = 3;
const DWELL_ALERT_RATIO = 2;
const MIN_DWELL_SAMPLES_FOR_ALERT = 3;
const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// step_enterを開始点とし、直後のstep_leaveまたはabandon（同一stepId）を終端としてdwell時間を作る。
// 終端の無いstep_enterは計上しない（次のstep_enterが来た時点で破棄される）。
function computeDwellSamples(sortedStepEvents) {
  const samples = [];
  let openTs = null;
  for (const e of sortedStepEvents) {
    if (e.type === 'step_enter') {
      openTs = e.ts;
    } else if ((e.type === 'step_leave' || e.type === 'abandon') && openTs !== null) {
      samples.push(e.ts - openTs);
      openTs = null;
    }
  }
  return samples;
}

function computeStepMetrics(stepEvents) {
  const sorted = [...stepEvents].sort((a, b) => a.ts - b.ts);
  const dwellSamples = computeDwellSamples(sorted);
  const dwellMedianMs = dwellSamples.length > 0 ? median(dwellSamples) : null;
  const latestDwellMs = dwellSamples.length > 0 ? dwellSamples[dwellSamples.length - 1] : null;

  const retryCount = sorted.filter((e) => e.type === 'retry').length;

  const predicts = sorted.filter((e) => e.type === 'predict');
  const predictCorrectCount = predicts.filter((e) => e.payload?.correct === true).length;
  const lastTwoPredicts = predicts.slice(-2);

  const alerts = [];
  if (retryCount >= RETRY_ALERT_THRESHOLD) alerts.push('retry');
  if (
    dwellSamples.length >= MIN_DWELL_SAMPLES_FOR_ALERT &&
    latestDwellMs >= dwellMedianMs * DWELL_ALERT_RATIO
  ) {
    alerts.push('dwell');
  }
  if (lastTwoPredicts.length === 2 && lastTwoPredicts.every((e) => e.payload?.correct === false)) {
    alerts.push('predict');
  }

  return {
    retryCount,
    dwellSamples,
    dwellMedianMs,
    latestDwellMs,
    predictTotal: predicts.length,
    predictCorrectCount,
    alerts,
  };
}

function computeLessonStatus(lessonEvents) {
  if (lessonEvents.some((e) => e.type === 'clear')) return 'cleared';
  if (lessonEvents.some((e) => e.type === 'step_enter')) return 'in_progress';
  return 'not_started';
}

// clearが後続しない最後のabandonのstepId。クリア済みなら離脱地点は無いものとしてnull。
function computeAbandonedStepId(sortedLessonEvents) {
  let lastAbandon = null;
  for (const e of sortedLessonEvents) {
    if (e.type === 'abandon') lastAbandon = e;
    else if (e.type === 'clear' && lastAbandon && e.ts > lastAbandon.ts) lastAbandon = null;
  }
  return lastAbandon ? lastAbandon.stepId : null;
}

// now を含む直近7日分を日別（UTC日付）に集計する。0件の日も欠かさず含める。
function computeRecentDays(events, now) {
  const days = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i -= 1) {
    days.push({ date: new Date(now - i * DAY_MS).toISOString().slice(0, 10), count: 0 });
  }
  const indexByDate = new Map(days.map((d, i) => [d.date, i]));
  const cutoff = now - RECENT_DAYS * DAY_MS;
  for (const e of events) {
    if (e.ts < cutoff || e.ts > now) continue;
    const idx = indexByDate.get(new Date(e.ts).toISOString().slice(0, 10));
    if (idx !== undefined) days[idx].count += 1;
  }
  return days;
}

// summarize(events, now) -> { lessons: { [lessonId]: {...} }, recentDays: [...] }
// now は呼び出し側から渡す（純粋関数内でDate.now()を呼ばない）。
export function summarize(events, now) {
  const byLesson = new Map();
  for (const e of events) {
    if (!byLesson.has(e.lessonId)) byLesson.set(e.lessonId, []);
    byLesson.get(e.lessonId).push(e);
  }

  const lessons = {};
  for (const [lessonId, lessonEvents] of byLesson) {
    const sortedLessonEvents = [...lessonEvents].sort((a, b) => a.ts - b.ts);

    const byStep = new Map();
    for (const e of sortedLessonEvents) {
      if (e.stepId === null) continue;
      if (!byStep.has(e.stepId)) byStep.set(e.stepId, []);
      byStep.get(e.stepId).push(e);
    }

    const steps = {};
    for (const [stepId, stepEvents] of byStep) {
      steps[stepId] = computeStepMetrics(stepEvents);
    }

    lessons[lessonId] = {
      status: computeLessonStatus(sortedLessonEvents),
      abandonedStepId: computeAbandonedStepId(sortedLessonEvents),
      steps,
    };
  }

  return { lessons, recentDays: computeRecentDays(events, now) };
}

// lessonAchievements(events, lessonId, sinceTs, { shortest, playStepIds }) -> string[]
// このレッスンを開始(sinceTs)してからのイベントだけを対象に、子ども向けの「できたこと」文言を
// 作る（最大3件）。点数・割合・他人との比較は返さない（PROJECT.md非目標。Issue #91）。
// playStepIds: レッスンのplay全ステージのstepId一覧（だんだん難易度を上げる複数ステージ構成。
// Issue #104）。省略時は単一ステージ扱い（1回で通したかの判定基準=1）。
export function lessonAchievements(events, lessonId, sinceTs, { shortest, playStepIds = [] } = {}) {
  const relevant = events
    .filter((e) => e.lessonId === lessonId && e.ts >= sinceTs)
    .sort((a, b) => a.ts - b.ts);

  const cards = [];

  const firstPredict = relevant.find((e) => e.type === 'predict');
  if (firstPredict) {
    cards.push(firstPredict.payload?.correct ? 'よそうが ぴったり！' : 'けっかを しっかり たしかめたね');
  }

  const clearEvent = relevant.find((e) => e.type === 'clear');
  if (clearEvent) {
    const totalStages = Math.max(1, playStepIds.length);
    if (totalStages > 1) cards.push(`${totalStages}つの ステージを クリア！`);

    const runsBeforeClear = relevant.filter((e) => e.type === 'run' && e.ts <= clearEvent.ts);
    cards.push(runsBeforeClear.length <= totalStages ? '1かいで ゴール！' : 'あきらめずに ゴールできたね');

    const lastRun = runsBeforeClear.at(-1);
    if (typeof shortest === 'number' && lastRun?.payload?.commandCount === shortest) {
      cards.push('いちばん みじかい めいれい！');
    }
  }

  return cards;
}
