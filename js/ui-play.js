// playステップ（盤面・矢印ボタン・並んだ命令・じっこう）の描画。課題カードは廃止し、
// 操作画面に直接入る。説明は「れんしゅう」画面と指ガイドで行う（Issue #97。旧仕様はIssue #93）。
// 画面上部の問い文スロットは、実行結果（やったね／ヒント）を数秒だけトースト表示する場所も兼ねる。
import { S } from './state.js';
import { boardSpec, chipCount, isRunCleared } from './engine-grid.js';
import { logEvent } from './events.js';
import { renderGrid, shapeSvg, computeCellSize, splitMaxCell, prefersReducedMotion } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, toggleGhostSlot, vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { createIdleNudge } from './ui-guide.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import {
  goToStep,
  playAnimation,
  createStepper,
  autoAdvance,
  setBackDisabled,
  setActiveNudge,
  setActiveHandHint,
  setActiveAnimation,
} from './ui-step.js';
import { showHint, diagnose } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { paintMiniBoard } from './gimmicks/paint.js';
import { clearToast } from './ui-toast.js';
import { setRetryButton, shakeBoard, showRestartCue as showRestartCueUi } from './ui-retry.js';

// diagnose()の原因ごとの文言（20字以内・否定語なし。Issue #91）。
const HINT_MESSAGE = {
  wall: 'この めいれいで かべに ぶつかったよ',
  items: 'どんぐりが まだ のこって いるよ',
  goal: 'ゴールまで あと すこし',
  periodic: 'ドアが しまって いたよ',
};
const FAR_GOAL_MESSAGE = 'ほかの みちも ためして みよう';
const NEAR_GOAL_DISTANCE = 2;
// 壁衝突の失敗後、「もういちど」をパルスで強調するまでの待ち（Issue #214）。
const RETRY_PULSE_DELAY_MS = 1200;

export function renderPlay(root, step) {
  const spec = boardSpec(step);
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
    activeInner: -1,
    // 実行中の箱の周回（0始まり。-1＝実行外。周回の点表示用。Issue #167）。
    activeRound: -1,
    // 編集中（開いている）くりかえしの箱のindex。-1=閉じている（Issue #66）。
    boxOpen: -1,
    running: false,
    // 「1コマ」ボタンでの手動実行中。running(自動実行)とは別に持ち、じっこう途中合流で
    // running=trueへ切り替える（Issue #111）。
    stepping: false,
    stepper: null,
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

  // 画面の枠は共通部品（js/ui-screen.js。Issue #343）。問い文スロット（statusBar＝questionEl）には
  // 実行結果もここへ数秒だけトースト表示する（Issue #97）。
  const screen = createOpScreen({ root, question: step.text ?? defaultText });
  const { frame: opScreen, questionEl: statusBar, boardArea, panel: controls, actions: actionsEl } = screen;

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
    screen.renderQuestion();
    if (spec.paint) statusBar.appendChild(paintMiniBoard(spec));
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

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'palette-row flex gap-2 justify-center';
  controls.insertBefore(paletteEl, actionsEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue command-tray flex flex-nowrap items-center gap-2 overflow-x-auto min-h-[64px] py-1';
  controls.insertBefore(queueEl, actionsEl);

  const removeLastBtn = document.createElement('button');
  removeLastBtn.type = 'button';
  removeLastBtn.dataset.action = 'remove-last';
  // 360px幅で4ボタン（けす・ぜんぶ・1コマ・じっこう）を1行に収めるため短縮する（Issue #111）。
  removeLastBtn.textContent = '⌫ けす';
  removeLastBtn.className =
    'min-w-[64px] min-h-[64px] px-2 rounded-lg bg-slate-200 text-sm whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset.action = 'clear-all';
  clearBtn.textContent = 'ぜんぶ';
  clearBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-200 text-sm whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  // stepBtn: 1コマずつ実行（タップごとにstepper.advance()を1回呼ぶ。Issue #111）。
  const stepBtn = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.dataset.action = 'step';
  stepBtn.textContent = '👣 1コマ';
  stepBtn.className =
    'btn-tactile px-3 bg-sky-500 text-white text-sm font-bold whitespace-nowrap break-keep disabled:opacity-40';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ じっこう';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';

  // 実行が失敗したらrunBtn自体を橙色の「もういちど」に変える（目線を動かさずに押せる。Issue #91）。
  // 他のボタンをロックする間、押せるのはこれだけなのでパルス枠で目立たせる（Issue #106）。
  const RETRY_EMPHASIS_CLASSES = ['ring-4', 'ring-amber-300', 'ring-offset-2', 'motion-safe:animate-pulse'];
  // 壁衝突で付ける「もういちど」のパルス強調（retry-pulse。scale 1→1.08→1を2回。tailwind.src.css
  // 側はreduced-motionでは定義されない。Issue #214）。retry押下・モード遷移で未発火のタイマーは
  // 止めてクラスも外す。
  let retryPulseTimer = null;
  function pulseRetryButton() {
    retryPulseTimer = null;
    if (prefersReducedMotion()) return;
    if (runBtn.dataset.action !== 'retry') return;
    runBtn.classList.remove('retry-pulse');
    void runBtn.offsetWidth;
    runBtn.classList.add('retry-pulse');
    runBtn.addEventListener('animationend', () => runBtn.classList.remove('retry-pulse'), { once: true });
  }
  function setRunButtonMode(mode) {
    setRetryButton(runBtn, mode, { runLabel: '▶ じっこう', emphasis: RETRY_EMPHASIS_CLASSES });
  }

  // クリア時はつぎへ・もういちど（レッスン再挑戦）を通常アクション行に差し替えて表示する
  // （盤面上に重ねない。Issue #97）。
  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.appendChild(removeLastBtn);
    actionsEl.appendChild(clearBtn);
    actionsEl.appendChild(stepBtn);
    actionsEl.appendChild(runBtn);
  }

  function showResultActions(buttons) {
    actionsEl.innerHTML = '';
    buttons.forEach((b) => actionsEl.appendChild(b));
  }

  // クリア演出（星→間→結果ダイアログ。Issue #336・#340・#342）は js/ui-clear.js の共通部品に任せる。
  // 返り値の dispose() で間のタイマー・ダイアログ・空き枠を片付ける。
  let clearSequence = null;

  // triggerFailFeedback(): 不正解時の視覚・聴覚フィードバック。派手な✕・警告音ではなく、
  // 盤面をやさしくゆらすアニメーションと効果音（未到達はtryAgain・取り残しはitemsLeft）で
  // 気づかせる（Issue #106・#158）。
  // reduced-motion時はゆらさず、盤面に0.5秒だけ枠を光らせて静止のまま気づけるようにする。
  // あわせて盤面のマスだけを暗くし（view.dim）、失敗リザルト状態を再スタート状態と
  // 見た目で区別する（もういちどのdrawBoard()が新しいview（dimは初期値=暗くなし）を
  // 作り直すため、明示的なdim(false)呼び出しは不要。Issue #110）。
  function triggerFailFeedback(reason) {
    playSfx(reason === 'items' ? 'itemsLeft' : 'tryAgain');
    local.view.dim(true);
    shakeBoard(boardArea);
  }

  // showRestartCue(): 盤面を作り直した直後（もういちど＝失敗後のretry・クリア後のreplay共通）に
  // 「スタート！」を1秒だけ問い文スロットへ表示し、再スタート状態を明確に伝える（Issue #110）。
  // 表示は js/ui-retry.js の共通部品に任せる（Issue #344）。
  function showRestartCue() {
    local.resultShown = true;
    showRestartCueUi(statusBar, { restore: () => clearResult() });
  }

  // やりかた帯・無操作促しの対象を決める段階（Issue #89）。0=強調なし（実行中・結果表示中）、
  // 1=けす/おす、3=じっこう。なおす系は編集済みか否かのみで1↔3を決める（②は経由しない）。
  // ロック中（不正解でもういちど待ち）は常に3（じっこうボタン＝もういちど）を対象にする（Issue #106）。
  function currentPhase() {
    if (local.running || local.stepping || local.resultShown) return 0;
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
      maxCell: splitMaxCell(),
    });
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({
      grid: spec.grid,
      walls: spec.walls,
      goal: spec.goal,
      items: spec.items,
      ice: spec.ice,
      cushion: spec.cushion,
      keys: spec.keys,
      doors: spec.doors,
      switches: spec.switches,
      paint: spec.paint,
      periodic: spec.periodic,
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
    local.boxOpen = -1;
    S.drafts[step.stepId] = local.commands;
    local.fixOpened = false;
    local.locked = false;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      activeInner: local.activeInner,
      activeRound: local.activeRound,
      openIndex: local.boxOpen,
      removable: true,
      // 上限に達したら次の枠は出さない（Issue #110）。
      nextSlot: chipCount(local.commands) < step.maxCommands ? chipCount(local.commands) + 1 : null,
      onRemove: (i) => {
        if (local.running || local.stepping || local.locked) return;
        if (isFix) local.fixOpened = true;
        local.commands.splice(i, 1);
        if (i === local.boxOpen) local.boxOpen = -1;
        else if (i < local.boxOpen) local.boxOpen -= 1;
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
        local.nudge?.poke();
      },
    });
  }

  function updateControls() {
    const atMax = chipCount(local.commands) >= step.maxCommands;
    paletteEl.querySelectorAll('button').forEach((b) => {
      b.disabled = atMax || local.running || local.stepping || local.locked;
    });
    const isRetry = runBtn.dataset.action === 'retry';
    const hasEmptyBox = local.commands.some((c) => c.box && c.box.length === 0);
    runBtn.disabled = local.running || (!isRetry && (local.commands.length === 0 || hasEmptyBox));
    if (boxBtn) boxBtn.disabled = atMax || local.boxOpen >= 0 || local.running || local.stepping || local.locked;
    drawBoxBar();
    clearBtn.disabled = local.commands.length === 0 || local.running || local.stepping || local.locked;
    removeLastBtn.disabled = local.commands.length === 0 || local.running || local.stepping || local.locked;
    // 1コマ実行中はタップを続けられるよう有効のままにする。開始条件のみ命令0件で無効化する（Issue #111）。
    stepBtn.disabled = local.running || local.locked || (!local.stepping && local.commands.length === 0);
    // ロック中は命令列自体もぼかし、タップを受け付けないようにする（チップ×の誤タップ防止。Issue #106）。
    queueEl.classList.toggle('opacity-50', local.locked);
    queueEl.classList.toggle('pointer-events-none', local.locked);
  }

  renderCommandPalette(paletteEl, {
    dropTarget: () => queueEl.getBoundingClientRect(),
    onDragOver: (active) => toggleGhostSlot(queueEl, active),
    onAdd: (dir, { via } = {}) => {
      if (local.running || local.stepping || local.locked) return;
      if (local.boxOpen >= 0) {
        if (chipCount(local.commands) >= step.maxCommands) return;
        local.commands[local.boxOpen].box.push(dir);
        playSfx(via === 'drag' ? 'snap' : 'tap');
        drawQueue();
        queueEl.scrollLeft = queueEl.scrollWidth;
        queueEl.scrollTop = queueEl.scrollHeight;
        updateControls();
        local.nudge?.poke();
        return;
      }
      const last = local.commands.at(-1);
      if (step.groupRepeats && last && last.dir === dir) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        if (chipCount(local.commands) >= step.maxCommands) return;
        local.commands.push({ dir, times: 1 });
        playSfx(via === 'drag' ? 'snap' : 'tap');
      }
      if (isFix) local.fixOpened = true;
      drawQueue();
      // 命令列は横スクロールのため、積みすぎると最新のチップが右にはみ出して見えなくなる。
      // 追加のたびに右端へスクロールし、常に最新チップが見える位置にする（Issue #102）。
      queueEl.scrollLeft = queueEl.scrollWidth;
      queueEl.scrollTop = queueEl.scrollHeight;
      // lastElementChildは使わない（末尾にトレイの次枠(.tray-slot)が付くため。Issue #110）。
      if (via === 'drag') queueEl.querySelectorAll('.command-chip')[local.commands.length - 1]?.classList.add('spring-in');
      updateControls();
      local.nudge?.poke();
    },
  });

  // くりかえしの箱：はこ→方向タップで箱に入れる→回数ボタン(2→3→4→2)→とじる（Issue #66）。
  function closeBox() {
    if (local.boxOpen < 0) return;
    // 空の箱は残さない。
    if (local.commands[local.boxOpen].box.length === 0) local.commands.splice(local.boxOpen, 1);
    local.boxOpen = -1;
  }
  let boxBtn = null;
  let boxActionsShown = false;
  // 箱を開いている間は、操作行を「けす・かいすう・とじる」に差し替える（盤面の高さを削らないため。
  // ぜんぶ・1コマ・じっこうは箱を閉じるまで使えない）。
  const timesBtn = document.createElement('button');
  timesBtn.type = 'button';
  timesBtn.dataset.action = 'box-times';
  timesBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-amber-400 text-white text-sm font-bold whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';
  timesBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.boxOpen < 0) return;
    vibrate();
    const box = local.commands[local.boxOpen];
    box.times = box.times >= 4 ? 2 : box.times + 1;
    playSfx('tap');
    drawQueue();
    updateControls();
  });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.action = 'box-close';
  closeBtn.textContent = 'とじる';
  closeBtn.className =
    'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';
  closeBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked) return;
    vibrate();
    closeBox();
    playSfx('tap');
    drawQueue();
    updateControls();
  });
  function drawBoxBar() {
    if (local.boxOpen < 0) {
      if (boxActionsShown) {
        boxActionsShown = false;
        showNormalActions();
      }
      return;
    }
    timesBtn.textContent = `かいすう ×${local.commands[local.boxOpen].times}`;
    if (boxActionsShown) return;
    boxActionsShown = true;
    showResultActions([removeLastBtn, timesBtn, closeBtn]);
  }
  if (step.repeatBox) {
    boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.dataset.action = 'box-open';
    boxBtn.className =
      'command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-amber-500 text-white disabled:opacity-40';
    boxBtn.innerHTML = '<span class="text-xl leading-none" aria-hidden="true">🔁</span><span class="text-sm whitespace-nowrap">はこ</span>';
    boxBtn.addEventListener('click', () => {
      if (local.running || local.stepping || local.locked || local.boxOpen >= 0) return;
      if (chipCount(local.commands) >= step.maxCommands) return;
      vibrate();
      local.commands.push({ box: [], times: 2 });
      local.boxOpen = local.commands.length - 1;
      playSfx('tap');
      drawQueue();
      queueEl.scrollLeft = queueEl.scrollWidth;
      queueEl.scrollTop = queueEl.scrollHeight;
      updateControls();
      local.nudge?.poke();
    });
    paletteEl.appendChild(boxBtn);
  }

  removeLastBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.commands.length === 0) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    const i = local.commands.length - 1;
    const last = local.commands[i];
    if (last.box) {
      // 開いている箱は中の最後の1個、閉じた箱は箱ごと消す。空になった箱も消す。
      if (local.boxOpen === i && last.box.length > 0) last.box.pop();
      else local.commands.splice(i, 1);
      if (local.boxOpen === i && !local.commands[i]) local.boxOpen = -1;
      logEvent('undo', { index: i });
      playSfx('remove');
      drawQueue();
      updateControls();
      local.nudge?.poke();
      return;
    }
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
    if (local.running || local.stepping || local.locked || local.commands.length === 0) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    logEvent('undo', { all: true, commandCount: local.commands.length });
    // 参照を維持したまま空にする（S.drafts[step.stepId]との共有を切らないため。Issue #95）。
    local.commands.length = 0;
    local.boxOpen = -1;
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

  // playRetryTransition(onDark, onDone): 失敗後のもういちどで全画面の黒幕を挟む（Issue #136）。
  // 暗い間にonDark（盤面の作り直し）を行い、明けてからonDone（スタート！）を呼ぶ。暗転中は
  // 黒幕がタップを遮る。ステップ離脱時はsetActiveAnimation経由のcancelで黒幕ごと消す。
  function playRetryTransition(onDark, onDone) {
    if (prefersReducedMotion()) {
      onDark();
      onDone();
      return;
    }
    const curtain = document.createElement('div');
    curtain.dataset.transition = 'retry';
    curtain.className = 'fixed inset-0 z-40 bg-slate-900 pointer-events-auto';
    curtain.style.opacity = '0';
    curtain.style.transition = 'opacity 250ms ease-in-out';
    document.body.appendChild(curtain);
    void curtain.offsetWidth;
    curtain.style.opacity = '0.85';
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    later(() => onDark(), 250);
    later(() => {
      curtain.style.opacity = '0';
    }, 400);
    later(() => {
      curtain.remove();
      setActiveAnimation(null);
      onDone();
    }, 650);
    setActiveAnimation({
      cancel() {
        timers.forEach(clearTimeout);
        curtain.remove();
      },
    });
  }

  // finishRun(result): じっこう（自動実行）・1コマ実行のどちらが最後の手まで進めても同じ判定を通す
  // （Issue #111）。simulateの結果から成否を判定し、盤面・トースト・つぎへ/もういちどボタンを描く。
  function finishRun(result) {
    local.running = false;
    local.stepping = false;
    local.stepper = null;
    setBackDisabled(false);
    local.activeIndex = -1;
    local.activeInner = -1;
    local.activeRound = -1;
    drawQueue();
    updateControls();
    // 壁にぶつかった手が1つでもあれば、結果としてゴールに着いても正解にしない（Issue #104）。
    if (isRunCleared(result)) {
      delete S.drafts[step.stepId];
      local.resultShown = true;
      // 途中ステージのクリアはstage_clearのみを記録し、レッスン全体のクリア（clear）や
      // 単元スタンプの対象にはしない（Issue #104）。
      recordClear({ isFinal: isFinalStage, stageIndex });
      clearSequence?.dispose();
      clearSequence = showClearSequence({
        statusBar,
        controls,
        lockEl: opScreen,
        host: root,
        gapEl: actionsEl,
        view: local.view,
        restore: clearResult,
        ...(spec.paint ? { label: 'みほんと おなじ！' } : {}),
        primary: isFinalStage
          ? { label: 'つぎへ', action: () => goToStep(S.stepIndex + 1), id: 'next' }
          : { label: 'つぎの ステージ', action: () => goToStep(S.stepIndex + 1), id: 'next-stage' },
        replay,
        ...(isFinalStage ? {} : { heading: 'つぎへ すすもう' }),
        setActiveAnimation,
      });
    } else {
      setRunButtonMode('retry');
      local.locked = true;
      updateControls();
      const info = diagnose(result, local.commands, spec);
      triggerFailFeedback(info.reason);
      if (info.reason === 'wall' || info.reason === 'periodic') {
        queueEl.querySelector(`[data-index="${info.cmdIndex}"]`)?.classList.add('ring-4', 'ring-amber-400');
        local.view.markCell(info.cell, 'wall');
        // 壁衝突は横に倒れる演出で気づかせ、1.2秒後に「もういちど」をパルスで強調する（Issue #214）。
        local.view.fallOver();
        retryPulseTimer = setTimeout(pulseRetryButton, RETRY_PULSE_DELAY_MS);
      } else if (info.reason === 'paint') {
        // 塗りが目標と違う：画面は事実のみ（目標外を塗ったマスの枠。塗り残しは何も出さない。文言のヒントも出さない。Issue #286）。
        info.over.forEach((c) => local.view.markCell(c, 'wall'));
        local.resultShown = true;
        local.view.shrug();
        return;
      } else if (info.reason === 'items') {
        local.view.hintItems(info.remainingItems);
      } else {
        local.view.markCell(info.cell, 'stopped');
        local.view.markCell(spec.goal, 'goal-hint');
      }
      // 壁衝突時は倒れの演出と重なるため首かしげはしない（Issue #214）。
      if (info.reason !== 'wall' && info.reason !== 'periodic') local.view.shrug();
      local.resultShown = true;
      const far = info.reason === 'goal' && info.distance > NEAR_GOAL_DISTANCE;
      showHint(statusBar, { kind: info.reason, message: far ? FAR_GOAL_MESSAGE : HINT_MESSAGE[info.reason], restore: clearResult });
    }
  }

  runBtn.addEventListener('click', () => {
    if (runBtn.dataset.action === 'retry') {
      if (retryPulseTimer) {
        clearTimeout(retryPulseTimer);
        retryPulseTimer = null;
      }
      runBtn.classList.remove('retry-pulse');
      vibrate();
      logEvent('retry', {});
      playRetryTransition(
        () => {
          clearToast(statusBar);
          setRunButtonMode('run');
          resetToFresh();
          drawQueue();
          drawBoard(spec.start);
          updateControls();
        },
        () => {
          local.view.popIn();
          showRestartCue();
          local.nudge?.poke();
        }
      );
      return;
    }
    if (local.running) return;
    // 1コマ実行の途中でじっこうを押したら、進行中のstepperをそのまま残りだけ自動で進める（Issue #111）。
    if (local.stepping && local.stepper) {
      vibrate();
      local.running = true;
      updateControls();
      autoAdvance(local.stepper, { onDone: finishRun });
      return;
    }
    if (local.commands.length === 0) return;
    vibrate();
    closeBox();
    if (local.commands.length === 0) return;
    local.running = true;
    local.nudge?.stop();
    clearToast(statusBar);
    logEvent('run', { commandCount: local.commands.length });
    updateControls();
    drawBoard(spec.start);

    playAnimation(
      local.commands,
      spec,
      local.view,
      {
        onTick: (i, _to, inner, round) => {
          local.activeIndex = i;
          local.activeInner = inner;
          // 周が変わるたびにstack音を鳴らす（2周目以降のみ。1周目は開始音と重なるため。Issue #167）。
          if (round !== local.activeRound) {
            if (round >= 1) playSfx('stack', { count: round + 1 });
            local.activeRound = round;
          }
          drawQueue();
        },
        onPickup: () => {
          local.remaining -= 1;
          if (remainingEl) remainingEl.textContent = String(local.remaining);
          fillNextAcornSlot();
        },
        onDone: finishRun,
      }
    );
  });

  // stepBtn: 1コマずつ実行。タップごとにstepperを1手だけ進める。最初のタップでstepperを
  // 作り、パレット・編集ボタン・←をロックする（じっこうと同じ扱い。Issue #111）。
  stepBtn.addEventListener('click', () => {
    if (local.running || local.locked) return;
    if (!local.stepping && local.commands.length === 0) return;
    vibrate();
    if (!local.stepping) {
      closeBox();
      if (local.commands.length === 0) return;
      local.stepping = true;
      local.nudge?.stop();
      clearToast(statusBar);
      logEvent('run', { commandCount: local.commands.length, mode: 'step' });
      playSfx('run');
      setBackDisabled(true);
      updateControls();
      drawBoard(spec.start);
      local.stepper = createStepper(local.commands, spec, local.view, {
        onTick: (i, _to, inner, round) => {
          local.activeIndex = i;
          local.activeInner = inner;
          // 周が変わるたびにstack音を鳴らす（2周目以降のみ。1周目は開始音と重なるため。Issue #167）。
          if (round !== local.activeRound) {
            if (round >= 1) playSfx('stack', { count: round + 1 });
            local.activeRound = round;
          }
          drawQueue();
        },
        onPickup: () => {
          local.remaining -= 1;
          if (remainingEl) remainingEl.textContent = String(local.remaining);
          fillNextAcornSlot();
        },
      });
    }
    local.stepper.advance();
    if (local.stepper.isDone()) finishRun(local.stepper.result);
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
    // 実行中・結果表示中は盤面状態を保つため再構築しない（Issue #93）。1コマ実行中も同様（Issue #111）。
    if (local.running || local.stepping || local.resultShown) return;
    const next = computeCellSize({
      cols: spec.grid.cols,
      rows: spec.grid.rows,
      width: boardArea.clientWidth,
      height: boardArea.clientHeight,
      maxCell: splitMaxCell(),
    });
    if (next !== local.cellSize) drawBoard(spec.start);
  }).observe(boardArea);
}
