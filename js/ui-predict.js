// predictステップ（固定命令列を自動実行し、予想と結果を並べて表示）の描画。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid } from './ui-grid.js';
import { COMMAND_LABELS } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { renderHowTo, createIdleNudge } from './ui-guide.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge } from './ui-step.js';

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

  const prompt = document.createElement('p');
  prompt.className = 'text-xl text-center mb-2';
  renderInto(prompt, step.text, S.readingLevel, S.furigana);
  root.appendChild(prompt);

  // やりかた帯：どのますをタップすればいいかを示す（Issue #89）。
  const howto = renderHowTo(root, 'predict');
  howto.setPhase(1);

  const commandRow = document.createElement('div');
  commandRow.className = 'flex justify-center gap-2 mb-4';
  step.commands.forEach((cmd, i) => {
    const chip = document.createElement('span');
    chip.className =
      'predict-command-chip inline-flex items-center justify-center min-w-[48px] min-h-[48px] px-3 rounded-lg bg-slate-100 text-sm';
    chip.dataset.index = String(i);
    chip.textContent = COMMAND_LABELS[cmd];
    commandRow.appendChild(chip);
  });
  root.appendChild(commandRow);

  const boardWrap = document.createElement('div');
  boardWrap.className = 'flex justify-center';
  root.appendChild(boardWrap);

  const local = { selected: null, view: null };

  // 静的な盤面の再構築。アニメーション中には呼ばない（プレイヤー駒はview経由で差分更新する）。
  // goalは描かない（Issue #80。星がゴール/答えだと誤解された。itemsは経路に関わるため残す）。
  function drawStatic(playerPos, labels, markers) {
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({
      grid: spec.grid,
      walls: spec.walls,
      goal: null,
      items: spec.items,
      playerPos,
      labels,
      markers,
    });
    boardWrap.appendChild(el);
    local.view = view;
  }
  drawStatic(spec.start, step.optionCells.map((o) => ({ id: o.id, x: o.x, y: o.y })), []);

  // 無操作時、光っていない選択肢マスを促す（8秒後・最大2回。Issue #89）。
  const nudge = createIdleNudge({ getTarget: () => [...boardWrap.querySelectorAll('[data-option]')] });
  setActiveNudge(nudge);

  boardWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-option]');
    if (!btn || local.selected) return;
    nudge.stop();
    local.selected = btn.dataset.option;
    const correct = local.selected === step.answer;
    logEvent('predict', { selected: local.selected, correct });
    drawStatic(spec.start, [], []);

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
        drawStatic(finalPos, [], [
          { x: chosen.x, y: chosen.y, kind: 'predicted' },
          { x: finalPos.x, y: finalPos.y, kind: 'result' },
        ]);
        howto.setPhase(0);
        root.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
      },
    });
  });
}
