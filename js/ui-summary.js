// summaryステップ（クリア演出・「できたこと」・単元の進み具合）の描画（Issue #91）。
import { S } from './state.js';
import { getEvents } from './events.js';
import { summarize, lessonAchievements } from './analytics.js';
import { shortestSteps, shortestChips } from './engine-grid.js';
import { stampSvg } from './ui-picker.js';
import { play as playSfx } from './sfx.js';
import { prefersReducedMotion } from './ui-grid.js';
import { createPrimaryButton } from './ui-step.js';

const MAX_CARDS = 3;

function achievementCard(text) {
  const card = document.createElement('div');
  card.className =
    'achievement-card flex flex-col items-center gap-1 min-w-[96px] px-3 py-2 rounded-xl bg-sky-50 border border-sky-100';
  card.innerHTML =
    '<svg viewBox="0 0 24 24" class="w-6 h-6 text-sky-500" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2l2.6 6.6L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.4L12 2Z"/></svg>';
  const label = document.createElement('span');
  label.className = 'text-xs text-center';
  label.textContent = text;
  card.appendChild(label);
  return card;
}

// このレッスンを開始してから最新の試行のみを対象にする（stepId===先頭stepのstep_enter）。
function currentAttemptSinceTs(events, lessonId) {
  const introStepId = S.lesson.steps[0].stepId;
  const enters = events.filter(
    (e) => e.lessonId === lessonId && e.stepId === introStepId && e.type === 'step_enter'
  );
  return enters.length > 0 ? enters[enters.length - 1].ts : 0;
}

function playSpecOf(playStep) {
  return { grid: playStep.grid, start: playStep.start, goal: playStep.goal, walls: playStep.walls, items: playStep.items ?? [] };
}

export function renderSummary(root) {
  const lessonId = S.lesson.lessonId;

  const burst = document.createElement('div');
  burst.className = 'flex flex-col items-center gap-2 py-4';
  const star = document.createElement('div');
  star.className = prefersReducedMotion() ? 'w-16 h-16' : 'w-16 h-16 motion-safe:animate-bounce';
  star.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">
    <polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24" fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
  </svg>`;
  burst.appendChild(star);
  const clearHeading = document.createElement('h2');
  clearHeading.className = 'text-2xl font-bold text-amber-600';
  clearHeading.textContent = 'クリア！';
  burst.appendChild(clearHeading);
  const lessonTitle = document.createElement('p');
  lessonTitle.className = 'text-lg';
  lessonTitle.textContent = S.lesson.title;
  burst.appendChild(lessonTitle);
  root.appendChild(burst);
  playSfx('clear');

  const events = getEvents();
  const playStep = S.lesson.steps.find((s) => s.kind === 'play');
  let shortest;
  if (playStep) {
    const spec = playSpecOf(playStep);
    shortest = playStep.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
  }
  const sinceTs = currentAttemptSinceTs(events, lessonId);
  const cards = lessonAchievements(events, lessonId, sinceTs, { shortest });
  if (cards.length > 0) {
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'achievement-cards flex flex-wrap justify-center gap-2 my-2';
    cards.slice(0, MAX_CARDS).forEach((text) => cardsWrap.appendChild(achievementCard(text)));
    root.appendChild(cardsWrap);
  }

  if (S.unit) {
    const { lessons: lessonStatus } = summarize(events, Date.now());
    const isCleared = (id) => id === lessonId || lessonStatus[id]?.status === 'cleared';

    const stampsWrap = document.createElement('div');
    stampsWrap.className = 'unit-progress flex justify-center gap-1 my-2';
    S.unit.lessonIds.forEach((id) => {
      const dot = document.createElement('span');
      dot.className = 'inline-flex w-6 h-6';
      dot.dataset.stamp = isCleared(id) ? 'done' : 'todo';
      if (isCleared(id)) dot.innerHTML = stampSvg();
      else dot.className += ' rounded-full bg-slate-200';
      stampsWrap.appendChild(dot);
    });
    root.appendChild(stampsWrap);

    if (S.unit.lessonIds.every(isCleared)) {
      const flagMsg = document.createElement('h2');
      flagMsg.className = 'text-center text-emerald-700 font-bold';
      flagMsg.textContent = 'しま クリア！';
      root.appendChild(flagMsg);
    }

    const nextId = S.unit.lessonIds[S.unit.lessonIds.indexOf(lessonId) + 1];
    if (nextId) {
      root.appendChild(
        createPrimaryButton('つぎの レッスンへ', () => (location.href = `./index.html?lesson=${nextId}`), 'next-lesson')
      );
    }
  }

  root.appendChild(createPrimaryButton('ほかのレッスンへ', () => (location.href = './index.html'), 'back-to-picker'));
}
