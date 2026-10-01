// 導入ストーリー（Issue #218）。2〜3枚・1枚1〜2文。絵は既存のロボット・どんぐりを流用する。
import { shapeSvg } from './ui-grid.js';
import { vibrate } from './ui-commands.js';

function storyPages(name) {
  return [
    { text: 'この ロボットは、きみの めいれいで うごくよ。', shapes: ['player'] },
    { text: 'どんぐりを ひろったり、ゴールを めざしたり しよう。', shapes: ['player', 'item'] },
    { text: `${name}さん、いっしょに やってみよう！`, shapes: ['player'] },
  ];
}

// name: 表示名（プレイヤーN可）。onDone(): 最後の「つぎへ」または「スキップ」。
export function renderStory(stage, name, onDone) {
  const pages = storyPages(name);
  let index = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };

  function draw() {
    stage.innerHTML = '';
    stage.dataset.screen = 'story';
    const page = pages[index];

    const wrap = document.createElement('div');
    wrap.className = 'relative flex flex-col items-center justify-center gap-6 flex-1 wood-panel rounded-2xl py-8 px-4';
    wrap.dataset.storyPage = String(index + 1);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.action = 'story-skip';
    skip.className = 'absolute top-2 right-2 min-h-[48px] px-4 rounded-lg bg-white/80 text-slate-600 text-sm';
    skip.textContent = 'スキップ';
    skip.addEventListener('click', finish);
    wrap.appendChild(skip);

    const pics = document.createElement('div');
    pics.className = 'flex gap-4';
    for (const shape of page.shapes) {
      const pic = document.createElement('div');
      pic.className = 'w-28 h-28';
      pic.innerHTML = shapeSvg(shape);
      pics.appendChild(pic);
    }
    wrap.appendChild(pics);

    const text = document.createElement('p');
    text.className = 'story-text text-2xl font-bold text-center text-child-title';
    text.textContent = page.text;
    wrap.appendChild(text);

    const next = document.createElement('button');
    next.type = 'button';
    next.dataset.action = 'story-next';
    next.className = 'btn-tactile bg-orange-500 text-white text-xl px-8 py-3';
    next.textContent = 'つぎへ';
    next.addEventListener('click', () => {
      vibrate();
      if (index < pages.length - 1) {
        index += 1;
        draw();
      } else {
        finish();
      }
    });
    wrap.appendChild(next);

    stage.appendChild(wrap);
  }

  draw();
}
