// 「はじめに」画面のデモ：ロボットが正解の道をたどってゴールへ到達する完成イメージを見せる
// （Issue #97）。本番のplayとは別のstart/goal（レッスンJSONのintro.demo）を使い、答えの
// ネタバレを避ける。自動再生は1回だけ（Issue #104。以前はreduced-motion判定の手前で誤って
// 2回再生していた）。「▶ もういちど みる」でのみ繰り返せる。reduced-motion時も
// playAnimation（1手600msのコマ送り）をそのまま使う。moveToが自らtransitionを外して瞬間移動する
// ため、静止画に差し替える必要はない（旧仕様はここでゴール静止画へ分岐しており、PCなど
// reduced-motion環境でデモが動かない不具合の原因だった）。
// レッスンで新しく出てくる要素へ焦点を当てるため、demoは以下を任意で持てる（Issue #104）：
//   showCommands: 命令チップ列を盤面の上に表示し、実行中のチップを光らせる
//   fixFrom: 先にこの誤った命令列を実行して失敗させ、一呼吸おいてから正しいcommandsへ
//            差し替えて再実行する（「なおす」のデモ）
import { renderGrid, prefersReducedMotion } from './ui-grid.js';
import { renderCommandQueue } from './ui-commands.js';
import { playAnimation, setActiveAnimation } from './ui-step.js';

const DEMO_CELL = 40;
const FIX_PAUSE_MS = 900;

function toChip(entry) {
  return typeof entry === 'string' ? { dir: entry, times: 1 } : entry;
}

// renderGoalDemo(container, demo) -> 追加したdemo-widget要素。
// demo: { grid, start, goal, walls, items?, commands, showCommands?, fixFrom? }（lessons/*.jsonのintro.demo）。
export function renderGoalDemo(container, demo) {
  const spec = { grid: demo.grid, start: demo.start, goal: demo.goal, walls: demo.walls ?? [], items: demo.items ?? [] };
  const wrap = document.createElement('div');
  wrap.className = 'demo-widget flex flex-col items-center gap-2 my-2';
  wrap.dataset.demo = 'goal';

  let queueEl = null;
  if (demo.showCommands || demo.fixFrom) {
    queueEl = document.createElement('ul');
    queueEl.className = 'command-queue flex flex-nowrap items-center gap-1 justify-center overflow-x-auto max-w-full py-1';
    wrap.appendChild(queueEl);
  }

  const boardOuter = document.createElement('div');
  boardOuter.className = 'relative';
  wrap.appendChild(boardOuter);
  const boardWrap = document.createElement('div');
  boardOuter.appendChild(boardWrap);

  let remainingEl = null;
  if (spec.items.length > 0) {
    const badge = document.createElement('div');
    badge.className =
      'absolute top-1 left-1 z-10 inline-flex items-center gap-1 bg-white/90 rounded-full px-2 py-0.5 text-xs font-bold text-slate-700 shadow';
    badge.innerHTML = `<span data-remaining>${spec.items.length}</span>`;
    boardOuter.appendChild(badge);
    remainingEl = badge.querySelector('[data-remaining]');
  }

  let view = null;
  function draw(playerPos) {
    boardWrap.innerHTML = '';
    const { el, view: v } = renderGrid({ ...spec, playerPos, labels: [], cellSize: DEMO_CELL });
    boardWrap.appendChild(el);
    view = v;
    if (remainingEl) remainingEl.textContent = String(spec.items.length);
  }

  function setQueue(commands, activeIndex) {
    if (!queueEl) return;
    renderCommandQueue(queueEl, { commands: commands.map(toChip), activeIndex, removable: false });
  }

  let subAnim = null;
  let pendingTimer = null;

  function runPhase(commands, onDone) {
    setQueue(commands, -1);
    subAnim = playAnimation(
      commands,
      spec,
      view,
      {
        onTick: (i) => setQueue(commands, i),
        onPickup: () => {
          if (remainingEl) remainingEl.textContent = String(Number(remainingEl.textContent) - 1);
        },
        onDone,
      },
      { lockHeader: false }
    );
  }

  function playOnce() {
    draw(demo.start);
    if (demo.fixFrom) {
      runPhase(demo.fixFrom, () => {
        view.shrug();
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          draw(demo.start);
          runPhase(demo.commands, () => view.confetti?.());
        }, FIX_PAUSE_MS);
      });
    } else {
      runPhase(demo.commands, () => view.confetti?.());
    }
  }

  // ステップ離脱時（js/ui-step.jsのrenderStep冒頭）にまとめて止める窓口（Issue #104）。
  setActiveAnimation({
    cancel() {
      subAnim?.cancel();
      subAnim = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    },
  });

  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.dataset.action = 'demo-replay';
  replayBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-100 text-xs transition-transform duration-100 active:scale-95';
  replayBtn.textContent = '▶ もういちど みる';
  replayBtn.addEventListener('click', () => {
    subAnim?.cancel();
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    playOnce();
  });
  wrap.appendChild(replayBtn);

  playOnce();
  container.appendChild(wrap);
  return wrap;
}
