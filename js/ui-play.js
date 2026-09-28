// playステップ（盤面・矢印ボタン・並んだ命令・じっこう）の描画。課題カードは廃止し、
// 操作画面に直接入る。説明は「れんしゅう」画面と指ガイドで行う（Issue #97。旧仕様はIssue #93）。
// 画面上部の問い文スロットは、実行結果（やったね／ヒント）を数秒だけトースト表示する場所も兼ねる。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid, shapeSvg, computeCellSize, prefersReducedMotion } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, toggleGhostSlot, vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { createIdleNudge } from './ui-guide.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge, setActiveHandHint, markLessonCleared } from './ui-step.js';
import { showSuccess, showHint, diagnose } from './ui-reaction.js';
import { clearToast, showToast } from './ui-toast.js';

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
  // もういちど（失敗時のretry・クリア後のreplay双方）でこの内容へ戻す（Issue #104）ため、
  // 以後書き換えるcommandsとは別の配列として持つ。
  const freshCommands = (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 }));
  // ←で戻って再びこのplayへ進んだ時、命令列の下書き（S.drafts）があれば復元する
  // （確認ダイアログ全廃の代わりの誤タップ対策。以後の追加・削除はこの配列を直接
  // 書き換えるため、参照を共有するだけで自動的に保存される。Issue #95）。
  const commands = S.drafts[step.stepId] ?? freshCommands.map((c) => ({ ...c }));
  S.drafts[step.stepId] = commands;

  // このステージがレッスン中の何番目のplayか（複数ステージ構成向け。Issue #104）。
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = {
    commands,
    activeIndex: -1,
    running: false,
    view: null,
    resultShown: false,
    // 不正解でtrueにし、「もういちど」以外の操作ボタン・命令チップの取り消しを封じる
    // （思考フローが他ボタンで乱れないようにする。Issue #106）。「もういちど」押下でのみ解除。
    locked: false,
    nudge: null,
    remaining: spec.items.length,
    // なおす系（initialCommandsあり）で最初の編集（×・追加・ぜんぶけす）をしたか。
    // 無操作促しの対象を決めるのに使う（Issue #89）。下書き復元時は元の並びと違えば編集済み扱い。
    fixOpened: isFix && JSON.stringify(commands) !== JSON.stringify(freshCommands),
  };

  const opScreen = document.createElement('div');
  opScreen.className = 'play-screen flex flex-col flex-1 min-h-0 gap-2';
  root.appendChild(opScreen);

  // 問い文スロット（1行）。実行結果もここへ数秒だけトースト表示する（Issue #97）。
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar flex flex-col items-center gap-0.5 shrink-0 text-center';
  opScreen.appendChild(statusBar);

  let remainingEl = null;
  // renderAcornTray(): どんぐりの残数を「空き枠が埋まる絵」で示す（Issue #110）。
  // data-remaining付きの数字は既存シナリオ（c1-goal-objective等）が読むためsr-onlyで残す
  // （見た目には出さない。sr-onlyは非表示ではないためinnerText()は値を返す）。
  function renderAcornTray() {
    const tray = document.createElement('div');
    tray.className = 'acorn-tray flex items-center justify-center gap-1';
    const filled = spec.items.length - local.remaining;
    for (let i = 0; i < spec.items.length; i += 1) {
      const slot = document.createElement('span');
      const isFilled = i < filled;
      slot.className = `acorn-slot inline-flex items-center justify-center w-5 h-5 rounded-full border-2 ${
        isFilled ? 'border-amber-500 bg-amber-50' : 'border-dashed border-amber-400/50'
      }`;
      if (isFilled) {
        slot.dataset.filled = 'true';
        slot.innerHTML = `<span class="w-3 h-3 inline-block">${shapeSvg('item')}</span>`;
      }
      tray.appendChild(slot);
    }
    statusBar.appendChild(tray);
    const srRemaining = document.createElement('span');
    srRemaining.className = 'sr-only';
    srRemaining.dataset.remaining = 'true';
    srRemaining.textContent = String(local.remaining);
    statusBar.appendChild(srRemaining);
    remainingEl = srRemaining;
  }

  function renderQuestion() {
    statusBar.innerHTML = '';
    const q = document.createElement('p');
    q.className = 'text-sm font-bold text-slate-700';
    renderInto(q, step.text ?? defaultText, S.readingLevel, S.furigana);
    statusBar.appendChild(q);
    if (spec.items.length > 0) {
      renderAcornTray();
    } else {
      remainingEl = null;
    }
  }

  // fillNextAcornSlot(): どんぐりを1個拾うたびに、次の空き枠を埋める（spring-inで弾む。
  // reduced-motion時は演出なしで即座に埋まる。Issue #110）。
  function fillNextAcornSlot() {
    const slots = statusBar.querySelectorAll('.acorn-slot');
    const filledCount = spec.items.length - local.remaining;
    const slot = slots[filledCount - 1];
    if (!slot) return;
    slot.dataset.filled = 'true';
    slot.classList.remove('border-dashed', 'border-amber-400/50');
    slot.classList.add('border-amber-500', 'bg-amber-50');
    slot.innerHTML = `<span class="w-3 h-3 inline-block ${prefersReducedMotion() ? '' : 'spring-in'}">${shapeSvg('item')}</span>`;
  }

  // syncAcornTray(): local.remainingの値に合わせて、既存のどんぐり枠を（演出無しで）一括同期する。
  // drawBoard()のリセット時に使う（renderQuestion()が直前のlocal.remainingでトレイを作った後
  // なので、リセット後の値へ描き直す必要がある。Issue #110）。
  function syncAcornTray() {
    if (!remainingEl) return;
    remainingEl.textContent = String(local.remaining);
    const filled = spec.items.length - local.remaining;
    statusBar.querySelectorAll('.acorn-slot').forEach((slot, i) => {
      const isFilled = i < filled;
      if (isFilled) {
        slot.dataset.filled = 'true';
        slot.classList.add('border-amber-500', 'bg-amber-50');
        slot.classList.remove('border-dashed', 'border-amber-400/50');
        slot.innerHTML = `<span class="w-3 h-3 inline-block">${shapeSvg('item')}</span>`;
      } else {
        delete slot.dataset.filled;
        slot.classList.remove('border-amber-500', 'bg-amber-50');
        slot.classList.add('border-dashed', 'border-amber-400/50');
        slot.innerHTML = '';
      }
    });
  }

  function clearResult() {
    local.resultShown = false;
    renderQuestion();
  }

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  opScreen.appendChild(boardArea);

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

  const controls = document.createElement('div');
  controls.className = 'controller-panel flex flex-col gap-2 shrink-0';
  opScreen.appendChild(controls);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'flex gap-2 justify-center';
  controls.appendChild(paletteEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue command-tray flex flex-nowrap items-center gap-2 overflow-x-auto min-h-[64px] py-1';
  controls.appendChild(queueEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'flex gap-2 justify-center';
  controls.appendChild(actionsEl);

  const removeLastBtn = document.createElement('button');
  removeLastBtn.type = 'button';
  removeLastBtn.dataset.action = 'remove-last';
  removeLastBtn.textContent = '⌫ ひとつ けす';
  removeLastBtn.className =
    'min-w-[64px] min-h-[64px] px-2 rounded-lg bg-slate-200 text-sm whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset.action = 'clear-all';
  clearBtn.textContent = 'ぜんぶ けす';
  clearBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-200 text-sm whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ じっこう';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';

  // 実行が失敗したらrunBtn自体を橙色の「もういちど」に変える（目線を動かさずに押せる。Issue #91）。
  // 他のボタンをロックする間、押せるのはこれだけなのでパルス枠で目立たせる（Issue #106）。
  const RETRY_EMPHASIS_CLASSES = ['ring-4', 'ring-amber-300', 'ring-offset-2', 'motion-safe:animate-pulse'];
  function setRunButtonMode(mode) {
    if (mode === 'retry') {
      runBtn.dataset.action = 'retry';
      runBtn.textContent = '↺ もういちど';
      runBtn.classList.remove('bg-emerald-500');
      runBtn.classList.add('bg-amber-500', ...RETRY_EMPHASIS_CLASSES);
    } else {
      runBtn.dataset.action = 'run';
      runBtn.textContent = '▶ じっこう';
      runBtn.classList.remove('bg-amber-500', ...RETRY_EMPHASIS_CLASSES);
      runBtn.classList.add('bg-emerald-500');
    }
  }

  // クリア時はつぎへ・もういちど（レッスン再挑戦）を通常アクション行に差し替えて表示する
  // （盤面上に重ねない。Issue #97）。
  function showNormalActions() {
    actionsEl.innerHTML = '';
    actionsEl.appendChild(removeLastBtn);
    actionsEl.appendChild(clearBtn);
    actionsEl.appendChild(runBtn);
  }

  function showResultActions(buttons) {
    actionsEl.innerHTML = '';
    buttons.forEach((b) => actionsEl.appendChild(b));
  }

  // triggerFailFeedback(): 不正解時の視覚・聴覚フィードバック。派手な✕・警告音ではなく、
  // 盤面をやさしくゆらすアニメーションと低音スイープの音で気づかせる（Issue #106）。
  // reduced-motion時はゆらさず、盤面に0.5秒だけ枠を光らせて静止のまま気づけるようにする。
  // あわせて盤面のマスだけを暗くし（view.dim）、失敗リザルト状態を再スタート状態と
  // 見た目で区別する（もういちどのdrawBoard()が新しいview（dimは初期値=暗くなし）を
  // 作り直すため、明示的なdim(false)呼び出しは不要。Issue #110）。
  function triggerFailFeedback() {
    playSfx('tryAgain');
    local.view.dim(true);
    if (prefersReducedMotion()) {
      boardArea.classList.add('ring-4', 'ring-amber-400', 'rounded-2xl');
      setTimeout(() => boardArea.classList.remove('ring-4', 'ring-amber-400', 'rounded-2xl'), 500);
    } else {
      boardArea.classList.add('wobble-soft');
      boardArea.addEventListener('animationend', () => boardArea.classList.remove('wobble-soft'), { once: true });
    }
  }

  // showRestartCue(): 盤面を作り直した直後（もういちど＝失敗後のretry・クリア後のreplay共通）に
  // 「スタート！」を1秒だけ問い文スロットへ表示し、再スタート状態を明確に伝える（Issue #110）。
  function showRestartCue() {
    playSfx('start');
    local.resultShown = true;
    showToast(statusBar, {
      render: (el) => {
        el.dataset.restart = 'true';
        const p = document.createElement('p');
        p.className = 'text-lg font-bold text-sky-700';
        p.textContent = 'スタート！';
        el.appendChild(p);
      },
      durationMs: 1000,
      restore: (el) => {
        delete el.dataset.restart;
        clearResult();
      },
    });
  }

  // やりかた帯・無操作促しの対象を決める段階（Issue #89）。0=強調なし（実行中・結果表示中）、
  // 1=けす/おす、3=じっこう。なおす系は編集済みか否かのみで1↔3を決める（②は経由しない）。
  // ロック中（不正解でもういちど待ち）は常に3（じっこうボタン＝もういちど）を対象にする（Issue #106）。
  function currentPhase() {
    if (local.running || local.resultShown) return 0;
    if (local.locked) return 3;
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
    syncAcornTray();
  }

  // resetToFresh(): 命令列をfreshCommands（なおす系は初期の「ずれた」列、それ以外は空）へ戻す。
  // 「もういちど」（失敗後のretry・クリア後のreplay）は正解・不正解に関わらず必ずこれを呼ぶ
  // （前回の命令列を残さない。Issue #104）。参照(S.drafts)は保ったまま中身だけ入れ替える。
  function resetToFresh() {
    local.commands.length = 0;
    freshCommands.forEach((c) => local.commands.push({ ...c }));
    S.drafts[step.stepId] = local.commands;
    local.fixOpened = false;
    local.locked = false;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      removable: true,
      // 上限に達したら次の枠は出さない（Issue #110）。
      nextSlot: local.commands.length < step.maxCommands ? local.commands.length + 1 : null,
      onRemove: (i) => {
        if (local.running || local.locked) return;
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
      b.disabled = atMax || local.running || local.locked;
    });
    const isRetry = runBtn.dataset.action === 'retry';
    runBtn.disabled = local.running || (!isRetry && local.commands.length === 0);
    clearBtn.disabled = local.commands.length === 0 || local.running || local.locked;
    removeLastBtn.disabled = local.commands.length === 0 || local.running || local.locked;
    // ロック中は命令列自体もぼかし、タップを受け付けないようにする（チップ×の誤タップ防止。Issue #106）。
    queueEl.classList.toggle('opacity-50', local.locked);
    queueEl.classList.toggle('pointer-events-none', local.locked);
  }

  renderCommandPalette(paletteEl, {
    dropTarget: () => queueEl.getBoundingClientRect(),
    onDragOver: (active) => toggleGhostSlot(queueEl, active),
    onAdd: (dir, { via } = {}) => {
      if (local.running || local.locked) return;
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
      // 命令列は横スクロールのため、積みすぎると最新のチップが右にはみ出して見えなくなる。
      // 追加のたびに右端へスクロールし、常に最新チップが見える位置にする（Issue #102）。
      queueEl.scrollLeft = queueEl.scrollWidth;
      // lastElementChildは使わない（末尾にトレイの次枠(.tray-slot)が付くため。Issue #110）。
      if (via === 'drag') queueEl.querySelectorAll('.command-chip')[local.commands.length - 1]?.classList.add('spring-in');
      updateControls();
      local.nudge?.poke();
    },
  });

  removeLastBtn.addEventListener('click', () => {
    if (local.running || local.locked || local.commands.length === 0) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    const i = local.commands.length - 1;
    const last = local.commands[i];
    // まとめられたチップ（times>1）は1回分だけ減らす。1の時だけチップごと消す（Issue #97）。
    if (last.times > 1) last.times -= 1;
    else local.commands.splice(i, 1);
    logEvent('undo', { index: i });
    playSfx('remove');
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

  clearBtn.addEventListener('click', () => {
    if (local.running || local.locked || local.commands.length === 0) return;
    vibrate();
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
    showNormalActions();
    clearToast(statusBar);
    resetToFresh();
    drawQueue();
    drawBoard(spec.start);
    local.view.popIn();
    updateControls();
    showRestartCue();
    local.nudge?.poke();
  }

  runBtn.addEventListener('click', () => {
    if (runBtn.dataset.action === 'retry') {
      vibrate();
      logEvent('retry', {});
      clearToast(statusBar);
      setRunButtonMode('run');
      resetToFresh();
      drawQueue();
      drawBoard(spec.start);
      local.view.popIn();
      updateControls();
      showRestartCue();
      local.nudge?.poke();
      return;
    }
    if (local.running || local.commands.length === 0) return;
    vibrate();
    local.running = true;
    local.nudge?.stop();
    clearToast(statusBar);
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
        fillNextAcornSlot();
      },
      onDone: (result) => {
        local.running = false;
        local.activeIndex = -1;
        drawQueue();
        updateControls();
        // 壁にぶつかった手が1つでもあれば、結果としてゴールに着いても正解にしない（Issue #104）。
        if (result.reachedGoal && result.remainingItems.length === 0 && result.blockedAt.length === 0) {
          delete S.drafts[step.stepId];
          local.resultShown = true;
          showSuccess(statusBar, { view: local.view, restore: clearResult });
          if (isFinalStage) {
            logEvent('clear', {});
            markLessonCleared();
            showResultActions([
              createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'),
              createPrimaryButton('もういちど', replay, 'replay'),
            ]);
          } else {
            // 途中ステージのクリアはstage_clearのみを記録し、レッスン全体のクリア（clear）や
            // 単元スタンプの対象にはしない（Issue #104）。
            logEvent('stage_clear', { stage: stageIndex + 1 });
            showResultActions([
              createPrimaryButton('つぎの ステージ', () => goToStep(S.stepIndex + 1), 'next-stage'),
              createPrimaryButton('もういちど', replay, 'replay'),
            ]);
          }
        } else {
          setRunButtonMode('retry');
          local.locked = true;
          updateControls();
          triggerFailFeedback();
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
          local.resultShown = true;
          showHint(statusBar, { kind: info.reason, message: HINT_MESSAGE[info.reason], restore: clearResult });
        }
      },
    });
  });

  renderQuestion();
  showNormalActions();
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
  // 未クリアレッスンの最初のステージ（p1）表示時だけ、指ガイドを1回出す。最初のタップ/
  // ドラッグでフェードアウトして消える（Issue #95・#104でp1限定に変更）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    const firstBtn = paletteEl.querySelector('[data-command]');
    if (firstBtn) {
      setActiveHandHint(showHandHint({ from: firstBtn, to: queueEl, mode: 'drag' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
  new ResizeObserver(() => {
    // 実行中・結果表示中は盤面状態を保つため再構築しない（Issue #93）。
    if (local.running || local.resultShown) return;
    const next = computeCellSize({
      cols: spec.grid.cols,
      rows: spec.grid.rows,
      width: boardArea.clientWidth,
      height: boardArea.clientHeight,
    });
    if (next !== local.cellSize) drawBoard(spec.start);
  }).observe(boardArea);
}
