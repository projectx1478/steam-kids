// 正解・不正解の反応をpredict/playで統一する（Issue #91）。盤面の上に重ねず、操作画面上部の
// 問い文スロットへトーストとして数秒だけ表示し、その後は問い文へ自動で戻る（Issue #97）。
// 正解: showSuccess（大きな星＋「やったね！」＋fanfare音＋振動＋紙ふぶき＋ロボットのジャンプ。
// 単発クリアの実機反応が薄いという指摘を受け、Issue #91時点より拡大した。Issue #104）。
// 不正解: showHint（「おしい！」＋否定語を使わないヒント文。data-hintを持ちdata-resultは付けない）。
import { play as playSfx } from './sfx.js';
import { vibrate } from './ui-commands.js';
import { showToast } from './ui-toast.js';
import { shapeSvg } from './ui-grid.js';

const STAGE_CONFETTI_COUNT = 60;
const STAGE_CONFETTI_MS = 2000;

// showSuccess(slotEl, { view, restore }): slotElに.clear-reaction・data-result="clear"をトースト
// 表示する。view.confetti()/celebrateDance()があれば盤面側の演出も再生する（play・predict双方の
// viewが持つ）。restoreはトーストが消えた時に呼ばれる（呼び出し側が問い文へ戻す）。
export function showSuccess(slotEl, { view, restore } = {}) {
  playSfx('fanfare');
  vibrate();
  view?.confetti?.({ count: STAGE_CONFETTI_COUNT, duration: STAGE_CONFETTI_MS });
  view?.celebrateDance?.();
  view?.setMood?.('happy');
  showToast(slotEl, {
    render: (el) => {
      el.dataset.result = 'clear';
      const wrap = document.createElement('p');
      wrap.className =
        'clear-reaction success-pop flex items-center justify-center gap-1 text-2xl font-bold text-amber-600';
      wrap.innerHTML = `<svg viewBox="0 0 64 64" class="w-12 h-12 shrink-0" aria-hidden="true">
        <polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24"
          fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
      </svg>やったね！`;
      el.appendChild(wrap);
    },
    restore: (el) => {
      delete el.dataset.result;
      restore?.(el);
    },
  });
}

// showHint(slotEl, { kind, message, restore }): kindはdata-hintに入る種別（wall/items/goal/predict等）。
// data-resultは付けない（cmd01-clear-reactionの「未達成時はdata-resultが付かない」を維持）。
// 見出しとメッセージを別行にする（1行20字以内のUI規則を保つため。Issue #91のまま）。
// 見出しの左に首をかしげたロボット＋「？」を添え、文字だけでなく非言語でも
// 「もう一度」と伝わるようにする（失敗を責めない表現。Issue #106）。
export function showHint(slotEl, { kind, message, restore }) {
  showToast(slotEl, {
    render: (el) => {
      const panel = document.createElement('div');
      panel.dataset.hint = kind;
      panel.className = 'hint-panel flex flex-col items-center';
      const headingRow = document.createElement('div');
      headingRow.className = 'flex items-center gap-1';
      const icon = document.createElement('div');
      icon.className = 'hint-icon relative w-8 h-8 shrink-0';
      icon.innerHTML = `<div class="w-full h-full" style="transform: rotate(-14deg)">${shapeSvg('player')}</div>
        <span class="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[10px] font-bold" aria-hidden="true">？</span>`;
      headingRow.appendChild(icon);
      const heading = document.createElement('p');
      heading.className = 'text-lg font-bold text-slate-700';
      heading.textContent = 'おしい！';
      headingRow.appendChild(heading);
      panel.appendChild(headingRow);
      const msg = document.createElement('p');
      msg.className = 'text-sm text-slate-600';
      msg.textContent = message;
      panel.appendChild(msg);
      el.appendChild(panel);
    },
    restore,
  });
}

// diagnose(result, commands, spec) -> { reason: 'wall', cmdIndex, cell }
//                                    | { reason: 'items', remainingItems }
//                                    | { reason: 'goal', cell, goal }
// playが未達成の原因を1つ選ぶ純粋関数。優先順位は壁・盤外にぶつかった＞item未回収＞未到達。
export function diagnose(result, commands, spec) {
  for (let i = 0; i < result.stepOwner.length; i += 1) {
    const from = result.path[i];
    const to = result.path[i + 1];
    if (from.x === to.x && from.y === to.y) {
      return { reason: 'wall', cmdIndex: result.stepOwner[i], cell: from };
    }
  }
  if (result.remainingItems.length > 0) {
    return { reason: 'items', remainingItems: result.remainingItems };
  }
  return { reason: 'goal', cell: result.path[result.path.length - 1], goal: spec.goal };
}
