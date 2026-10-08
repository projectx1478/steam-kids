// クリア演出の共通部品（Issue #342）。星のトースト（showSuccess）→ 間（操作行を空き枠にして「…」）
// → 結果ダイアログ（つぎへ＋もういちど）の流れを1か所に集める。間・ボタン64px・背面inert・
// ダイアログの見た目は画面ごとに変えない（Issue #336・#340）。
import { S } from './state.js';
import { logEvent } from './events.js';
import { clearResume } from './storage.js';
import { prefersReducedMotion } from './ui-grid.js';
import { createPrimaryButton, markLessonCleared, saveResumePoint } from './ui-step.js';
import { showSuccess } from './ui-reaction.js';
import { create as createConfetti } from './vendor/confetti.js';

const CONFETTI_COUNT = 40;
const CONFETTI_TICKS = 110; // 約60fpsで約1.8秒
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

// showResultDialog({ controls, host, observed, primaryBtn, replayBtn, heading }) → { rowEl, detach() }
// 非モーダルの <dialog>（show()）を host（操作画面の外枠 lockEl の親）に置き、controls の境界ボックスに
// 一致させる。外枠は inert なので、ダイアログは外枠の外に出す。位置は resize・orientationchange・
// ResizeObserver（controls・host・observed）で測り直す。host が static なら表示中だけ relative にする。
// 見出しはパネルに収まらなければ消す（スクロールさせない）。detach() でリスナー・relative を戻す。
export function showResultDialog({ controls, host, observed, primaryBtn, replayBtn, heading: headingText }) {
  primaryBtn.classList.remove('block', 'mx-auto', 'mt-4');
  primaryBtn.classList.add('w-full', 'h-16');
  replayBtn.classList.remove('block', 'mx-auto', 'mt-4', 'py-3');
  replayBtn.classList.add('w-40', 'h-16', 'self-end');
  const rowEl = document.createElement('dialog');
  rowEl.className = 'result-row absolute z-10 flex flex-col justify-center rounded-2xl bg-slate-900/50 p-2';
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
  const addedRelative = getComputedStyle(host).position === 'static';
  if (addedRelative) host.classList.add('relative');
  // 紙吹雪の canvas（Issue #347）。ボタンより後ろ（カードを relative にして上に重ねる）・押せない・1回きり。
  // 動きを減らす設定では canvas を作らず confetti も呼ばない。
  let canvas = null;
  let fire = null;
  if (!prefersReducedMotion()) {
    canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full pointer-events-none';
    canvas.style.pointerEvents = 'none';
    canvas.dataset.clearConfetti = 'true';
    rowEl.insertBefore(canvas, dialog);
    dialog.classList.add('relative');
  }
  host.appendChild(rowEl);
  rowEl.show();
  const place = () => {
    const c = controls.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    rowEl.style.left = `${c.left - h.left - host.clientLeft + host.scrollLeft}px`;
    rowEl.style.top = `${c.top - h.top - host.clientTop + host.scrollTop}px`;
    rowEl.style.width = `${c.width}px`;
    rowEl.style.height = `${c.height}px`;
  };
  place();
  if (canvas) {
    fire = createConfetti(canvas, { resize: true, useWorker: false });
    const done = fire({ particleCount: CONFETTI_COUNT, ticks: CONFETTI_TICKS, spread: 70, origin: { y: 0.6 } });
    done?.then?.(() => canvas.remove());
  }
  window.addEventListener('resize', place);
  window.addEventListener('orientationchange', place);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
  if (observer) [controls, host, observed].forEach((el) => el && observer.observe(el));
  if (heading && dialog.offsetHeight > rowEl.clientHeight - 16) heading.remove();
  return {
    rowEl,
    detach() {
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
      observer?.disconnect();
      fire?.reset();
      canvas?.remove();
      if (addedRelative) host.classList.remove('relative');
    },
  };
}

// disposeClear({ lockEl, gapEl, dialogHandle }): 結果ダイアログ・空き枠を片付け、inert と relative を戻す。
export function disposeClear({ lockEl, gapEl, dialogHandle }) {
  dialogHandle?.rowEl.remove();
  dialogHandle?.detach();
  lockEl.inert = false;
  gapEl?.classList.remove(...GAP_FRAME_CLASSES);
}

// showClearSequence({ statusBar, controls, lockEl, host, gapEl, view, restore, label, primary, replay, heading,
// setActiveAnimation }) → { dispose() }
//   lockEl: 間の始まりから inert にする操作画面の外枠（1要素）。host: ダイアログを置く外枠の親（root）。
//   primary: { label, action, id }（action＝つぎへ押下時の処理、id＝data-action）。
//   gapEl: 間のあいだ空き枠にする操作行（省略可）。
//   dispose(): 間のタイマー・ダイアログ・inert を片付ける（冪等）。ダイアログ表示後も setActiveAnimation に
//   登録したままなので、画面の作り直し（renderStep の activeAnimation.cancel()）でも呼ばれる。
export function showClearSequence({
  statusBar,
  controls,
  lockEl,
  host,
  gapEl,
  view,
  restore,
  label,
  primary,
  replay,
  heading,
  setActiveAnimation,
}) {
  let dialogHandle = null;
  let timer = null;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    disposeClear({ lockEl, gapEl, dialogHandle });
  }
  showSuccess(statusBar, { view, restore, confetti: false, ...(label ? { label } : {}) });
  const primaryBtn = createPrimaryButton(primary.label, primary.action, primary.id);
  const replayBtn = createPrimaryButton('もういちど', replay, 'replay');
  const dots = showResultGap({ gapEl });
  lockEl.inert = true;
  timer = setTimeout(() => {
    dots?.remove();
    dialogHandle = showResultDialog({ controls, host, observed: lockEl, primaryBtn, replayBtn, heading });
  }, prefersReducedMotion() ? RESULT_GAP_REDUCED_MS : RESULT_GAP_MS);
  setActiveAnimation({ cancel: dispose });
  return { dispose };
}
