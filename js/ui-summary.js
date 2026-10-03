// summaryステップ（クリア演出・「できたこと」・単元の進み具合）の描画（Issue #91）。
// レッスンクリア（このファイル）＜単元ぜんぶクリアの2段階で演出を大きくする（Issue #104。
// ステージクリアの演出はjs/ui-reaction.jsのshowSuccessが担う）。
import { S } from './state.js';
import { getEvents } from './events.js';
import { summarize, lessonAchievements } from './analytics.js';
import { shortestSteps, shortestChips, boardSpec } from './engine-grid.js';
import { stampSvg, flagSvg, medalSvg } from './ui-picker.js';
import { play as playSfx } from './sfx.js';
import { prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { createPrimaryButton, goToStep } from './ui-step.js';
import { codeStripHtml, randomCode } from './seed-code.js';
import { withDev } from './dev-mode.js';

const MAX_CARDS = 3;
const LESSON_CONFETTI = { count: 120, duration: 3000 };
const UNIT_CONFETTI = { count: 200, duration: 4000, colors: ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#38bdf8', '#818cf8', '#e879f9'] };

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
  return boardSpec(playStep);
}

export function renderSummary(root) {
  const lessonId = S.lesson.lessonId;
  const events = getEvents();
  const { lessons: lessonStatus } = summarize(events, Date.now());
  const isCleared = (id) => id === lessonId || lessonStatus[id]?.status === 'cleared';
  const unitAllCleared = Boolean(S.unit) && S.unit.lessonIds.every(isCleared);

  const burst = document.createElement('div');
  burst.className = 'flex flex-col items-center gap-2 py-4';
  const star = document.createElement('div');
  // レッスンクリアの星は大きめ(w-32)で回転しながら出る。reduced-motion時は静止表示（Issue #104）。
  star.className = prefersReducedMotion() ? 'w-32 h-32' : 'w-32 h-32 star-reveal';
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
  // レッスンクリアの演出：画面全体の紙ふぶき＋fanfare（Issue #104）。単元ぜんぶクリアの
  // 演出（メダル・虹色紙ふぶき・grandFanfare）はこの後さらに重ねる。
  playSfx('fanfare');
  screenConfetti(LESSON_CONFETTI);

  const playStepIds = S.lesson.steps.filter((s) => s.kind === 'play').map((s) => s.stepId);
  const lastPlay = S.lesson.steps.filter((s) => s.kind === 'play').at(-1);
  let shortest;
  if (lastPlay && S.lesson.type !== 'predict-slider') {
    const spec = playSpecOf(lastPlay);
    // repeatBoxはループ込みの最短性を求めない（shortest未定義＝「いちばん みじかい」を出さない。Issue #66）。
    if (!lastPlay.repeatBox) shortest = lastPlay.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
  }
  const sinceTs = currentAttemptSinceTs(events, lessonId);
  const cards = lessonAchievements(events, lessonId, sinceTs, { shortest, playStepIds });
  if (cards.length > 0) {
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'achievement-cards flex flex-wrap justify-center gap-2 my-2';
    cards.slice(0, MAX_CARDS).forEach((text) => cardsWrap.appendChild(achievementCard(text)));
    root.appendChild(cardsWrap);
  }

  // れんしゅう：このマップのたね（絵のコード）を見せ、「ちがう マップ」でたね入力へ戻す（Issue #69）。
  if (S.seed != null) {
    const seedBox = document.createElement('div');
    seedBox.className = 'seed-result flex flex-col items-center gap-1 my-2';
    const seedLabel = document.createElement('p');
    seedLabel.className = 'text-sm text-slate-600';
    seedLabel.textContent = 'この マップの たね';
    const seedStrip = document.createElement('div');
    seedStrip.className = 'seed-strip flex gap-1';
    seedStrip.dataset.seed = S.seed;
    seedStrip.innerHTML = codeStripHtml(S.seed);
    seedBox.append(seedLabel, seedStrip);
    root.appendChild(seedBox);
    root.appendChild(
      createPrimaryButton('ちがう マップ', () => {
        S.seedDraft = randomCode();
        goToStep(S.lesson.steps.findIndex((s) => s.kind === 'seedPick'));
      }, 'another-map')
    );
  }

  if (S.unit) {
    const stampsWrap = document.createElement('div');
    stampsWrap.className = 'unit-progress flex justify-center gap-1 my-2';
    S.unit.lessonIds.forEach((id) => {
      const dot = document.createElement('span');
      dot.className = 'inline-flex w-6 h-6';
      dot.dataset.stamp = isCleared(id) ? 'done' : 'todo';
      if (isCleared(id)) {
        dot.innerHTML = stampSvg();
        // 今回クリアしたレッスンのスタンプだけ「ぽん」と押される演出にする（reduced-motion時は
        // 静止表示のまま。Issue #104）。
        if (id === lessonId && !prefersReducedMotion()) dot.classList.add('stamp-pop');
      } else {
        dot.className += ' rounded-full bg-slate-200';
      }
      stampsWrap.appendChild(dot);
    });
    root.appendChild(stampsWrap);

    if (unitAllCleared) {
      // 単元ぜんぶクリア：レッスンクリアの演出にメダル・虹色紙ふぶき・grandFanfareを重ねる
      // （Issue #104。以前は「しま クリア！」という文言が単元名の言い換えとして分かりにくかった
      // ため、単元名そのものを入れた文言に変える）。
      playSfx('grandFanfare');
      screenConfetti(UNIT_CONFETTI);

      const medal = document.createElement('div');
      medal.className = 'w-40 h-40 mx-auto my-2';
      medal.innerHTML = medalSvg();
      root.appendChild(medal);

      const flagWrap = document.createElement('div');
      flagWrap.className = `flex items-center justify-center gap-1 ${prefersReducedMotion() ? '' : 'flag-wave'}`;
      flagWrap.innerHTML = `<span class="w-7 h-7 inline-block">${flagSvg()}</span>`;
      const flagMsg = document.createElement('h2');
      flagMsg.className = 'text-center text-emerald-700 font-bold';
      flagMsg.textContent = `${S.unit.title} ぜんぶ クリア！`;
      flagWrap.appendChild(flagMsg);
      root.appendChild(flagWrap);
    }

  }

  // 「つぎへ」と「おわる」は同じ大きさで横に並べる（Issue #263）。「おわる」はタイトルへ戻る（#257の「タイトルへ」と同じ行き先）。
  const nextId = S.unit?.lessonIds[S.unit.lessonIds.indexOf(lessonId) + 1];
  const choiceRow = document.createElement('div');
  choiceRow.className = 'flex justify-center gap-3 w-full max-w-sm mx-auto px-2';
  const choiceClass = 'flex-1 max-w-[12rem]';
  if (nextId) {
    const nextBtn = createPrimaryButton('つぎへ', () => (location.href = withDev(`./index.html?lesson=${nextId}`)), 'next-lesson');
    nextBtn.className += ` ${choiceClass}`;
    choiceRow.appendChild(nextBtn);
  }
  const endBtn = createPrimaryButton('おわる', () => (location.href = withDev('./index.html')), 'finish');
  endBtn.className += ` ${choiceClass}`;
  choiceRow.appendChild(endBtn);
  root.appendChild(choiceRow);

  root.appendChild(
    createPrimaryButton('ほかのレッスンへ', () => (location.href = withDev('./index.html?view=map')), 'back-to-picker')
  );
}
