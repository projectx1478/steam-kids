// やり直しの流れ（失敗のゆれ・もういちど後の「スタート！」）の共通部品（Issue #344）。
// 画面ごとに違う部分（盤面の印・ヒント文・復帰処理）は呼び出し側が引数・呼び出し順で決める。
import { prefersReducedMotion } from './ui-grid.js';
import { play as playSfx } from './sfx.js';
import { showToast } from './ui-toast.js';

// shakeBoard(boardArea): 失敗時に盤面をやさしくゆらす（0.5秒）。reduced-motion時はゆらさず、
// 盤面に0.5秒だけ枠を光らせて静止のまま気づけるようにする。
export function shakeBoard(boardArea) {
  if (prefersReducedMotion()) {
    boardArea.classList.add('ring-4', 'ring-amber-400', 'rounded-2xl');
    setTimeout(() => boardArea.classList.remove('ring-4', 'ring-amber-400', 'rounded-2xl'), 500);
  } else {
    boardArea.classList.add('wobble-soft');
    boardArea.addEventListener('animationend', () => boardArea.classList.remove('wobble-soft'), { once: true });
  }
}

// showRestartCue(statusBar, { restore }): 盤面を作り直した直後に「スタート！」を1秒だけ
// 問い文スロットへ表示する。終了時は data-restart を外してから restore(el) で元の表示へ戻す。
export function showRestartCue(statusBar, { restore }) {
  playSfx('start');
  showToast(statusBar, {
    render: (el) => {
      el.dataset.restart = 'true';
      const p = document.createElement('p');
      p.className = 'text-lg font-bold text-sky-700';
      p.textContent = 'スタート！';
      el.appendChild(p);
    },
    durationMs: 1000,
    restore: (el) => {
      delete el.dataset.restart;
      restore(el);
    },
  });
}
