// やり直しの流れ（失敗のゆれ）とステージ開始時の「スタート！」の共通部品（Issue #344・#497）。
// 画面ごとに違う部分（盤面の印・ヒント文・復帰処理）は呼び出し側が引数・呼び出し順で決める。
import { prefersReducedMotion } from './ui-grid.js';
import { play as playSfx } from './sfx.js';

// setRetryButton(btn, mode, { runLabel, emphasis }): 実行ボタンを「ためしなおす」(mode='retry') と
// 通常 (それ以外) で切り替える。data-action は 'retry' / 'run'、色は amber / emerald。
// 強調の強さは画面ごとの引数 emphasis（追加するクラスの配列。retry のときだけ付き、戻すと外れる）。
export function setRetryButton(btn, mode, { runLabel, emphasis = [] }) {
  if (mode === 'retry') {
    btn.dataset.action = 'retry';
    btn.textContent = '↺\nためしなおす';
    btn.classList.remove('bg-emerald-500');
    btn.classList.add('bg-amber-500', ...emphasis);
  } else {
    btn.dataset.action = 'run';
    btn.textContent = runLabel;
    btn.classList.remove('bg-amber-500', ...emphasis);
    btn.classList.add('bg-emerald-500');
  }
}

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

// showStartCue(boardArea): ステージ開始時に「スタート！」を盤面中央へ2秒だけ表示する（Issue #497。1秒→2秒は #544-3A）。
// 盤面の内側に重ねて出す（吹き出し欄の外。docs/ui-rules.md の「start-cue は盤面内表示の例外」）。
// タップは素通し。表示中は boardArea に data-start-cue を立て、消えたら外して 'sk-start-cue-end' を投げる
// （吹き出し js/ui-bird.js がこれを見て、消えるまで表示を待つ）。再開（うごかす・ためしなおす）では呼ばない。
export const START_CUE_MS = 2000;
export function showStartCue(boardArea) {
  boardArea.querySelector(':scope > .sk-start-cue')?.remove();
  playSfx('start');
  const cue = document.createElement('div');
  cue.className = 'sk-start-cue';
  cue.dataset.text = 'スタート！';
  cue.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'スタート！';
  cue.appendChild(label);
  boardArea.appendChild(cue);
  boardArea.dataset.startCue = 'true';
  clearTimeout(boardArea._startCueTimer);
  boardArea._startCueTimer = setTimeout(() => {
    cue.remove();
    delete boardArea.dataset.startCue;
    boardArea.dispatchEvent(new CustomEvent('sk-start-cue-end'));
  }, START_CUE_MS);
}

// createRetryChoice({ canResume, onResume, onRestart }): maxPauses>0 のステージで失敗したときの2ボタン
// （#395 段4）。「とちゅうから」＝止まった地点から（橙・既定）、「さいしょから」＝盤面を最初に戻す
// （スレート・小さめ）。止まった地点が無いとき(canResume=false)は「とちゅうから」をマスク（押せない）。
export function createRetryChoice({ canResume, onResume, onRestart }) {
  const resumeBtn = document.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.dataset.action = 'retry-resume';
  resumeBtn.textContent = '✋ とちゅうから';
  resumeBtn.className =
    'btn-tactile px-1 bg-amber-500 text-white text-base font-bold whitespace-nowrap break-keep disabled:opacity-40 disabled:bg-slate-300';
  resumeBtn.disabled = !canResume;
  resumeBtn.addEventListener('click', () => {
    if (!resumeBtn.disabled) onResume();
  });
  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.dataset.action = 'retry-restart';
  restartBtn.textContent = '↺ さいしょから';
  restartBtn.className =
    'btn-tactile px-1 bg-slate-500 text-white text-sm font-bold whitespace-nowrap break-keep disabled:opacity-40';
  restartBtn.addEventListener('click', onRestart);
  return { resumeBtn, restartBtn };
}
