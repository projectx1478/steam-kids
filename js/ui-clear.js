// クリア演出の共通部品（Issue #342）。星のトースト（showSuccess）→ 間（操作行を空き枠にして「…」）
// → 結果ダイアログ（つぎへ＋もういちど）の流れを1か所に集める。間・ボタン64px・背面inert・
// ダイアログの見た目は画面ごとに変えない（Issue #336・#340）。
import { S } from './state.js';
import { logEvent } from './events.js';
import { clearResume } from './storage.js';
import { prefersReducedMotion } from './ui-grid.js';
import { createPrimaryButton, markLessonCleared, saveResumePoint } from './ui-step.js';
import { showSuccess } from './ui-reaction.js';

const RESULT_GAP_MS = 1500;
const RESULT_GAP_REDUCED_MS = 1000;
const GAP_FRAME_CLASSES = ['min-h-[64px]', 'items-center', 'rounded-2xl', 'border-2', 'border-dashed', 'border-slate-300'];

// recordClear({ isFinal, stageIndex }): クリアの記録。最終は clear→markLessonCleared→clearResume、
// 途中ステージは stage_clear のみ（レッスン全体のクリアや単元スタンプの対象にしない。Issue #104）。
export function recordClear({ isFinal, stageIndex }) {
  if (isFinal) {
    logEvent('clear', {});
    markLessonCleared();
    clearResume(S.lesson.lessonId);
  } else {
    logEvent('stage_clear', { stage: stageIndex + 1 });
    saveResumePoint();
  }
}

// showResultGap({ gapEl }): 間のあいだ gapEl（操作行）を同じ高さの空き枠にして「…」を出す。
// 返り値の dots は間の終わりに呼び出し側が外す。gapEl が無ければ何も出さない。
export function showResultGap({ gapEl }) {
  if (!gapEl) return null;
  gapEl.innerHTML = '';
  gapEl.classList.add(...GAP_FRAME_CLASSES);
  const dots = document.createElement('span');
  dots.className = 'col-span-full text-center text-2xl text-slate-400 w-full';
  dots.dataset.resultGap = 'true';
  dots.textContent = '…';
  gapEl.appendChild(dots);
  return dots;
}

// showResultDialog({ controls, lockEls, primaryBtn, replayBtn, heading }): controls 全体に被せる。
// 表示中は lockEls を inert にする。見出しはパネルに収まらなければ消す（スクロールさせない）。
export function showResultDialog({ controls, lockEls, primaryBtn, replayBtn, heading: headingText }) {
  primaryBtn.classList.remove('block', 'mx-auto', 'mt-4');
  primaryBtn.classList.add('w-full', 'h-16');
  replayBtn.classList.remove('block', 'mx-auto', 'mt-4', 'py-3');
  replayBtn.classList.add('w-40', 'h-16', 'self-end');
  const rowEl = document.createElement('div');
  rowEl.className = 'result-row absolute inset-0 z-10 flex flex-col justify-center rounded-2xl bg-slate-900/50 p-2';
  rowEl.dataset.resultRow = 'true';
  const dialog = document.createElement('div');
  dialog.className = 'result-dialog flex flex-col gap-2 rounded-xl bg-white p-3 shadow-lg';
  dialog.dataset.resultDialog = 'true';
  let heading = null;
  if (headingText) {
    heading = document.createElement('p');
    heading.className = 'text-center text-lg font-bold text-slate-700';
    heading.textContent = headingText;
    dialog.appendChild(heading);
  }
  dialog.appendChild(primaryBtn);
  dialog.appendChild(replayBtn);
  rowEl.appendChild(dialog);
  controls.classList.add('relative');
  lockEls.forEach((el) => {
    el.inert = true;
  });
  controls.appendChild(rowEl);
  if (heading && dialog.offsetHeight > rowEl.clientHeight - 16) heading.remove();
  return rowEl;
}

// disposeClear({ controls, lockEls, gapEl, rowEl }): 結果ダイアログ・空き枠を片付け、inert と relative を戻す。
export function disposeClear({ controls, lockEls, gapEl, rowEl }) {
  rowEl?.remove();
  lockEls.forEach((el) => {
    el.inert = false;
  });
  controls.classList.remove('relative');
  gapEl?.classList.remove(...GAP_FRAME_CLASSES);
}

// showClearSequence({ statusBar, controls, lockEls, gapEl, view, restore, label, primary, replay, heading,
// setActiveAnimation }) → { dispose() }
//   primary: { label, action, id }（action＝つぎへ押下時の処理、id＝data-action）。
//   gapEl: 間のあいだ空き枠にする操作行（省略可）。
//   dispose(): 間のタイマーとダイアログを片付ける。レッスンの途中でやり直す時（replay等）に呼ぶ。
export function showClearSequence({
  statusBar,
  controls,
  lockEls,
  gapEl,
  view,
  restore,
  label,
  primary,
  replay,
  heading,
  setActiveAnimation,
}) {
  let rowEl = null;
  let timer = null;
  let disposed = false;
  showSuccess(statusBar, { view, restore, ...(label ? { label } : {}) });
  const primaryBtn = createPrimaryButton(primary.label, primary.action, primary.id);
  const replayBtn = createPrimaryButton('もういちど', replay, 'replay');
  const dots = showResultGap({ gapEl });
  timer = setTimeout(() => {
    setActiveAnimation(null);
    dots?.remove();
    rowEl = showResultDialog({ controls, lockEls, primaryBtn, replayBtn, heading });
  }, prefersReducedMotion() ? RESULT_GAP_REDUCED_MS : RESULT_GAP_MS);
  setActiveAnimation({
    cancel() {
      clearTimeout(timer);
    },
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      disposeClear({ controls, lockEls, gapEl, rowEl });
    },
  };
}
