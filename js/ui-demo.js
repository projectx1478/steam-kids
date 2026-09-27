// 「はじめに」画面のデモ：ロボットが正解の道をたどってゴールへ到達する完成イメージを見せる
// （Issue #97）。本番のplayとは別のstart/goal（レッスンJSONのintro.demo）を使い、答えの
// ネタバレを避ける。reduced-motion時はゴール到達後の最終状態を静止表示するだけにする
// （旧仕様のアイコン列デモはIssue #91・実装はここで置き換え）。
import { renderGrid, prefersReducedMotion } from './ui-grid.js';
import { playAnimation } from './ui-step.js';

const DEMO_CELL = 40;
const CYCLES = 2;
const CYCLE_PAUSE_MS = 900;

// renderGoalDemo(container, demo) -> 追加したdemo-widget要素。
// demo: { grid, start, goal, walls, items?, commands }（lessons/*.jsonのintro.demo）。
export function renderGoalDemo(container, demo) {
  const spec = { grid: demo.grid, start: demo.start, goal: demo.goal, walls: demo.walls ?? [], items: demo.items ?? [] };
  const wrap = document.createElement('div');
  wrap.className = 'demo-widget flex flex-col items-center gap-2 my-2';
  wrap.dataset.demo = 'goal';

  const boardWrap = document.createElement('div');
  wrap.appendChild(boardWrap);

  let view = null;
  function draw(playerPos) {
    boardWrap.innerHTML = '';
    const { el, view: v } = renderGrid({ ...spec, playerPos, labels: [], cellSize: DEMO_CELL });
    boardWrap.appendChild(el);
    view = v;
  }

  if (prefersReducedMotion()) {
    draw(demo.goal);
    container.appendChild(wrap);
    return wrap;
  }

  let timer = null;
  function play() {
    if (timer) clearTimeout(timer);
    draw(demo.start);
    let cycles = 0;
    const runOnce = () => {
      playAnimation(demo.commands, spec, view, {
        onTick: () => {},
        onDone: () => {
          view.confetti?.();
          cycles += 1;
          if (cycles >= CYCLES) return;
          timer = setTimeout(() => {
            draw(demo.start);
            runOnce();
          }, CYCLE_PAUSE_MS);
        },
      });
    };
    runOnce();
  }

  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.dataset.action = 'demo-replay';
  replayBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-100 text-xs transition-transform duration-100 active:scale-95';
  replayBtn.textContent = '▶ もういちど みる';
  replayBtn.addEventListener('click', play);
  wrap.appendChild(replayBtn);

  play();
  container.appendChild(wrap);
  return wrap;
}
