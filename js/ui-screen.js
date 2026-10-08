// 操作画面の枠の共通部品（Issue #343）。問い文の行・盤面・操作パネル（ボタン行入り）の骨格を作る。
// 縦積み／横向きの左右分割／背の低い横向きの規則は tailwind.src.css の sk-screen-* にある。
// クリア演出（js/ui-clear.js）へは呼び出し側が frame・panel・questionEl・actions を渡す。
import { S } from './state.js';
import { renderInto } from './text-render.js';

// createOpScreen({ root, question }): frame を root に追加して返す。
// question は問い文の既定テキスト（renderQuestion(text) の text 省略時に使う）。
export function createOpScreen({ root, question }) {
  const frame = document.createElement('div');
  frame.className = 'sk-screen-frame flex flex-col flex-1 min-h-0 gap-2';
  frame.dataset.skScreen = 'frame';
  root.appendChild(frame);

  // 問い文スロット（1行）。実行結果もここへ数秒だけトースト表示する。
  const questionEl = document.createElement('div');
  questionEl.className = 'sk-screen-question flex flex-col items-center gap-0.5 shrink-0 text-center';
  questionEl.dataset.skScreen = 'question';
  frame.appendChild(questionEl);

  const boardArea = document.createElement('div');
  boardArea.className = 'sk-screen-board relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  boardArea.dataset.skScreen = 'board';
  frame.appendChild(boardArea);

  const panel = document.createElement('div');
  panel.className = 'sk-screen-panel flex flex-col gap-2 shrink-0';
  panel.dataset.skScreen = 'panel';
  frame.appendChild(panel);

  // ボタン行。修飾クラスは actions.classList.add で足す。
  const actions = document.createElement('div');
  actions.className = 'sk-screen-actions flex gap-2 justify-center';
  actions.dataset.skScreen = 'actions';
  panel.appendChild(actions);

  // 問い文の行を描き直す（行の中身を空にして問い文を入れる）。追加の行は呼び出し側が questionEl に足す。
  function renderQuestion(text) {
    questionEl.innerHTML = '';
    const q = document.createElement('p');
    q.className = 'text-sm font-bold text-slate-700';
    renderInto(q, text ?? question, S.readingLevel, S.furigana);
    questionEl.appendChild(q);
  }

  return { frame, questionEl, boardArea, panel, actions, renderQuestion };
}
