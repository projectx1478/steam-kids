// 大項目の紹介画面（Issue #644）。大項目選択で intro のある大項目を選んだ直後、単元マップの前に出す。
// 上に大項目名、中央におてほん（renderGoalDemo）、その下に短文。下端バーは左「もどる」・右「はじめる」。
import { renderGoalDemo } from './ui-demo.js';
import { cancelActiveAnimation } from './ui-step.js';

// renderTrackIntro(stage, track, { onStart, onBack })
export function renderTrackIntro(stage, track, { onStart, onBack } = {}) {
  stage.innerHTML = '';
  stage.dataset.screen = 'track-intro';

  const title = document.createElement('h2');
  title.className = 'track-q';
  title.textContent = track.title;
  stage.appendChild(title);

  const body = document.createElement('div');
  body.className = 'flex flex-col items-center justify-center flex-1 min-h-0';
  if (track.intro?.demo) renderGoalDemo(body, track.intro.demo);
  const text = track.intro?.text;
  if (typeof text === 'string' && text !== '') {
    const p = document.createElement('p');
    p.className = 'intro-question text-2xl text-center py-1';
    p.dataset.role = 'track-intro-text';
    p.textContent = text;
    body.appendChild(p);
  }
  stage.appendChild(body);

  const bar = document.createElement('div');
  bar.className = 'sk-bottom-bar';
  bar.dataset.role = 'bottom-bar';
  bar.style.justifyContent = 'space-between';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'track-back sk-bar-sub';
  back.dataset.action = 'track-intro-back';
  back.textContent = 'もどる';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'primary-btn btn-tactile bg-sky-500 text-white text-lg';
  start.style.minHeight = '64px';
  start.dataset.action = 'track-intro-start';
  start.textContent = 'はじめる';

  // 押した瞬間に全ボタンを無効にし（連打は最初の1回のみ）、再生中のおてほんを止めてから遷移する。
  const buttons = [back, start];
  const leave = (go) => () => {
    buttons.forEach((b) => { b.disabled = true; });
    cancelActiveAnimation();
    go?.();
  };
  back.addEventListener('click', leave(onBack));
  start.addEventListener('click', leave(onStart));
  bar.append(back, start);
  stage.appendChild(bar);
}
