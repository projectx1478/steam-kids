// ステップ切替（intro/predict/play/summary）、実行アニメーション、ふりがなトグル。
import { S, currentStep } from './state.js';
import { logEvent } from './events.js';
import { simulate } from './engine-grid.js';
import { renderGrid, prefersReducedMotion, shapeSvg } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, COMMAND_LABELS, vibrate, arrowSvg } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto, refreshRubyText } from './text-render.js';

const STEP_DELAY_MS = 600;
const STEP_TRANSITION_MS = 220;
const STEP_SLIDE_PX = 24;
// チュートリアル（tutorial）のお手本列・現在操作対象を光らせる共通クラス（Issue #81）。
const GUIDE_GLOW_CLASSES = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];

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
    refreshRubyText(S.readingLevel, S.furigana);
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

// ステップ進行ドット。数＝S.lesson.steps.length、現在位置のみdata-current。
function renderStepDots(root) {
  const dots = document.createElement('div');
  dots.className = 'step-dots flex justify-center gap-1 mb-2';
  S.lesson.steps.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'step-dot w-2 h-2 rounded-full bg-slate-200';
    if (i === S.stepIndex) {
      dot.dataset.current = 'true';
      dot.classList.add('bg-sky-500');
    }
    dots.appendChild(dot);
  });
  root.appendChild(dots);
}

// ステップ遷移の横スライド。reduced-motion時は即表示（Issue #57）。
function applyStepTransition(root) {
  if (prefersReducedMotion()) return;
  root.style.transition = 'none';
  root.style.transform = `translateX(${STEP_SLIDE_PX}px)`;
  root.style.opacity = '0';
  requestAnimationFrame(() => {
    root.style.transition = `transform ${STEP_TRANSITION_MS}ms ease, opacity ${STEP_TRANSITION_MS}ms ease`;
    root.style.transform = 'translateX(0)';
    root.style.opacity = '1';
  });
}

function renderStep() {
  const step = currentStep();
  const root = stage();
  root.innerHTML = '';
  root.dataset.step = step.kind;
  root.dataset.stepId = step.stepId;

  renderStepDots(root);
  if (step.kind === 'intro') renderIntro(root, step);
  else if (step.kind === 'predict') renderPredict(root, step);
  else if (step.kind === 'play') renderPlay(root, step);
  else if (step.kind === 'tutorial') renderPlay(root, step, { guide: step.script });
  else if (step.kind === 'summary') renderSummary(root, step);
  applyStepTransition(root);
}

function createPrimaryButton(label, onClick, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'primary-btn block mx-auto min-w-[48px] min-h-[48px] px-6 py-3 mt-4 rounded-xl bg-sky-500 text-white text-lg transition-transform duration-100 active:scale-95';
  if (action) btn.dataset.action = action;
  btn.textContent = label;
  btn.addEventListener('click', () => {
    vibrate();
    onClick();
  });
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
function playAnimation(commands, spec, view, { onTick, onDone, onPickup }) {
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
    result.pickups[i].forEach((idx) => {
      view.collectItem(spec.items[idx]);
      playSfx('pickup');
      onPickup?.(idx);
    });
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
  renderInto(p, step.text, S.readingLevel, S.furigana);
  root.appendChild(p);
  root.appendChild(createPrimaryButton('はじめる', () => goToStep(S.stepIndex + 1), 'start'));
}

function renderSummary(root, step) {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  renderInto(p, step.text, S.readingLevel, S.furigana);
  root.appendChild(p);
  root.appendChild(
    createPrimaryButton('ほかのレッスンへ', () => (location.href = './index.html'), 'back-to-picker')
  );
}

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

function renderPredict(root, step) {
  const spec = getPlaySpec();

  const prompt = document.createElement('p');
  prompt.className = 'text-xl text-center mb-2';
  renderInto(prompt, step.text, S.readingLevel, S.furigana);
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

// guide（tutorial用・任意）: [{tap: 'up'|'down'|'left'|'right'|'run'}]。指定時は現在の
// tap対象だけ操作可・光らせ、他は無効化する（なぞり操作型チュートリアル。Issue #81）。
// 文字を読ませない方針のため指示文はstep.textがある時のみ表示（既定文言へのフォールバックはしない）。
// run/undo/retry/clearのlogEventは行わない（チュートリアル完走で単元スタンプが付くのを防ぐ）。
function renderPlay(root, step, { guide = null } = {}) {
  const spec = { grid: step.grid, start: step.start, goal: step.goal, walls: step.walls, items: step.items ?? [] };
  const local = {
    // initialCommandsがあれば「ずれた」命令列を最初から積んでおく（なおす系レッスン用）。
    commands: (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 })),
    activeIndex: -1,
    running: false,
    view: null,
    guideIndex: 0,
  };

  if (!guide) {
    const prompt = document.createElement('p');
    prompt.className = 'text-xl text-center mb-2';
    const defaultText =
      spec.items.length > 0 ? 'どんぐりを ぜんぶ とって ゴール' : 'ロボットを ゴールへ うごかそう';
    renderInto(prompt, step.text ?? defaultText, S.readingLevel, S.furigana);
    root.appendChild(prompt);
  } else if (step.text) {
    const prompt = document.createElement('p');
    prompt.className = 'text-xl text-center mb-2';
    renderInto(prompt, step.text, S.readingLevel, S.furigana);
    root.appendChild(prompt);
  }

  // もくひょう行：ゴール（旗）とitems有時の残数（Issue #80）。
  const objectiveRow = document.createElement('div');
  objectiveRow.className = 'objective-row flex justify-center items-center gap-4 mb-2 text-sm font-bold text-slate-700';
  objectiveRow.innerHTML = `<span class="inline-flex items-center gap-1"><span class="inline-block w-5 h-5">${shapeSvg('flag')}</span>ゴール</span>`;
  let remainingEl = null;
  if (spec.items.length > 0) {
    const itemBadge = document.createElement('span');
    itemBadge.className = 'inline-flex items-center gap-1';
    itemBadge.innerHTML = `<span class="inline-block w-5 h-5">${shapeSvg('item')}</span>のこり `;
    remainingEl = document.createElement('span');
    remainingEl.dataset.remaining = '';
    itemBadge.appendChild(remainingEl);
    objectiveRow.appendChild(itemBadge);
  }
  root.appendChild(objectiveRow);

  // お手本列（guide時のみ）。実物ボタンと同じ見た目（色・矢印SVG）で手順を示し、
  // 文言は使わない（Issue #81）。タップ不可（pointer-events-none）。
  let guideRowEl = null;
  if (guide) {
    guideRowEl = document.createElement('div');
    guideRowEl.className = 'guide-row flex justify-center gap-2 mb-2';
    guideRowEl.setAttribute('aria-hidden', 'true');
    guide.forEach((entry, i) => {
      const el = document.createElement('span');
      el.dataset.guideIndex = String(i);
      el.dataset.state = 'todo';
      const isRun = entry.tap === 'run';
      el.className = `guide-step relative inline-flex items-center justify-center h-10 rounded-lg pointer-events-none ${
        isRun ? 'px-3 bg-emerald-500 text-white text-sm font-bold' : 'w-10 bg-sky-500 text-white'
      }`;
      if (isRun) el.textContent = 'じっこう';
      else el.innerHTML = arrowSvg(entry.tap);
      const check = document.createElement('span');
      check.className =
        'guide-check hidden absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-xs flex items-center justify-center';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      el.appendChild(check);
      guideRowEl.appendChild(el);
    });
    root.appendChild(guideRowEl);
  }

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

  // guide時は「ぜんぶけす」を出さない（お手本通りに進めるだけで、消す操作は不要。Issue #81）。
  let clearBtn = null;
  if (!guide) {
    clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.dataset.action = 'clear-all';
    clearBtn.textContent = 'ぜんぶけす';
    clearBtn.className =
      'min-w-[48px] min-h-[48px] px-3 rounded-lg bg-slate-200 transition-transform duration-100 active:scale-95 disabled:opacity-40';
    actionsEl.appendChild(clearBtn);
  }

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = 'じっこう';
  runBtn.className =
    'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-emerald-500 text-white transition-transform duration-100 active:scale-95 disabled:opacity-40';
  actionsEl.appendChild(runBtn);

  const resultEl = document.createElement('div');
  resultEl.className = 'text-center mt-2';
  controls.appendChild(resultEl);

  // 静的な盤面の再構築。アニメーション中には呼ばない（プレイヤー駒はview経由で差分更新する）。
  // 実行開始・もういちど双方でここを通るため、のこり表示の初期値リセットも兼ねる。
  function drawBoard(playerPos) {
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({
      grid: spec.grid,
      walls: spec.walls,
      goal: spec.goal,
      items: spec.items,
      playerPos,
      labels: [],
      markers: [],
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
      removable: !guide,
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

  function guideTarget() {
    return guide?.[local.guideIndex]?.tap ?? null;
  }

  // guide時のパレット・じっこう・お手本列の状態更新。現在のtap対象だけ有効化して光らせ、
  // 他は無効化する。お手本列は済み(done)/現在(current)/未(todo)を色・チェックで示す（Issue #81）。
  function applyGuide() {
    const target = guideTarget();
    paletteEl.querySelectorAll('button').forEach((b) => {
      const isTarget = b.dataset.command === target;
      b.disabled = local.running || !isTarget;
      if (isTarget) {
        b.dataset.guide = 'true';
        b.classList.add(...GUIDE_GLOW_CLASSES);
      } else {
        delete b.dataset.guide;
        b.classList.remove(...GUIDE_GLOW_CLASSES);
      }
    });
    const runIsTarget = target === 'run';
    runBtn.disabled = local.running || !runIsTarget;
    if (runIsTarget) {
      runBtn.dataset.guide = 'true';
      runBtn.classList.add(...GUIDE_GLOW_CLASSES);
    } else {
      delete runBtn.dataset.guide;
      runBtn.classList.remove(...GUIDE_GLOW_CLASSES);
    }
    if (guideRowEl) {
      guideRowEl.querySelectorAll('[data-guide-index]').forEach((el) => {
        const i = Number(el.dataset.guideIndex);
        const state = i < local.guideIndex ? 'done' : i === local.guideIndex ? 'current' : 'todo';
        el.dataset.state = state;
        el.classList.remove(...GUIDE_GLOW_CLASSES, 'opacity-40');
        el.querySelector('.guide-check').classList.toggle('hidden', state !== 'done');
        if (state === 'current') el.classList.add(...GUIDE_GLOW_CLASSES);
        if (state === 'done') el.classList.add('opacity-40');
      });
    }
  }

  function updateControls() {
    if (guide) {
      applyGuide();
      return;
    }
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
      if (guide) {
        if (dir !== guideTarget()) return;
        local.commands.push({ dir, times: 1 });
        playSfx('tap');
        local.guideIndex += 1;
        drawQueue();
        updateControls();
        return;
      }
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

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (local.running || local.commands.length === 0) return;
      vibrate();
      logEvent('undo', { all: true, commandCount: local.commands.length });
      local.commands = [];
      playSfx('remove');
      drawQueue();
      updateControls();
    });
  }

  runBtn.addEventListener('click', () => {
    if (local.running || local.commands.length === 0) return;
    if (guide && guideTarget() !== 'run') return;
    vibrate();
    if (guide) local.guideIndex += 1;
    local.running = true;
    resultEl.innerHTML = '';
    delete resultEl.dataset.result;
    if (!guide) logEvent('run', { commandCount: local.commands.length });
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
          if (!guide) logEvent('clear', {});
          playSfx('clear');
          local.view.confetti();
          if (!guide) lessonCleared = true;
          resultEl.dataset.result = 'clear';
          resultEl.appendChild(createClearReaction());
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        } else {
          resultEl.appendChild(
            createPrimaryButton(
              'もういちど',
              () => {
                if (!guide) logEvent('retry', {});
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
