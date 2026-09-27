// 正解・不正解の反応をpredict/playで統一する（Issue #91）。
// 正解: showSuccess（星＋「やったね！」＋clear音＋振動＋紙ふぶき）。
// 不正解: showHint（「おしい！」＋否定語を使わないヒント文。data-hintを持ちdata-resultは付けない）。
import { play as playSfx } from './sfx.js';
import { vibrate } from './ui-commands.js';

// showSuccess(el, { view }): elに.clear-reaction・data-result="clear"を描く。
// view.confetti()があれば盤面の紙ふぶきも再生する（play・predict双方のviewが持つ）。
export function showSuccess(el, { view } = {}) {
  el.innerHTML = '';
  el.dataset.result = 'clear';
  const wrap = document.createElement('div');
  wrap.className = 'clear-reaction flex flex-col items-center gap-1';
  wrap.innerHTML = `<svg viewBox="0 0 64 64" class="w-12 h-12" aria-hidden="true">
    <polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24"
      fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
  </svg><p class="text-lg font-bold text-amber-600">やったね！</p>`;
  el.appendChild(wrap);
  playSfx('clear');
  vibrate();
  view?.confetti?.();
}

// showHint(el, { kind, message }): kindはdata-hintに入る種別（wall/items/goal/predict等）。
// data-resultは付けない（cmd01-clear-reactionの「未達成時はdata-resultが付かない」を維持）。
export function showHint(el, { kind, message }) {
  el.innerHTML = '';
  const panel = document.createElement('div');
  panel.dataset.hint = kind;
  panel.className = 'hint-panel flex flex-col items-center gap-1';
  const heading = document.createElement('p');
  heading.className = 'text-lg font-bold text-slate-700';
  heading.textContent = 'おしい！';
  panel.appendChild(heading);
  const msg = document.createElement('p');
  msg.className = 'text-sm text-slate-600';
  msg.textContent = message;
  panel.appendChild(msg);
  el.appendChild(panel);
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
