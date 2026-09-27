// playステップ（課題カード→操作画面：命令パレット・実行アニメーション）の描画。
// 操作画面は「盤面・矢印ボタン・並んだ命令・じっこう」のみに絞り、区分バナー・デモ・
// やりかた帯・キャプション・長い指示文は課題カードへ集約する（Issue #93）。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid, shapeSvg, computeCellSize } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, toggleGhostSlot, vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderTaskCard, renderShowTaskButton, taskCardEnabled } from './ui-task-card.js';
import { createIdleNudge } from './ui-guide.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge, setActiveHandHint, markLessonCleared } from './ui-step.js';
import { showSuccess, showHint, diagnose } from './ui-reaction.js';

// diagnose()の原因ごとの文言（20字以内・否定語なし。Issue #91）。
const HINT_MESSAGE = {
  wall: 'この めいれいで かべに ぶつかったよ',
  items: 'どんぐりが まだ のこって いるよ',
  goal: 'ゴールまで あと すこし',
};

export function renderPlay(root, step) {
  const spec = { grid: step.grid, start: step.start, goal: step.goal, walls: step.walls, items: step.items ?? [] };
  const defaultText = spec.items.length > 0 ? 'どんぐりを ぜんぶ とって ゴール' : 'ロボットを ゴールへ うごかそう';
  const isFix = (step.initialCommands ?? []).length > 0;

  // initialCommandsがあれば「ずれた」命令列を最初から積んでおく（なおす系レッスン用）。
  const freshCommands = (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 }));
  // ←で戻って再びこのplayへ進んだ時、命令列の下書き（S.drafts）があれば復元する
  // （確認ダイアログ全廃の代わりの誤タップ対策。以後の追加・削除はこの配列を直接
  // 書き換えるため、参照を共有するだけで自動的に保存される。Issue #95）。
  const commands = S.drafts[step.stepId] ?? freshCommands;
  S.drafts[step.stepId] = commands;

  const local = {
    commands,
    activeIndex: -1,
    running: false,
    view: null,
    started: false,
    nudge: null,
    remaining: spec.items.length,
    // なおす系（initialCommandsあり）で最初の編集（×・追加・ぜんぶけす）をしたか。
    // 無操作促しの対象を決めるのに使う（Issue #89）。下書き復元時は元の並びと違えば編集済み扱い。
    fixOpened: isFix && JSON.stringify(commands) !== JSON.stringify(freshCommands),
  };

  const taskCardEl = document.createElement('div');
  root.appendChild(taskCardEl);

  const opScreen = document.createElement('div');
  opScreen.className = 'play-screen flex flex-col flex-1 min-h-0 gap-2';
  opScreen.style.display = 'none';
  root.appendChild(opScreen);

  const topRow = document.createElement('div');
  topRow.className = 'flex justify-end';
  opScreen.appendChild(topRow);
  renderShowTaskButton(topRow, showTaskCard);

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  opScreen.appendChild(boardArea);

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

  let remainingBadge = null;
  let remainingEl = null;
  if (spec.items.length > 0) {
    remainingBadge = document.createElement('div');
    remainingBadge.className =
      'absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-white/90 rounded-full px-2 py-1 text-xs font-bold text-slate-700 shadow';
    remainingBadge.innerHTML = `<span class="inline-block w-4 h-4">${shapeSvg('item')}</span><span data-remaining></span>`;
    boardArea.appendChild(remainingBadge);
    remainingEl = remainingBadge.querySelector('[data-remaining]');
    remainingEl.textContent = String(local.remaining);
  }

  const resultEl = document.createElement('div');
  resultEl.className =
    'absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-[92%] bg-white/95 rounded-xl shadow px-3 py-2 text-center empty:hidden empty:p-0 empty:shadow-none';
  boardArea.appendChild(resultEl);

  const controls = document.createElement('div');
  controls.className = 'controller-panel flex flex-col gap-2 shrink-0';
  opScreen.appendChild(controls);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'flex gap-2 justify-center';
  controls.appendChild(paletteEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue flex flex-nowrap items-center gap-2 overflow-x-auto min-h-[64px] py-1';
  controls.appendChild(queueEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'flex gap-2 justify-center';
  controls.appendChild(actionsEl);

  const removeLastBtn = document.createElement('button');
  removeLastBtn.type = 'button';
  removeLastBtn.dataset.action = 'remove-last';
  removeLastBtn.textContent = '⌫ ひとつ けす';
  removeLastBtn.className =
    'min-w-[64px] min-h-[64px] px-2 rounded-lg bg-slate-200 text-sm transition-transform duration-100 active:scale-95 disabled:opacity-40';
  actionsEl.appendChild(removeLastBtn);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset.action = 'clear-all';
  clearBtn.textContent = 'ぜんぶ けす';
  clearBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-200 text-sm transition-transform duration-100 active:scale-95 disabled:opacity-40';
  actionsEl.appendChild(clearBtn);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ じっこう';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold disabled:opacity-40';
  actionsEl.appendChild(runBtn);

  // 実行が失敗したらrunBtn自体を橙色の「もういちど」に変える（目線を動かさずに押せる。Issue #91）。
  function setRunButtonMode(mode) {
    if (mode === 'retry') {
      runBtn.dataset.action = 'retry';
      runBtn.textContent = '↺ もういちど';
      runBtn.classList.remove('bg-emerald-500');
      runBtn.classList.add('bg-amber-500');
    } else {
      runBtn.dataset.action = 'run';
      runBtn.textContent = '▶ じっこう';
      runBtn.classList.remove('bg-amber-500');
      runBtn.classList.add('bg-emerald-500');
    }
  }

  // 失敗後にrunBtnが「もういちど」化した状態で、もういちどを押さず直接キューを編集した場合
  // （例: cmd03のなおす操作）でも[data-action="run"]に戻す。次のrunで盤面はどのみち
  // drawBoard(spec.start)からやり直すため、機能上は編集時に静かに戻すだけでよい。
  function revertRunButtonIfRetrying() {
    if (runBtn.dataset.action !== 'retry') return;
    setRunButtonMode('run');
    // ヒントの黄色表示は次に命令を編集したら消える（Issue #91。チップ側はdrawQueue()の
    // 再描画で自然に消えるため、盤面側とヒントパネルのみここで消す）。
    local.view?.clearHints();
    resultEl.innerHTML = '';
  }

  // やりかた帯・無操作促しの対象を決める段階（Issue #89）。0=強調なし（実行中・結果表示中）、
  // 1=けす/おす、3=じっこう。なおす系は編集済みか否かのみで1↔3を決める（②は経由しない）。
  function currentPhase() {
    if (local.running || resultEl.childElementCount > 0) return 0;
    if (isFix) return local.fixOpened ? 3 : 1;
    return local.commands.length === 0 ? 1 : 3;
  }

  // 静的な盤面の再構築。アニメーション中には呼ばない（プレイヤー駒はview経由で差分更新する）。
  // 実行開始・もういちど双方でここを通るため、のこり表示の初期値リセットも兼ねる。
  function drawBoard(playerPos) {
    local.cellSize = computeCellSize({
      cols: spec.grid.cols,
      rows: spec.grid.rows,
      width: boardArea.clientWidth,
      height: boardArea.clientHeight,
    });
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({
      grid: spec.grid,
      walls: spec.walls,
      goal: spec.goal,
      items: spec.items,
      playerPos,
      labels: [],
      cellSize: local.cellSize,
    });
    boardWrap.appendChild(el);
    local.view = view;
    local.remaining = spec.items.length;
    if (remainingEl) remainingEl.textContent = String(local.remaining);
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      removable: true,
      onRemove: (i) => {
        if (local.running) return;
        revertRunButtonIfRetrying();
        if (isFix) local.fixOpened = true;
        local.commands.splice(i, 1);
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
        local.nudge?.poke();
      },
    });
  }

  function updateControls() {
    const atMax = local.commands.length >= step.maxCommands;
    paletteEl.querySelectorAll('button').forEach((b) => {
      b.disabled = atMax || local.running;
    });
    const isRetry = runBtn.dataset.action === 'retry';
    runBtn.disabled = local.running || (!isRetry && local.commands.length === 0);
    clearBtn.disabled = local.commands.length === 0 || local.running;
    removeLastBtn.disabled = local.commands.length === 0 || local.running;
  }

  renderCommandPalette(paletteEl, {
    dropTarget: () => queueEl.getBoundingClientRect(),
    onDragOver: (active) => toggleGhostSlot(queueEl, active),
    onAdd: (dir, { via } = {}) => {
      if (local.running) return;
      revertRunButtonIfRetrying();
      const last = local.commands.at(-1);
      if (step.groupRepeats && last && last.dir === dir) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        if (local.commands.length >= step.maxCommands) return;
        local.commands.push({ dir, times: 1 });
        playSfx(via === 'drag' ? 'snap' : 'tap');
      }
      if (isFix) local.fixOpened = true;
      drawQueue();
      if (via === 'drag') queueEl.lastElementChild?.classList.add('spring-in');
      updateControls();
      local.nudge?.poke();
    },
  });

  removeLastBtn.addEventListener('click', () => {
    if (local.running || local.commands.length === 0) return;
    vibrate();
    revertRunButtonIfRetrying();
    if (isFix) local.fixOpened = true;
    const i = local.commands.length - 1;
    local.commands.splice(i, 1);
    logEvent('undo', { index: i });
    playSfx('remove');
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

  clearBtn.addEventListener('click', () => {
    if (local.running || local.commands.length === 0) return;
    vibrate();
    revertRunButtonIfRetrying();
    if (isFix) local.fixOpened = true;
    logEvent('undo', { all: true, commandCount: local.commands.length });
    // 参照を維持したまま空にする（S.drafts[step.stepId]との共有を切らないため。Issue #95）。
    local.commands.length = 0;
    playSfx('reset');
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

  function replay() {
    resultEl.innerHTML = '';
    delete resultEl.dataset.result;
    drawBoard(spec.start);
    updateControls();
    local.nudge?.poke();
  }

  runBtn.addEventListener('click', () => {
    if (runBtn.dataset.action === 'retry') {
      vibrate();
      logEvent('retry', {});
      resultEl.innerHTML = '';
      delete resultEl.dataset.result;
      setRunButtonMode('run');
      drawBoard(spec.start);
      updateControls();
      local.nudge?.poke();
      return;
    }
    if (local.running || local.commands.length === 0) return;
    vibrate();
    local.running = true;
    local.nudge?.stop();
    resultEl.innerHTML = '';
    delete resultEl.dataset.result;
    logEvent('run', { commandCount: local.commands.length });
    updateControls();
    drawBoard(spec.start);

    playAnimation(local.commands, spec, local.view, {
      onTick: (i) => {
        local.activeIndex = i;
        drawQueue();
      },
      onPickup: () => {
        local.remaining -= 1;
        if (remainingEl) remainingEl.textContent = String(local.remaining);
      },
      onDone: (result) => {
        local.running = false;
        local.activeIndex = -1;
        drawQueue();
        updateControls();
        if (result.reachedGoal && result.remainingItems.length === 0) {
          logEvent('clear', {});
          markLessonCleared();
          delete S.drafts[step.stepId];
          showSuccess(resultEl, { view: local.view });
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
          resultEl.appendChild(createPrimaryButton('もういちど', replay, 'replay'));
        } else {
          setRunButtonMode('retry');
          updateControls();
          const info = diagnose(result, local.commands, spec);
          if (info.reason === 'wall') {
            queueEl.querySelector(`[data-index="${info.cmdIndex}"]`)?.classList.add('ring-4', 'ring-amber-400');
            local.view.markCell(info.cell, 'wall');
          } else if (info.reason === 'items') {
            local.view.hintItems(info.remainingItems);
          } else {
            local.view.markCell(info.cell, 'stopped');
            local.view.markCell(spec.goal, 'goal-hint');
          }
          local.view.shrug();
          showHint(resultEl, { kind: info.reason, message: HINT_MESSAGE[info.reason] });
        }
      },
    });
  });

  function showTaskCard() {
    local.nudge?.stop();
    opScreen.style.display = 'none';
    taskCardEl.style.display = '';
  }

  function beginTask() {
    taskCardEl.style.display = 'none';
    opScreen.style.display = 'flex';
    if (!local.started) {
      local.started = true;
      drawBoard(spec.start);
      drawQueue();
      updateControls();
      // 無操作時、いまの段階に応じた実物ボタンを促す（8秒後・最大2回。Issue #89）。
      local.nudge = createIdleNudge({
        getTarget: () => {
          const phase = currentPhase();
          if (phase === 0) return [];
          if (phase === 1 && isFix) return [...queueEl.querySelectorAll('.command-remove')];
          if (phase === 3) return [runBtn];
          return [...paletteEl.querySelectorAll('button:not(:disabled)')];
        },
      });
      setActiveNudge(local.nudge);
      // 未クリアレッスンの最初の操作画面表示時だけ、指ガイドを1回出す。最初のタップ/
      // ドラッグでフェードアウトして消える（Issue #95）。
      if (!isLessonCleared(S.lesson.lessonId)) {
        const firstBtn = paletteEl.querySelector('[data-command]');
        if (firstBtn) {
          setActiveHandHint(showHandHint({ from: firstBtn, to: queueEl, mode: 'drag' }));
          opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
        }
      }
      new ResizeObserver(() => {
        // 実行中・結果/ヒント表示中は盤面状態を保つため再構築しない（Issue #93）。
        if (local.running || resultEl.childElementCount > 0) return;
        const next = computeCellSize({
          cols: spec.grid.cols,
          rows: spec.grid.rows,
          width: boardArea.clientWidth,
          height: boardArea.clientHeight,
        });
        if (next !== local.cellSize) drawBoard(spec.start);
      }).observe(boardArea);
    } else {
      local.nudge?.poke();
    }
  }

  renderTaskCard(taskCardEl, {
    kind: 'play',
    howtoVariant: isFix ? 'fix' : 'play',
    text: step.text,
    defaultText,
    items: spec.items.length,
    onBegin: beginTask,
  });
  if (!taskCardEnabled()) beginTask();
}
