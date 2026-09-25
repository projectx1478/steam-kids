// ステップ切替（intro/predict/play/summary）、実行アニメーション、ふりがなトグル。
import { S, currentStep } from './state.js';
import { logEvent } from './events.js';
import { simulate } from './engine-grid.js';
import { renderGrid } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, COMMAND_LABELS } from './ui-commands.js';
import { play as playSfx } from './sfx.js';

const STEP_DELAY_MS = 600;

// clear到達後は離脱してもabandonを記録しない。1セッションにつき1回だけ記録する。
let lessonCleared = false;
let abandonLogged = false;

function logAbandonOnce() {
  if (abandonLogged || lessonCleared) return;
  abandonLogged = true;
  logEvent('abandon', {});
}

function stage() {
  return document.getElementById('stage');
}

export function initSteps() {
  const toggle = document.getElementById('furigana-toggle');
  toggle.addEventListener('click', () => {
    S.furigana = !S.furigana;
    toggle.setAttribute('aria-pressed', String(S.furigana));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) logAbandonOnce();
  });
  window.addEventListener('pagehide', logAbandonOnce);

  logEvent('step_enter', {});
  renderStep();
}

function goToStep(nextIndex) {
  logEvent('step_leave', {});
  S.stepIndex = nextIndex;
  logEvent('step_enter', {});
  playSfx('whoosh');
  renderStep();
}

function renderStep() {
  const step = currentStep();
  const root = stage();
  root.innerHTML = '';
  root.dataset.step = step.kind;
  root.dataset.stepId = step.stepId;

  if (step.kind === 'intro') renderIntro(root, step);
  else if (step.kind === 'predict') renderPredict(root, step);
  else if (step.kind === 'play') renderPlay(root, step);
  else if (step.kind === 'summary') renderSummary(root, step);
}

function createPrimaryButton(label, onClick, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'primary-btn block mx-auto min-w-[48px] min-h-[48px] px-6 py-3 mt-4 rounded-xl bg-sky-500 text-white text-lg';
  if (action) btn.dataset.action = action;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function createClearReaction() {
  const wrap = document.createElement('div');
  wrap.className = 'clear-reaction flex flex-col items-center gap-1';
  wrap.innerHTML = `<svg viewBox="0 0 64 64" class="w-12 h-12" aria-hidden="true">
    <polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24"
      fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
  </svg><p class="text-lg font-bold text-amber-600">やったね</p>`;
  return wrap;
}

function dirAt(commands, idx) {
  const entry = commands[idx];
  return typeof entry === 'string' ? entry : entry.dir;
}

// 命令列を1手600msで再生する。engine-gridの純粋計算結果(simulate)を時間軸に沿って見せるだけ。
// まとめ命令（times>=2）は複数コマ分の時間をかけて再生し、その間onTickには元の命令
// （チップ）のインデックスをstepOwner経由で渡し続ける。
// viewはui-grid.jsのrenderGridが返す差分更新API（プレイヤー駒の移動・バウンス・足あと）。
function playAnimation(commands, spec, view, { onTick, onDone }) {
  const result = simulate(commands, spec);
  playSfx('run');
  let i = 0;
  const step = () => {
    const from = result.path[i];
    const to = result.path[i + 1];
    const bumped = from.x === to.x && from.y === to.y;
    playSfx(bumped ? 'bump' : 'step', { index: i });
    if (bumped) {
      view.bounce(dirAt(commands, result.stepOwner[i]));
    } else {
      view.footprint(from);
      view.moveTo(to);
    }
    onTick(result.stepOwner[i], to);
    if (i === result.path.length - 2) {
      setTimeout(() => onDone(result), STEP_DELAY_MS);
      return;
    }
    setTimeout(() => {
      i += 1;
      step();
    }, STEP_DELAY_MS);
  };
  step();
}

function renderIntro(root, step) {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = step.text;
  root.appendChild(p);
  root.appendChild(createPrimaryButton('はじめる', () => goToStep(S.stepIndex + 1), 'start'));
}

function renderSummary(root, step) {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = step.text;
  root.appendChild(p);
  root.appendChild(
    createPrimaryButton('ほかのレッスンへ', () => (location.href = './index.html'), 'back-to-picker')
  );
}

function getPlaySpec() {
  const playStep = S.lesson.steps.find((s) => s.kind === 'play');
  return { grid: playStep.grid, start: playStep.start, goal: playStep.goal, walls: playStep.walls };
}

function renderPredict(root, step) {
  const spec = getPlaySpec();

  const prompt = document.createElement('p');
  prompt.className = 'text-xl text-center mb-2';
  prompt.textContent = step.text;
  root.appendChild(prompt);

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
  function drawStatic(playerPos, labels, markers) {
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({ grid: spec.grid, walls: spec.walls, goal: spec.goal, playerPos, labels, markers });
    boardWrap.appendChild(el);
    local.view = view;
  }
  drawStatic(spec.start, step.optionCells.map((o) => ({ id: o.id, x: o.x, y: o.y })), []);

  boardWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-option]');
    if (!btn || local.selected) return;
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
        root.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
      },
    });
  });
}

function renderPlay(root, step) {
  const spec = { grid: step.grid, start: step.start, goal: step.goal, walls: step.walls };
  const local = {
    // initialCommandsがあれば「ずれた」命令列を最初から積んでおく（なおす系レッスン用）。
    commands: (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 })),
    activeIndex: -1,
    running: false,
    view: null,
  };

  const prompt = document.createElement('p');
  prompt.className = 'text-xl text-center mb-2';
  prompt.textContent = 'めいれいを くみたてよう';
  root.appendChild(prompt);

  const layout = document.createElement('div');
  layout.className = 'flex flex-col md:flex-row gap-4 items-center md:items-start justify-center';
  root.appendChild(layout);

  const boardWrap = document.createElement('div');
  layout.appendChild(boardWrap);

  const controls = document.createElement('div');
  controls.className = 'flex flex-col gap-3 w-full max-w-xs';
  layout.appendChild(controls);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'flex gap-2 justify-center';
  controls.appendChild(paletteEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue flex flex-col gap-1 min-h-[48px]';
  controls.appendChild(queueEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'flex gap-2 justify-center';
  controls.appendChild(actionsEl);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset.action = 'clear-all';
  clearBtn.textContent = 'ぜんぶけす';
  clearBtn.className = 'min-w-[48px] min-h-[48px] px-3 rounded-lg bg-slate-200 disabled:opacity-40';
  actionsEl.appendChild(clearBtn);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = 'じっこう';
  runBtn.className = 'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-emerald-500 text-white disabled:opacity-40';
  actionsEl.appendChild(runBtn);

  const resultEl = document.createElement('div');
  resultEl.className = 'text-center mt-2';
  controls.appendChild(resultEl);

  // 静的な盤面の再構築。アニメーション中には呼ばない（プレイヤー駒はview経由で差分更新する）。
  function drawBoard(playerPos) {
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({ grid: spec.grid, walls: spec.walls, goal: spec.goal, playerPos, labels: [], markers: [] });
    boardWrap.appendChild(el);
    local.view = view;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      onRemove: (i) => {
        if (local.running) return;
        local.commands.splice(i, 1);
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
      },
    });
  }

  function updateControls() {
    const atMax = local.commands.length >= step.maxCommands;
    paletteEl.querySelectorAll('button').forEach((b) => {
      b.disabled = atMax || local.running;
    });
    runBtn.disabled = local.commands.length === 0 || local.running;
    clearBtn.disabled = local.commands.length === 0 || local.running;
  }

  renderCommandPalette(paletteEl, {
    onAdd: (dir) => {
      if (local.running) return;
      const last = local.commands.at(-1);
      if (step.groupRepeats && last && last.dir === dir) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        if (local.commands.length >= step.maxCommands) return;
        local.commands.push({ dir, times: 1 });
        playSfx('tap');
      }
      drawQueue();
      updateControls();
    },
  });

  clearBtn.addEventListener('click', () => {
    if (local.running || local.commands.length === 0) return;
    logEvent('undo', { all: true, commandCount: local.commands.length });
    local.commands = [];
    playSfx('remove');
    drawQueue();
    updateControls();
  });

  runBtn.addEventListener('click', () => {
    if (local.running || local.commands.length === 0) return;
    local.running = true;
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
      onDone: (result) => {
        local.running = false;
        local.activeIndex = -1;
        drawQueue();
        updateControls();
        if (result.reachedGoal) {
          logEvent('clear', {});
          playSfx('clear');
          lessonCleared = true;
          resultEl.dataset.result = 'clear';
          resultEl.appendChild(createClearReaction());
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        } else {
          resultEl.appendChild(
            createPrimaryButton(
              'もういちど',
              () => {
                logEvent('retry', {});
                resultEl.innerHTML = '';
                drawBoard(spec.start);
              },
              'retry'
            )
          );
        }
      },
    });
  });

  drawBoard(spec.start);
  drawQueue();
  updateControls();
}
