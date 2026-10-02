// 「はじめに」画面のデモ：ロボットが正解の道をたどってゴールへ到達する完成イメージを見せる
// （Issue #97）。本番のplayとは別のstart/goal（レッスンJSONのintro.demo）を使い、答えの
// ネタバレを避ける。自動再生は初回含め3回まで（Issue #241。reduced-motion時は1回）。
// 以降は「▶ もういちど みる」で繰り返せる（#104では以前誤って2回再生していた）。reduced-motion時も
// playAnimation（1手600msのコマ送り）をそのまま使う。moveToが自らtransitionを外して瞬間移動する
// ため、静止画に差し替える必要はない（旧仕様はここでゴール静止画へ分岐しており、PCなど
// reduced-motion環境でデモが動かない不具合の原因だった）。
// レッスンで新しく出てくる要素へ焦点を当てるため、demoは以下を任意で持てる（Issue #104）：
//   showCommands: 命令チップ列を盤面の上に表示し、実行中のチップを光らせる
//   fixFrom: 先にこの誤った命令列を実行して失敗させ、一呼吸おいてから正しいcommandsへ
//            差し替えて再実行する（「なおす」のデモ）
// 初回自動再生の前だけ1秒の「よーい…」を挟む（Issue #107）。「▶ もういちど みる」は待たない。
import { boardSpec } from './engine-grid.js';
import { renderGrid, prefersReducedMotion } from './ui-grid.js';
import { renderCommandQueue } from './ui-commands.js';
import { playAnimation, setActiveAnimation } from './ui-step.js';
import { play as playSfx } from './sfx.js';

const DEMO_CELL = 40;
const FIX_PAUSE_MS = 900;
// READY_MS: 初回自動再生のみに置く「よーい…」の間（Issue #107）。「▶ もういちど みる」は対象外。
const READY_MS = 1000;
// 自動ループ（Issue #241）：1周の終わりからLOOP_GAP_MS空け、初回含めLOOP_MAX回で止まる。
// reduced-motion時はループしない。「▶ もういちど みる」は単発再生でループを再開しない。
const LOOP_GAP_MS = 3000;
const LOOP_MAX = 3;

function toChip(entry) {
  return typeof entry === 'string' ? { dir: entry, times: 1 } : entry;
}

// renderGoalDemo(container, demo) -> 追加したdemo-widget要素。
// demo: { grid, start, goal, walls, items?, commands, showCommands?, fixFrom? }（lessons/*.jsonのintro.demo）。
export function renderGoalDemo(container, demo) {
  const spec = boardSpec(demo);
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

  // readyBadge: 初回自動再生前の1秒だけ盤面中央に出す「よーい…」（Issue #107）。
  const readyBadge = document.createElement('div');
  readyBadge.dataset.demoReady = '';
  readyBadge.className =
    'absolute inset-0 z-20 flex items-center justify-center pointer-events-none';
  readyBadge.style.display = 'none';
  readyBadge.innerHTML =
    `<span class="${prefersReducedMotion() ? '' : 'success-pop'} bg-white/90 rounded-full px-4 py-2 text-lg font-bold text-slate-700 shadow">よーい…</span>`;
  boardOuter.appendChild(readyBadge);

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

  function setQueue(commands, activeIndex, activeInner = -1, activeRound = -1) {
    if (!queueEl) return;
    renderCommandQueue(queueEl, { commands: commands.map(toChip), activeIndex, activeInner, activeRound, removable: false });
  }

  let subAnim = null;
  let pendingTimer = null;
  let readyTimer = null;
  let loopTimer = null;
  let playCount = 0;
  // 直前に表示した周回。周が変わった時だけstack音を鳴らす（2周目以降のみ。Issue #167）。
  let lastRound = -1;

  function runPhase(commands, onDone) {
    lastRound = -1;
    setQueue(commands, -1);
    subAnim = playAnimation(
      commands,
      spec,
      view,
      {
        onTick: (i, _to, inner, round) => {
          if (round !== lastRound) {
            if (round >= 1) playSfx('stack', { count: round + 1 });
            lastRound = round;
          }
          setQueue(commands, i, inner, round);
        },
        onPickup: () => {
          if (remainingEl) remainingEl.textContent = String(Number(remainingEl.textContent) - 1);
        },
        onDone,
      },
      { lockHeader: false }
    );
  }

  // finish(loop): 1サイクルの完走時。loop=trueかつ通常モーション時のみ、LOOP_GAP_MS後に次の周を
  // 予約する（初回含めLOOP_MAX回で止まる。Issue #241）。
  function finish(loop) {
    view.confetti?.();
    if (!loop || prefersReducedMotion() || playCount >= LOOP_MAX) return;
    loopTimer = setTimeout(() => {
      loopTimer = null;
      playCount += 1;
      playNow(true);
    }, LOOP_GAP_MS);
  }

  function playNow(loop = false) {
    draw(demo.start);
    if (demo.fixFrom) {
      runPhase(demo.fixFrom, () => {
        view.shrug();
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          draw(demo.start);
          runPhase(demo.commands, () => finish(loop));
        }, FIX_PAUSE_MS);
      });
    } else {
      runPhase(demo.commands, () => finish(loop));
    }
  }

  // playFirst(): 初回自動再生専用。1秒の「よーい…」の後にstart音を鳴らしてplayNowへ入る
  // （Issue #107）。「▶ もういちど みる」はplayNowを直接呼び、待機を挟まない。
  function playFirst() {
    draw(demo.start);
    readyBadge.style.display = '';
    readyTimer = setTimeout(() => {
      readyTimer = null;
      readyBadge.style.display = 'none';
      playSfx('start');
      playCount = 1;
      playNow(true);
    }, READY_MS);
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
      if (loopTimer) {
        clearTimeout(loopTimer);
        loopTimer = null;
      }
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
        readyBadge.style.display = 'none';
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
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    playNow();
  });
  wrap.appendChild(replayBtn);

  playFirst();
  container.appendChild(wrap);
  return wrap;
}
