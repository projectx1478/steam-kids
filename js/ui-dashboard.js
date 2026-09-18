// ダッシュボード（/dashboard.html）の描画。summarize()の結果を描画するだけで、集計はしない。
import { loadEvents, loadProfile, saveProfile } from './storage.js';
import { summarize } from './analytics.js';
import { loadLesson } from './lesson-loader.js';

const STATUS_LABELS = { not_started: '未着手', in_progress: '途中', cleared: 'クリア' };
const ALERT_LABELS = {
  retry: 'やり直しが3回以上',
  dwell: '滞在時間が中央値の2倍以上',
  predict: '予想を2回連続で外している',
};

function formatMs(ms) {
  return ms === null ? '記録なし' : `${(ms / 1000).toFixed(1)}秒`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderProfileSection(root) {
  root.innerHTML = '';
  root.appendChild(el('h2', 'text-lg font-bold text-slate-800 mb-2', '呼び名'));

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'label-input';
  input.placeholder = '呼び名を入力';
  input.value = loadProfile()?.label ?? '';
  input.className = 'min-h-[48px] w-full px-3 rounded-lg border border-slate-300 text-base';
  input.addEventListener('change', () => {
    const profile = loadProfile() ?? { learnerId: crypto.randomUUID(), label: null, createdAt: Date.now() };
    profile.label = input.value.trim() === '' ? null : input.value.trim();
    saveProfile(profile);
  });
  root.appendChild(input);
}

function renderRecentSection(root, recentDays) {
  root.innerHTML = '';
  root.appendChild(el('h2', 'text-lg font-bold text-slate-800 mb-2', '直近7日の取り組み'));

  const row = el('div', 'recent-days flex gap-2 overflow-x-auto');
  recentDays.forEach((d) => {
    const cell = el('div', 'recent-day flex flex-col items-center min-w-[48px] px-2 py-1 rounded-lg bg-sky-50');
    cell.dataset.date = d.date;
    cell.dataset.count = String(d.count);
    cell.appendChild(el('span', 'text-[10px] text-slate-500', d.date.slice(5)));
    cell.appendChild(el('span', 'text-base font-bold text-sky-700', String(d.count)));
    row.appendChild(cell);
  });
  root.appendChild(row);
}

function renderStepRow(stepId, metrics) {
  const hasAlert = metrics.alerts.length > 0;
  const row = el(
    'div',
    `step-row flex flex-col gap-1 p-2 rounded-lg ${hasAlert ? 'bg-rose-50 border border-rose-400' : 'bg-slate-50'}`
  );
  row.dataset.stepId = stepId;
  row.dataset.alert = String(hasAlert);

  row.appendChild(el('p', 'text-sm font-bold text-slate-700', stepId));

  const predictText =
    metrics.predictTotal > 0 ? ` ・ 予想 ${metrics.predictCorrectCount}/${metrics.predictTotal}正解` : '';
  row.appendChild(
    el(
      'p',
      'text-xs text-slate-600',
      `やり直し ${metrics.retryCount}回 ・ 滞在時間 ${formatMs(metrics.latestDwellMs)}${predictText}`
    )
  );

  if (hasAlert) {
    row.appendChild(
      el('p', 'alert-reasons text-xs font-bold text-rose-700', metrics.alerts.map((a) => ALERT_LABELS[a]).join(' ・ '))
    );
  }

  return row;
}

async function renderLessonCard(lessonId, lesson) {
  const card = el('article', 'lesson-card bg-white rounded-2xl shadow p-4 flex flex-col gap-2');
  card.dataset.lessonId = lessonId;
  card.dataset.status = lesson.status;

  let title = lessonId;
  try {
    title = (await loadLesson(lessonId)).title;
  } catch {
    // レッスンJSONが見つからない場合はlessonIdをそのまま表示する
  }

  const header = el('div', 'flex items-center justify-between gap-2');
  header.appendChild(el('h2', 'text-lg font-bold text-slate-800', title));
  header.appendChild(
    el('span', 'status-badge text-sm px-2 py-1 rounded-full bg-slate-200 text-slate-700', STATUS_LABELS[lesson.status])
  );
  card.appendChild(header);

  if (lesson.abandonedStepId) {
    card.appendChild(el('p', 'abandoned-at text-sm text-amber-700', `離脱地点: ${lesson.abandonedStepId}`));
  }

  const stepsWrap = el('div', 'flex flex-col gap-2');
  Object.entries(lesson.steps).forEach(([stepId, metrics]) => stepsWrap.appendChild(renderStepRow(stepId, metrics)));
  card.appendChild(stepsWrap);

  return card;
}

async function renderLessonsSection(root, lessons) {
  root.innerHTML = '';
  const entries = Object.entries(lessons);
  if (entries.length === 0) {
    root.appendChild(el('p', 'text-slate-500 text-center py-8', 'まだ記録がありません'));
    return;
  }
  for (const [lessonId, lesson] of entries) {
    root.appendChild(await renderLessonCard(lessonId, lesson));
  }
}

async function renderDashboard() {
  const events = loadEvents();
  const result = summarize(events, Date.now());

  renderProfileSection(document.getElementById('profile-section'));
  renderRecentSection(document.getElementById('recent-section'), result.recentDays);
  await renderLessonsSection(document.getElementById('lessons-section'), result.lessons);
}

renderDashboard();
