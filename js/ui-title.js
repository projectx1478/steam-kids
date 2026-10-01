// タイトル画面：起動時（`?lesson=`・`?view=map`のどちらも無い時のみ）に表示する（Issue #107）。
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';

const FADE_MS = 300;

// renderTitle(stage, { canContinue, onNew, onContinue }): 「はじめから」「つづきから」押下で（reduced-motion時を除き）
// 300msフェードアウトしてから対応するコールバックを呼ぶ。つづきからはデータのあるスロットが無ければdisabled（Issue #218）。
export function renderTitle(stage, { canContinue, onNew, onContinue }) {
  stage.innerHTML = '';
  stage.dataset.screen = 'title';

  const wrap = document.createElement('div');
  wrap.className =
    'flex flex-col items-center justify-center gap-6 flex-1 wood-panel rounded-2xl py-8';

  const heading = document.createElement('h1');
  heading.className = 'text-4xl font-bold text-sky-700 tracking-wide text-child-title';
  heading.textContent = 'STEAM KIDS';
  wrap.appendChild(heading);

  const robot = document.createElement('div');
  robot.className = `w-32 h-32 ${prefersReducedMotion() ? '' : 'float-slow'}`;
  robot.innerHTML = shapeSvg('player');
  wrap.appendChild(robot);

  const buttons = [];
  const addButton = (action, label, className, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = action;
    btn.className = `btn-tactile text-xl px-8 py-3 ${className}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      buttons.forEach((b) => {
        b.disabled = true;
      });
      vibrate();
      if (prefersReducedMotion()) {
        onClick();
        return;
      }
      wrap.style.transition = `opacity ${FADE_MS}ms ease`;
      wrap.style.opacity = '0';
      setTimeout(onClick, FADE_MS);
    });
    buttons.push(btn);
    wrap.appendChild(btn);
    return btn;
  };

  addButton('title-new', 'はじめから', 'bg-orange-500 text-white', onNew);
  const continueBtn = addButton('title-continue', 'つづきから', 'bg-sky-500 text-white', onContinue);
  if (!canContinue) continueBtn.disabled = true;

  stage.appendChild(wrap);
}
