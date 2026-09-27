// predictステップ（固定命令列を自動実行し、予想と結果を並べて表示）の描画。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid } from './ui-grid.js';
import { COMMAND_LABELS } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { renderHowTo, createIdleNudge } from './ui-guide.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge, renderCategoryBanner } from './ui-step.js';
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

  // 区分バナー＋デモ（Issue #91）。
  const banner = renderCategoryBanner(root, 'predict');

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

  const resultEl = document.createElement('div');
  resultEl.className = 'text-center mt-2';
  root.appendChild(resultEl);

  const local = { selected: null, view: null };
  let nudge = null;

  // 静的な盤面の再構築。選択前・もういちどの時のみ呼ぶ（結果表示中は足あとを残すため呼ばない）。
  function drawStatic(playerPos, labels) {
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({
      grid: spec.grid,
      walls: spec.walls,
      goal: null, // ゴールは描かない（Issue #80。星がゴール/答えだと誤解された）
      items: spec.items,
      playerPos,
      labels,
    });
    boardWrap.appendChild(el);
    local.view = view;
  }

  // 選択肢タップ待ちの状態を(再)表示する。もういちど よそう（不正解時）から再度呼ばれる。
  function showQuestion() {
    local.selected = null;
    resultEl.innerHTML = '';
    commandRow.querySelectorAll('[data-index]').forEach((el) => delete el.dataset.active);
    howto.setPhase(1);
    drawStatic(spec.start, step.optionCells.map((o) => ({ id: o.id, x: o.x, y: o.y })));

    // 無操作時、光っていない選択肢マスを促す（8秒後・最大2回。Issue #89）。
    nudge = createIdleNudge({ getTarget: () => [...boardWrap.querySelectorAll('[data-option]')] });
    setActiveNudge(nudge);
  }
  showQuestion();

  boardWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-option]');
    if (!btn || local.selected) return;
    banner.collapse();
    nudge.stop();
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
        howto.setPhase(0);

        if (correct) {
          showSuccess(resultEl, { view: local.view });
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        } else {
          showHint(resultEl, { kind: 'predict', message: RETRY_HINT_MESSAGE });
          resultEl.appendChild(createPrimaryButton('もういちど よそう', showQuestion, 'retry-predict'));
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        }
      },
    });
  });
}
