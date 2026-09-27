// playステップ（命令パレット・実行アニメーション・チュートリアルのguide）の描画。
import { S } from './state.js';
import { logEvent } from './events.js';
import { renderGrid, shapeSvg } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, arrowSvg, vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { renderHowTo, createIdleNudge } from './ui-guide.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveNudge, markLessonCleared } from './ui-step.js';

// チュートリアル（tutorial）のお手本列・現在操作対象を光らせる共通クラス（Issue #81）。
const GUIDE_GLOW_CLASSES = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];

function createClearReaction() {
  const wrap = document.createElement('div');
  wrap.className = 'clear-reaction flex flex-col items-center gap-1';
  wrap.innerHTML = `<svg viewBox="0 0 64 64" class="w-12 h-12" aria-hidden="true">
    <polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24"
      fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
  </svg><p class="text-lg font-bold text-amber-600">やったね</p>`;
  return wrap;
}

// guide（tutorial用・任意）: [{tap: 'up'|'down'|'left'|'right'|'run'}]。指定時は現在の
// tap対象だけ操作可・光らせ、他は無効化する（なぞり操作型チュートリアル。Issue #81）。
// 文字を読ませない方針のため指示文はstep.textがある時のみ表示（既定文言へのフォールバックはしない）。
// run/undo/retry/clearのlogEventは行わない（チュートリアル完走で単元スタンプが付くのを防ぐ）。
export function renderPlay(root, step, { guide = null } = {}) {
  const spec = { grid: step.grid, start: step.start, goal: step.goal, walls: step.walls, items: step.items ?? [] };
  const local = {
    // initialCommandsがあれば「ずれた」命令列を最初から積んでおく（なおす系レッスン用）。
    commands: (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 })),
    activeIndex: -1,
    running: false,
    view: null,
    guideIndex: 0,
    // なおす系（initialCommandsあり）で最初の編集（×・追加・ぜんぶけす）をしたか。
    // やりかた帯の段階・無操作促しの対象を決めるのに使う（Issue #89）。
    fixOpened: false,
  };
  const isFix = (step.initialCommands ?? []).length > 0;

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

  // やりかた帯（guide時以外）。操作の流れをブロック図＋短文で常時表示する（Issue #89）。
  let howto = null;
  let nudge = null;
  if (!guide) {
    howto = renderHowTo(root, isFix ? 'fix' : 'play');
  }

  const layout = document.createElement('div');
  layout.className = 'flex flex-col md:flex-row gap-4 items-center md:items-start justify-center';
  root.appendChild(layout);

  const boardWrap = document.createElement('div');
  boardWrap.className = 'pb-40 md:pb-0';
  layout.appendChild(boardWrap);

  // md未満は画面下に固定する操作パネルにまとめる（盤面が長くても「じっこう」が常に見える。Issue #91）。
  // stickyでは初期スクロール位置によって画面外に出うるため、常時視認できるfixedにする。
  const controls = document.createElement('div');
  controls.className =
    'fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-4 py-3 max-h-[70vh] overflow-y-auto ' +
    'md:static md:inset-auto md:z-auto md:max-h-none md:overflow-visible md:bg-transparent md:border-0 md:px-0 md:py-0 md:w-full md:max-w-xs';
  layout.appendChild(controls);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'flex gap-2 justify-center';
  controls.appendChild(paletteEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue flex flex-nowrap gap-2 overflow-x-auto min-h-[48px] py-1';
  controls.appendChild(queueEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'flex gap-2 justify-center';
  controls.appendChild(actionsEl);

  // guide時は「ぜんぶけす」「ひとつけす」を出さない（お手本通りに進めるだけで、消す操作は不要。Issue #81）。
  let removeLastBtn = null;
  let clearBtn = null;
  if (!guide) {
    removeLastBtn = document.createElement('button');
    removeLastBtn.type = 'button';
    removeLastBtn.dataset.action = 'remove-last';
    removeLastBtn.textContent = '⌫ ひとつ けす';
    removeLastBtn.className =
      'min-w-[48px] min-h-[48px] px-2 rounded-lg bg-slate-200 text-sm transition-transform duration-100 active:scale-95 disabled:opacity-40';
    actionsEl.appendChild(removeLastBtn);

    clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.dataset.action = 'clear-all';
    clearBtn.textContent = 'ぜんぶ けす';
    clearBtn.className =
      'min-w-[48px] min-h-[48px] px-3 rounded-lg bg-slate-200 text-sm transition-transform duration-100 active:scale-95 disabled:opacity-40';
    actionsEl.appendChild(clearBtn);
  }

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ じっこう';
  runBtn.className =
    'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-emerald-500 text-white text-lg font-bold transition-transform duration-100 active:scale-95 disabled:opacity-40';
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

  const resultEl = document.createElement('div');
  resultEl.className = 'text-center mt-2';
  controls.appendChild(resultEl);

  // 失敗後にrunBtnが「もういちど」化した状態で、もういちどを押さず直接キューを編集した場合
  // （例: cmd03のなおす操作）でも[data-action="run"]に戻す。次のrunで盤面はどのみち
  // drawBoard(spec.start)からやり直すため、機能上は編集時に静かに戻すだけでよい。
  function revertRunButtonIfRetrying() {
    if (runBtn.dataset.action === 'retry') setRunButtonMode('run');
  }

  // 無操作時、いまの段階に応じた実物ボタンを促す（8秒後・最大2回。guide時は出さない。Issue #89）。
  if (!guide) {
    nudge = createIdleNudge({
      getTarget: () => {
        const phase = currentPhase();
        if (phase === 0) return [];
        if (phase === 1 && isFix) return [...queueEl.querySelectorAll('.command-remove')];
        if (phase === 3) return [runBtn];
        return [...paletteEl.querySelectorAll('button:not(:disabled)')];
      },
    });
    setActiveNudge(nudge);
  }

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
        revertRunButtonIfRetrying();
        if (isFix) local.fixOpened = true;
        local.commands.splice(i, 1);
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
        nudge?.poke();
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

  // やりかた帯・無操作促しの対象を決める段階（Issue #89）。0=強調なし（実行中・結果表示中）、
  // 1=けす/おす、3=じっこう。なおす系は編集済みか否かのみで1↔3を決める（②は経由しない）。
  function currentPhase() {
    if (local.running || resultEl.childElementCount > 0) return 0;
    if (isFix) return local.fixOpened ? 3 : 1;
    return local.commands.length === 0 ? 1 : 3;
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
    const isRetry = runBtn.dataset.action === 'retry';
    runBtn.disabled = local.running || (!isRetry && local.commands.length === 0);
    clearBtn.disabled = local.commands.length === 0 || local.running;
    removeLastBtn.disabled = local.commands.length === 0 || local.running;
    if (howto) howto.setPhase(currentPhase());
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
      revertRunButtonIfRetrying();
      const last = local.commands.at(-1);
      if (step.groupRepeats && last && last.dir === dir) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        if (local.commands.length >= step.maxCommands) return;
        local.commands.push({ dir, times: 1 });
        playSfx('tap');
      }
      if (isFix) local.fixOpened = true;
      drawQueue();
      updateControls();
      nudge?.poke();
    },
  });

  if (removeLastBtn) {
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
      nudge?.poke();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (local.running || local.commands.length === 0) return;
      vibrate();
      revertRunButtonIfRetrying();
      if (isFix) local.fixOpened = true;
      logEvent('undo', { all: true, commandCount: local.commands.length });
      local.commands = [];
      playSfx('remove');
      drawQueue();
      updateControls();
      nudge?.poke();
    });
  }

  runBtn.addEventListener('click', () => {
    if (runBtn.dataset.action === 'retry') {
      vibrate();
      if (!guide) logEvent('retry', {});
      resultEl.innerHTML = '';
      delete resultEl.dataset.result;
      setRunButtonMode('run');
      drawBoard(spec.start);
      updateControls();
      nudge?.poke();
      return;
    }
    if (local.running || local.commands.length === 0) return;
    if (guide && guideTarget() !== 'run') return;
    vibrate();
    if (guide) local.guideIndex += 1;
    local.running = true;
    nudge?.stop();
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
          if (!guide) markLessonCleared();
          resultEl.dataset.result = 'clear';
          resultEl.appendChild(createClearReaction());
          resultEl.appendChild(createPrimaryButton('つぎへ', () => goToStep(S.stepIndex + 1), 'next'));
        } else {
          setRunButtonMode('retry');
          updateControls();
        }
        if (howto) howto.setPhase(0);
      },
    });
  });

  drawBoard(spec.start);
  drawQueue();
  updateControls();
}
