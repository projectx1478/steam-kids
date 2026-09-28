// タイトル画面：起動時（`?lesson=`・`?view=map`のどちらも無い時のみ）に表示する（Issue #107）。
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';

const FADE_MS = 300;

// renderTitle(stage, onStart): スタート押下で（reduced-motion時を除き）300msフェードアウトしてからonStart()を呼ぶ。
export function renderTitle(stage, onStart) {
  stage.innerHTML = '';
  stage.dataset.screen = 'title';

  const wrap = document.createElement('div');
  wrap.className =
    'flex flex-col items-center justify-center gap-6 flex-1 bg-gradient-to-b from-sky-100 to-white rounded-2xl py-8';

  const heading = document.createElement('h1');
  heading.className = 'text-4xl font-bold text-sky-700 tracking-wide';
  heading.textContent = 'STEAM KIDS';
  wrap.appendChild(heading);

  const robot = document.createElement('div');
  robot.className = `w-32 h-32 ${prefersReducedMotion() ? '' : 'float-slow'}`;
  robot.innerHTML = shapeSvg('player');
  wrap.appendChild(robot);

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.dataset.action = 'title-start';
  startBtn.className = 'btn-tactile bg-orange-500 text-white text-xl px-8 py-3';
  startBtn.textContent = 'スタート';
  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;
    startBtn.disabled = true;
    vibrate();
    if (prefersReducedMotion()) {
      onStart();
      return;
    }
    wrap.style.transition = `opacity ${FADE_MS}ms ease`;
    wrap.style.opacity = '0';
    setTimeout(onStart, FADE_MS);
  });
  wrap.appendChild(startBtn);

  stage.appendChild(wrap);
}
