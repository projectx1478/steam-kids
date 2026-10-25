// 操作画面の枠の共通部品（Issue #343）。問い文の行・盤面・操作パネル（ボタン行入り）の骨格を作る。
// 縦積み／横向きの左右分割／背の低い横向きの規則は tailwind.src.css の sk-screen-* にある。
// 問い文は小鳥の吹き出しで出す（Issue #497 段B）。問い文の行（questionEl）は補助行（鍵トレイ以外の残数・塗りの見本）用で、空なら非表示。
// クリア演出（js/ui-clear.js）へは呼び出し側が frame・panel・questionEl・actions を渡す。
import { S } from './state.js';
import { renderInto } from './text-render.js';
import { createBird } from './ui-bird.js';

// createOpScreen({ root, question }): frame を root に追加して返す。
// question は問い文の既定テキスト（renderQuestion(text) の text 省略時に使う）。
// stepKey は「同じステージの再挑戦では問い文を自動表示しない」ための識別子（レッスンID＋ステージID。#497-5B）。
const AUTO_SHOWN = new Set();

// gear（省略可）: 渡したときだけ欄の右端に⚙（せってい。data-action="menu"）を置き、押すと gear(ボタン) を呼ぶ（Issue #574 段C）。
export function createOpScreen({ root, question, stepKey, gear }) {
  const frame = document.createElement('div');
  frame.className = 'sk-screen-frame flex flex-col flex-1 min-h-0 gap-2';
  frame.dataset.skScreen = 'frame';
  root.appendChild(frame);

  // 補助行（残数・塗りの見本。中身が無ければ非表示）。問い文本体は吹き出し。
  const questionEl = document.createElement('div');
  questionEl.className = 'sk-screen-question flex flex-col items-center gap-0.5 shrink-0 text-center';
  questionEl.dataset.skScreen = 'question';
  frame.appendChild(questionEl);

  // 小鳥の欄（高さ64px固定。盤面の上・盤面と同じ列。Issue #544）。顔と吹き出しをここに並べる。
  const birdLane = document.createElement('div');
  birdLane.className = 'sk-screen-bird shrink-0';
  birdLane.dataset.skScreen = 'bird-lane';
  frame.appendChild(birdLane);

  const boardArea = document.createElement('div');
  boardArea.className = 'sk-screen-board relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  boardArea.dataset.skScreen = 'board';
  frame.appendChild(boardArea);

  // 小鳥の顔アイコン＋吹き出しの器（Issue #468）。盤面の上の欄に置く（Issue #544）。
  const bird = createBird(birdLane, boardArea);

  // 欄右端の⚙（顔の右、間16px。実行中・ロック中も押せる＝呼び元の一括無効化の対象外）。
  let gearBtn = null;
  if (gear) {
    gearBtn = document.createElement('button');
    gearBtn.type = 'button';
    gearBtn.className = 'sk-bird-gear btn-tactile';
    gearBtn.dataset.action = 'menu';
    gearBtn.setAttribute('aria-label', 'せってい');
    gearBtn.setAttribute('aria-haspopup', 'true');
    gearBtn.setAttribute('aria-expanded', 'false');
    gearBtn.innerHTML =
      '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z" /></svg><span class="text-xs whitespace-nowrap">せってい</span>';
    gearBtn.addEventListener('click', () => gear(gearBtn));
    birdLane.dataset.gear = 'true';
    birdLane.appendChild(gearBtn);
  }

  const panel = document.createElement('div');
  panel.className = 'sk-screen-panel flex flex-col gap-2 shrink-0';
  panel.dataset.skScreen = 'panel';
  frame.appendChild(panel);

  // ボタン行。修飾クラスは actions.classList.add で足す。
  const actions = document.createElement('div');
  actions.className = 'sk-screen-actions flex gap-2 justify-center';
  actions.dataset.skScreen = 'actions';
  panel.appendChild(actions);

  // 問い文を覚え、補助行を空にする（追加の中身は呼び出し側が questionEl に足す）。吹き出しは出さない（announceQuestion / 顔のタップ）。
  let questionText = question;
  function renderQuestion(text) {
    questionText = text ?? question;
    questionEl.innerHTML = '';
  }

  function showQuestionBubble() {
    if (!questionText) return;
    lastShown = 'question';
    const q = document.createElement('p');
    renderInto(q, questionText, S.readingLevel, S.furigana);
    bird.showBubble(q, { question: 'true' });
  }

  // レッスン（ステージ）開始時に1回だけ問い文の吹き出しを出す。同じステージの再挑戦では出さない（顔のタップで再表示）。
  function announceQuestion() {
    if (stepKey) {
      if (AUTO_SHOWN.has(stepKey)) return;
      AUTO_SHOWN.add(stepKey);
    }
    showQuestionBubble();
  }

  // 顔のタップ用のヒント（Issue #468 段2）。画面側が setHintProvider(() => 文言 or null) で渡す（無ければ問い文のみ）。
  let hintProvider = null;
  let lastShown = null;
  function setHintProvider(fn) {
    hintProvider = fn;
  }

  // 顔のタップ：出ていれば消す。無ければ問い文とヒントを交互に出す（ヒントが無い画面・状況では問い文）。
  // ヒントの吹き出しは data-tap-hint="true"（data-hint は結果のヒントの印なので使わない）。
  bird.iconEl.addEventListener('click', () => {
    if (bird.isBubbleShown()) {
      bird.hideBubble();
      return;
    }
    const hint = lastShown === 'question' && hintProvider ? hintProvider() : null;
    if (hint) {
      lastShown = 'hint';
      bird.showBubble(hint, { tapHint: 'true' });
    } else {
      lastShown = 'question';
      showQuestionBubble();
    }
  });

  return { frame, questionEl, boardArea, panel, actions, renderQuestion, announceQuestion, bird, setHintProvider, gearBtn };
}
