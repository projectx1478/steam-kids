// predictステップ（固定命令列を自動実行し予想と結果を表示）の描画。課題カードは廃止し、
// 操作画面に直接入る（Issue #97。旧仕様はIssue #93）。画面上部の問い文スロットは、実行結果
// （やったね／ヒント）を数秒だけトースト表示する場所も兼ねる。
import { S } from './state.js';
import { boardSpec } from './engine-grid.js';
import { logEvent } from './events.js';
import { renderGrid, computeCellSize } from './ui-grid.js';
import { COMMAND_LABELS, ORDER_BADGE_CLASS, renderOrderArrow } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { createIdleNudge } from './ui-guide.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge } from './ui-step.js';
import { showHint } from './ui-reaction.js';
import { showClearToast } from './ui-clear.js';
import { clearToast } from './ui-toast.js';

const RETRY_HINT_MESSAGE = 'ロボットは ここで とまったよ';

function getPlaySpec() {
  const playStep = S.lesson.steps.find((s) => s.kind === 'play');
  return boardSpec(playStep);
}

export function renderPredict(root, step) {
  const spec = getPlaySpec();
  const local = { selected: null, view: null, nudge: null, cellSize: 64 };

  // 画面の枠は共通部品（js/ui-screen.js。Issue #343・#355）。問い文スロット（statusBar＝questionEl）には
  // 実行結果もここへ数秒だけトースト表示する（Issue #97）。
  const screen = createOpScreen({ root, question: step.text });
  const { frame: opScreen, questionEl: statusBar, boardArea, actions: actionsEl } = screen;
  opScreen.classList.add('sk-screen-frame--predict');
  actionsEl.classList.add('sk-screen-actions--predict');

  function renderQuestion() {
    screen.renderQuestion(step.text);
  }

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
  commandRow.classList.add('predict-command-row');
  opScreen.insertBefore(commandRow, boardArea);

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

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
    clearToast(statusBar);
    renderQuestion();
    actionsEl.innerHTML = '';
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
          showClearToast(statusBar, { view: local.view, restore: renderQuestion });
          actionsEl.innerHTML = '';
          actionsEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
          actionsEl.appendChild(createPrimaryButton('もういちど', showQuestion, 'retry-predict'));
        } else {
          showHint(statusBar, { kind: 'predict', message: RETRY_HINT_MESSAGE, restore: renderQuestion });
          actionsEl.innerHTML = '';
          actionsEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
          actionsEl.appendChild(createPrimaryButton('もういちど', showQuestion, 'retry-predict'));
        }
      },
    });
  });

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
}
