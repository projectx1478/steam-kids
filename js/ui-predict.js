// predictステップ（課題カード→操作画面：固定命令列を自動実行し予想と結果を表示）の描画。
// 操作画面は「固定命令列・盤面」のみに絞り、区分バナー・デモ・やりかた帯・キャプション・
// 長い指示文は課題カードへ集約する（Issue #93）。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid, computeCellSize } from './ui-grid.js';
import { COMMAND_LABELS, ORDER_BADGE_CLASS, renderOrderArrow } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderTaskCard, renderShowTaskButton, taskCardEnabled } from './ui-task-card.js';
import { createIdleNudge } from './ui-guide.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge } from './ui-step.js';
import { showSuccess, showHint } from './ui-reaction.js';

const RETRY_HINT_MESSAGE = 'ロボットは ここで とまったよ';

function getPlaySpec() {
  const playStep = S.lesson.steps.find((s) => s.kind === 'play');
  return {
    grid: playStep.grid,
    start: playStep.start,
    goal: playStep.goal,
    walls: playStep.walls,
    items: playStep.items ?? [],
  };
}

export function renderPredict(root, step) {
  const spec = getPlaySpec();
  const local = { selected: null, view: null, started: false, nudge: null, cellSize: 64 };

  const taskCardEl = document.createElement('div');
  root.appendChild(taskCardEl);

  const opScreen = document.createElement('div');
  opScreen.className = 'predict-screen flex flex-col flex-1 min-h-0 gap-2';
  opScreen.style.display = 'none';
  root.appendChild(opScreen);

  // 「？」はヘッダーの#step-toolsに置き、操作画面内に行を作らない（盤面の縦幅確保。Issue #99）。
  const showTaskBtn = renderShowTaskButton(document.getElementById('step-tools'), showTaskCard);
  showTaskBtn.style.display = 'none';

  const commandRow = document.createElement('div');
  commandRow.className = 'flex justify-center items-center gap-2 shrink-0';
  step.commands.forEach((cmd, i) => {
    if (i > 0) commandRow.appendChild(renderOrderArrow('span'));
    const chip = document.createElement('span');
    chip.className = `predict-command-chip relative inline-flex items-center justify-center min-w-[48px] min-h-[48px] px-3 rounded-lg bg-slate-100 text-sm ${ORDER_BADGE_CLASS}`;
    chip.dataset.index = String(i);
    chip.dataset.order = String(i + 1);
    chip.textContent = COMMAND_LABELS[cmd];
    commandRow.appendChild(chip);
  });
  opScreen.appendChild(commandRow);

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  opScreen.appendChild(boardArea);

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

  const resultEl = document.createElement('div');
  resultEl.className =
    'absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-[92%] bg-white/95 rounded-xl shadow px-3 py-2 text-center empty:hidden empty:p-0 empty:shadow-none';
  boardArea.appendChild(resultEl);

  // 静的な盤面の再構築。選択前・もういちどの時のみ呼ぶ（結果表示中は足あとを残すため呼ばない）。
  function drawStatic(playerPos, labels) {
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
      goal: null, // ゴールは描かない（Issue #80。星がゴール/答えだと誤解された）
      items: spec.items,
      playerPos,
      labels,
      cellSize: local.cellSize,
    });
    boardWrap.appendChild(el);
    local.view = view;
  }

  // 選択肢タップ待ちの状態を(再)表示する。もういちど よそう（不正解時・正解時とも）から再度呼ばれる。
  function showQuestion() {
    local.selected = null;
    resultEl.innerHTML = '';
    commandRow.querySelectorAll('[data-index]').forEach((el) => delete el.dataset.active);
    drawStatic(spec.start, step.optionCells.map((o) => ({ id: o.id, x: o.x, y: o.y })));

    // 無操作時、光っていない選択肢マスを促す（8秒後・最大2回。Issue #89）。
    local.nudge = createIdleNudge({ getTarget: () => [...boardWrap.querySelectorAll('[data-option]')] });
    setActiveNudge(local.nudge);
  }

  boardArea.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-option]');
    if (!btn || local.selected) return;
    local.nudge.stop();
    local.selected = btn.dataset.option;
    const correct = local.selected === step.answer;
    logEvent('predict', { selected: local.selected, correct });
    drawStatic(spec.start, []);

    playAnimation(step.commands, spec, local.view, {
      onTick: (i) => {
        commandRow.querySelectorAll('[data-index]').forEach((el) => {
          if (Number(el.dataset.index) === i) el.dataset.active = 'true';
          else delete el.dataset.active;
        });
      },
      onDone: (result) => {
        commandRow.querySelectorAll('[data-index]').forEach((el) => delete el.dataset.active);
        playSfx('reveal');
        const chosen = step.optionCells.find((o) => o.id === local.selected);
        const finalPos = result.path[result.path.length - 1];
        // 足あとを残したまま(drawStaticで再構築しない)、よそう・けっか印だけ重ねる（Issue #91）。
        local.view.markCell(chosen, 'predicted');
        local.view.markCell(finalPos, 'result');

        if (correct) {
          showSuccess(resultEl, { view: local.view });
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
          resultEl.appendChild(createPrimaryButton('もういちど よそう', showQuestion, 'retry-predict'));
        } else {
          showHint(resultEl, { kind: 'predict', message: RETRY_HINT_MESSAGE });
          resultEl.appendChild(createPrimaryButton('もういちど よそう', showQuestion, 'retry-predict'));
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        }
      },
    });
  });

  function showTaskCard() {
    local.nudge?.stop();
    opScreen.style.display = 'none';
    showTaskBtn.style.display = 'none';
    taskCardEl.style.display = '';
  }

  function beginTask() {
    taskCardEl.style.display = 'none';
    opScreen.style.display = 'flex';
    showTaskBtn.style.display = '';
    if (!local.started) {
      local.started = true;
      showQuestion();
      new ResizeObserver(() => {
        if (local.selected) return; // 結果表示中は盤面状態を保つ
        const next = computeCellSize({
          cols: spec.grid.cols,
          rows: spec.grid.rows,
          width: boardArea.clientWidth,
          height: boardArea.clientHeight,
        });
        if (next !== local.cellSize) showQuestion();
      }).observe(boardArea);
    } else {
      local.nudge?.poke();
    }
  }

  renderTaskCard(taskCardEl, {
    kind: 'predict',
    text: step.text,
    onBegin: beginTask,
  });
  if (!taskCardEnabled()) beginTask();
}
