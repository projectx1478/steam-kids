// タイトル画面：起動時（`?lesson=`・`?view=map`のどちらも無い時のみ）に表示する（Issue #107）。
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';

const FADE_MS = 300;

// renderTitle(stage, { canContinue, onNew, onContinue }): 「はじめから」「つづきから」押下で（reduced-motion時を除き）
// 300msフェードアウトしてから対応するコールバックを呼ぶ。つづきからはデータのあるスロットが無ければdisabled（Issue #218）。
// hintが真のときだけ、ロボットの横に「あたらしい ステージが あいたよ」の吹き出しを足す（Issue #282）。
export function renderTitle(stage, { canContinue, onNew, onContinue, hint = false }) {
  stage.innerHTML = '';
  stage.dataset.screen = 'title';

  const wrap = document.createElement('div');
  wrap.className =
    'title-wrap flex flex-col items-center justify-center gap-6 flex-1 wood-panel rounded-2xl py-8';

  const heading = document.createElement('h1');
  heading.className = 'text-4xl font-bold text-sky-700 tracking-wide text-child-title';
  heading.textContent = 'STEAM KIDS';
  wrap.appendChild(heading);

  const robot = document.createElement('div');
  robot.className = `title-robot w-32 h-32 ${prefersReducedMotion() ? '' : 'float-slow'}`;
  robot.innerHTML = shapeSvg('player');
  if (hint) {
    // 押せない飾りの吹き出し（Issue #282）。ロボットの右に絶対配置し、高さを増やさない。
    const robotWrap = document.createElement('div');
    robotWrap.className = 'title-robotwrap';
    robotWrap.appendChild(robot);
    const bubble = document.createElement('div');
    bubble.className = 'title-bubble';
    bubble.dataset.role = 'bubble';
    bubble.setAttribute('aria-hidden', 'true');
    bubble.textContent = 'あたらしい ステージが あいたよ';
    robotWrap.appendChild(bubble);
    wrap.appendChild(robotWrap);
  } else {
    wrap.appendChild(robot);
  }

  const buttons = [];
  let actions;
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
    actions.appendChild(btn);
    return btn;
  };

  actions = document.createElement('div');
  actions.className = 'title-actions';
  wrap.appendChild(actions);
  addButton('title-new', 'はじめから', 'bg-orange-500 text-white', onNew);
  const continueBtn = addButton('title-continue', 'つづきから', 'bg-sky-500 text-white', onContinue);
  if (!canContinue) continueBtn.disabled = true;

  stage.appendChild(wrap);
}
