// playステップ（盤面・矢印ボタン・並んだ命令・じっこう）の描画。課題カードは廃止し、
// 操作画面に直接入る。説明は「れんしゅう」画面と指ガイドで行う（Issue #97。旧仕様はIssue #93）。
// 画面上部の問い文スロットは、実行結果（やったね／ヒント）を数秒だけトースト表示する場所も兼ねる。
import { S } from './state.js';
import { boardSpec, isRunCleared, judgeOptimal, shortestOfStep } from './engine-grid.js';
import { logEvent } from './events.js';
import { prefersReducedMotion } from './ui-grid.js';
import { fitCellSize, drawBoard as drawBoardUi, observeBoard } from './ui-board.js';
import { createZoom } from './ui-zoom.js';
import { openMenu } from './ui-menu.js';
import { registerKeys } from './ui-keys.js';
import { renderCommandPalette, toggleGhostSlot, computeGapIndex, vibrate, countChips, planRun, stepsBefore, isPause } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { createIdleNudge } from './ui-guide.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import {
  goToStep,
  createStepper,
  autoAdvance,
  setBackDisabled,
  setActiveNudge,
  setActiveHandHint,
  setActiveAnimation,
} from './ui-step.js';
import { showHint, diagnose, clearResultBubble } from './ui-reaction.js';
import { boardFacts, nextFailHint, nextTapHint, shorterPhrase } from './bird-phrases.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { isTrial, closeTrialTab } from './trial-lesson.js';
import { setupTray } from './ui-play-tray.js';
import { setupQueue, bindEditButtons } from './ui-play-queue.js';
import { renderKeyTray, resetKeyTray } from './gimmicks/keys.js';
import { readDraft, clearDraft } from './storage.js';
import { setRetryButton, createRetryChoice, shakeBoard, showStartCue, dismissStartCue, bindStartCueDismiss } from './ui-retry.js';

// diagnose()の原因ごとの文言（20字以内・否定語なし。Issue #91）。
const HINT_MESSAGE = {
  wall: 'この めいれいで かべに ぶつかったよ',
  items: 'どんぐりが まだ のこって いるよ',
  goal: 'ゴールまで あと すこし',
  periodic: 'ドアが しまって いたよ',
};
// 同じレッスンの失敗回数（メモリのみ。失敗2回目に1回だけ小鳥のヒントを自動で足す。Issue #468 段2・#468-20A）。
const FAIL_COUNTS = new Map();
const AUTO_HINT_AT = 2;
const FAR_GOAL_MESSAGE = 'ほかの みちも ためして みよう';
const NEAR_GOAL_DISTANCE = 2;
// 壁衝突の失敗後、「ためしなおす」をパルスで強調するまでの待ち（Issue #214）。
const RETRY_PULSE_DELAY_MS = 1200;
const RUN_COOLDOWN_MS = 500;

export function renderPlay(root, step) {
  const spec = boardSpec(step);
  const defaultText = spec.items.length > 0 ? 'どんぐりを ぜんぶ とって ゴール' : 'ロボットを ゴールへ うごかそう';
  const isFix = (step.initialCommands ?? []).length > 0;
  // 「とめる」の最大数（省略時0＝「とめる」は出ない。#395）。
  const maxPauses = Number.isInteger(step.maxPauses) && step.maxPauses > 0 ? step.maxPauses : 0;

  // initialCommandsがあれば「ずれた」命令列を最初から積んでおく（なおす系レッスン用）。
  // ためしなおす（失敗時のretry・クリア後のreplay双方）でこの内容へ戻す（Issue #104）ため、
  // 以後書き換えるcommandsとは別の配列として持つ。
  const freshCommands = (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 }));
  // ←で戻って再びこのplayへ進んだ時、命令列の下書き（S.drafts）があれば復元する
  // （確認ダイアログ全廃の代わりの誤タップ対策。以後の追加・削除はこの配列を直接
  // 書き換えるため、参照を共有するだけで自動的に保存される。Issue #95）。
  // メモリに無ければ端末内の保存（再読込・入り直し。Issue #556）から、stepId が一致するときだけ復元する。
  // 壊れた保存は readDraft が null を返すので、黙って空で始まる（文言は出さない）。
  const saved = S.drafts[step.stepId] ? null : readDraft(S.lesson.lessonId);
  // 復元する dir（箱の中身も）は、このステップの allowedCommands に入っているものだけ。外れたら破棄して空で始める。
  const allowedDirs = Array.isArray(step.allowedCommands) ? step.allowedCommands : null;
  const inAllowed = (d) => typeof d === 'string' && (!allowedDirs || allowedDirs.includes(d));
  const dirOk = (c) => c.pause === true || (Array.isArray(c.box) ? c.box.every(inAllowed) : inAllowed(c.dir));
  let restored = saved && saved.stepId === step.stepId && !isTrial() ? saved.commands : null;
  if (restored && !restored.every(dirOk)) {
    clearDraft(S.lesson.lessonId);
    restored = null;
  }
  const commands = S.drafts[step.stepId] ?? restored ?? freshCommands.map((c) => ({ ...c }));
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
    // 「とめる」で止まった間の状態（#395 段2）。lockedCount＝止まった地点より前（「とめる」を含む）の
    // 命令数＝変更不可の個数。0＝最初から。runStates＝止まる前から引き継ぐギミックの作業領域。
    lockedCount: 0,
    pendingPause: -1,
    runStates: {},
    view: null,
    resultShown: false,
    // 失敗後に強調する命令の添字（info.cmdIndex。-1＝なし）と、ためしなおす直後のじっこう無効（#545）。
    failMark: -1,
    runCooldown: false,
    // 不正解でtrueにし、「ためしなおす」以外の操作ボタン・命令チップの取り消しを封じる
    // （思考フローが他ボタンで乱れないようにする。Issue #106）。「ためしなおす」押下でのみ解除。
    locked: false,
    nudge: null,
    remaining: spec.items.length,
    // なおす系（initialCommandsあり）で最初の編集（×・追加・ぜんぶけす）をしたか。
    // 無操作促しの対象を決めるのに使う（Issue #89）。下書き復元時は元の並びと違えば編集済み扱い。
    fixOpened: isFix && JSON.stringify(commands) !== JSON.stringify(freshCommands),
  };

  // 画面の枠は共通部品（js/ui-screen.js。Issue #343）。問い文スロット（statusBar＝questionEl）には
  // 実行結果もここへ数秒だけトースト表示する（Issue #97）。
  const screen = createOpScreen({ root, question: step.text ?? defaultText, stepKey: `${S.lesson.lessonId}:${step.stepId}`, gear: (btn) => { vibrate(); openMenu(btn); } });
  const { frame: opScreen, questionEl: statusBar, boardArea, panel: controls, actions: actionsEl, bird, gearBtn } = screen;
  // 下段の順・間隔は sk-screen-actions--play（tailwind.src.css）：ぜんぶけす・１つけす｜32px｜1コマ・じっこう（Issue #549）。1行4ボタンは 32px。ただし高さ479px以下の横向きは 16px（#635）。
  actionsEl.classList.add('sk-screen-actions--play');
  bindStartCueDismiss(opScreen, boardArea); // 盤面の最初の操作で「スタート！」を消す（Issue #635）
  // 顔アイコンのタップのヒント（Issue #468 段2）。「とめる」のあるステージは「とめる」、失敗後は汎用ヒント。paint盤は汎用ヒントを出さない（#468-14d）。
  const facts = boardFacts(step);
  screen.setHintProvider(() => nextTapHint({ maxPauses, fails: spec.paint ? 0 : FAIL_COUNTS.get(S.lesson.lessonId) ?? 0, facts }));

  // 鍵トレイ行（Issue #391）。carry盤だけ、問い文の行の直下に別行で置く（remote盤・tutorial・demo・predictには出さない）。
  // トースト（問い文の行の差し替え）で消えないよう、questionElの外（兄弟）に置く。
  const keyTrayEl = renderKeyTray(spec);
  if (keyTrayEl) {
    statusBar.after(keyTrayEl);
    opScreen.classList.add('sk-screen-frame--keys');
  }

  // 分割した部品（ui-play-*.js）へ渡す文脈（Issue #663）。変わる共有変数は mut に置き、必ず ctx.mut.x で読み書きする。
  // 関数は ctx.fn へ各 setup が登録する（ファイルをまたぐ呼び出しだけ）。
  const ctx = {
    step, spec, root, isFix, maxPauses, freshCommands, stageIndex, isFinalStage, facts, failCounts: FAIL_COUNTS, local,
    screen, statusBar, boardArea, controls, actionsEl, opScreen, bird, gearBtn, keyTrayEl,
    mut: { remainingEl: null, undoSnap: null, undoTimer: null, clearSequence: null, boxBtn: null, boxActionsShown: false },
    fn: {},
  };
  setupTray(ctx);

  // 結果の吹き出しは自動で消えない（#497）。resultShown だけ約3秒後（または次の操作）に戻す。問い文の行は結果で書き換えないので描き直し不要。
  function clearResult() {
    local.resultShown = false;
  }

  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);
  const zoom = createZoom({ boardArea, boardWrap });

  const paletteEl = document.createElement('div');
  paletteEl.className = 'palette-row flex gap-2 justify-center';
  controls.insertBefore(paletteEl, actionsEl);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue command-tray flex flex-wrap items-center gap-2 portrait:max-h-[72px] overflow-y-auto min-h-[64px] py-1';
  controls.insertBefore(queueEl, actionsEl);

  const removeLastBtn = document.createElement('button');
  removeLastBtn.type = 'button';
  removeLastBtn.dataset.action = 'remove-last';
  // 360px幅で4ボタン（けす・ぜんぶ・1コマ・じっこう）を1行に収めるため短縮する（Issue #111）。
  removeLastBtn.textContent = '１つけす';
  removeLastBtn.className =
    'min-w-[64px] min-h-[64px] px-1 rounded-lg bg-slate-200 text-xs whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset.action = 'clear-all';
  clearBtn.textContent = 'ぜんぶけす';
  clearBtn.className =
    'min-w-[64px] min-h-[64px] px-1 rounded-lg bg-slate-200 text-xs whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';

  // 「ぜんぶけす」の取り消し札（Issue #549）。ぜんぶけす の枠に入れ替わり、減り棒が5秒で縮む。
  // 実行・1コマ・追加・個別削除など命令列が動いたら updateControls が札を破棄する（取り消し不可）。
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.dataset.action = 'undo-clear';
  undoBtn.className =
    'relative overflow-hidden min-w-[64px] min-h-[64px] px-1 rounded-lg bg-amber-300 text-xs font-bold whitespace-normal transition-transform duration-100 active:scale-95';
  const undoLabel = document.createElement('span');
  undoLabel.textContent = '↶ もとに もどす';
  const undoBar = document.createElement('span');
  undoBar.dataset.undoBar = '';
  undoBar.className = 'absolute left-0 bottom-0 h-1.5 bg-amber-600';
  undoBar.style.width = '100%';
  undoBtn.append(undoLabel, undoBar);

  // stepBtn: 1コマずつ実行（タップごとにstepper.advance()を1回呼ぶ。Issue #111）。
  const stepBtn = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.dataset.action = 'step';
  stepBtn.textContent = '👣\n１コマ';
  stepBtn.className =
    'btn-tactile px-1 bg-sky-500 text-white text-sm font-bold whitespace-pre-line leading-tight break-keep disabled:opacity-40';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶\nじっこう';
  runBtn.className = 'btn-tactile px-1 bg-emerald-500 text-white text-sm font-bold whitespace-pre-line leading-tight break-keep disabled:opacity-40';

  // 編集・キュー・取り消し札・箱のバー（ui-play-queue.js。Issue #663 段2）。最初の描画（renderQuestion）より前に呼ぶ。
  Object.assign(ctx, { paletteEl, queueEl, runBtn, clearBtn, removeLastBtn, stepBtn, undoBtn, undoBar });
  setupQueue(ctx);
  const { saveDraft, resetToFresh, releaseFailLock, applyFailMark, scrollQueueToEnd, drawQueue, drawQueueFollowActive, updateControls, closeBox, showNormalActions, showResultActions } = ctx.fn;

  // 実行が失敗したらrunBtn自体を橙色の「ためしなおす」に変える（目線を動かさずに押せる。Issue #91）。
  // 他のボタンをロックする間、押せるのはこれだけなのでパルス枠で目立たせる（Issue #106）。
  const RETRY_EMPHASIS_CLASSES = ['ring-4', 'ring-amber-300', 'ring-offset-2', 'motion-safe:animate-pulse'];
  // 壁衝突で付ける「ためしなおす」のパルス強調（retry-pulse。scale 1→1.08→1を2回。tailwind.src.css
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
    setRetryButton(runBtn, mode, { runLabel: '▶\nじっこう', emphasis: RETRY_EMPHASIS_CLASSES });
    // 「ためしなおす」は6字で、text-sm だと 360px 幅の列からはみ出すため、失敗時だけ text-xs にする。
    runBtn.classList.toggle('text-xs', mode === 'retry');
    runBtn.classList.toggle('text-sm', mode !== 'retry');
  }

  // triggerFailFeedback(): 不正解時の視覚・聴覚フィードバック。派手な✕・警告音ではなく、
  // 盤面をやさしくゆらすアニメーションと効果音（未到達はtryAgain・取り残しはitemsLeft）で
  // 気づかせる（Issue #106・#158）。
  // reduced-motion時はゆらさず、盤面に0.5秒だけ枠を光らせて静止のまま気づけるようにする。
  // あわせて盤面のマスだけを暗くし（view.dim）、失敗リザルト状態を再スタート状態と
  // 見た目で区別する（ためしなおすのdrawBoard()が新しいview（dimは初期値=暗くなし）を
  // 作り直すため、明示的なdim(false)呼び出しは不要。Issue #110）。
  function triggerFailFeedback(reason) {
    playSfx(reason === 'items' ? 'itemsLeft' : 'tryAgain');
    local.view.dim(true);
    shakeBoard(boardArea);
  }

  // やりかた帯・無操作促しの対象を決める段階（Issue #89）。0=強調なし（実行中・結果表示中）、
  // 1=けす/おす、3=じっこう。なおす系は編集済みか否かのみで1↔3を決める（②は経由しない）。
  // ロック中（不正解でためしなおす待ち）は常に3（じっこうボタン＝ためしなおす）を対象にする（Issue #106）。
  function currentPhase() {
    if (local.running || local.stepping || local.resultShown) return 0;
    if (local.locked) return 3;
    if (isFix) return local.fixOpened ? 3 : 1;
    return local.commands.length === 0 ? 1 : 3;
  }

  // 静的な盤面の再構築。アニメーション中には呼ばない（プレイヤー駒はview経由で差分更新する）。
  // 実行開始・ためしなおす双方でここを通るため、のこり表示の初期値リセットも兼ねる。
  function drawBoard(playerPos) {
    local.fit = fitCellSize({ spec, boardArea });
    local.cellSize = local.fit.cellSize;
    const { view } = drawBoardUi({ boardWrap, spec, ...local.fit, playerPos });
    zoom.onDraw({ spec, fit: local.fit, view, playerPos });
    local.view = view;
    local.remaining = spec.items.length;
    ctx.fn.syncAcornTray();
    resetKeyTray(keyTrayEl);
  }

  // ためしなおす・replay の直後は約0.5秒じっこうを受け付けない（連打の取りこぼし防止。reduced-motion でも同じ。#545-8A）。
  let runCooldownTimer = null;
  function startRunCooldown() {
    local.runCooldown = true;
    clearTimeout(runCooldownTimer);
    runCooldownTimer = setTimeout(() => {
      runCooldownTimer = null;
      local.runCooldown = false;
      updateControls();
    }, RUN_COOLDOWN_MS);
  }

  const palette = renderCommandPalette(paletteEl, {
    maxPauses,
    onPause: () => {
      if (local.running || local.stepping || local.locked || local.boxOpen >= 0 || local.commands.filter(isPause).length >= maxPauses) {
        skipClickSfx();
        return;
      }
      local.commands.push({ pause: true });
      saveDraft();
      if (isFix) local.fixOpened = true;
      drawQueue();
      scrollQueueToEnd();
      updateControls();
      local.nudge?.poke();
    },
    dropTarget: () => queueEl.getBoundingClientRect(),
    // 箱が開いているときは箱末尾（=列の末尾の隙間）、止まった前部の手前には入れない（目印もそこへ寄せる）。
    dropGap: (x, y) => (local.boxOpen >= 0 ? local.commands.length : Math.max(computeGapIndex(queueEl, x, y), local.lockedCount)),
    onDragOver: (active, gap) => toggleGhostSlot(queueEl, active, gap),
    onAdd: (dir, { via, index } = {}) => {
      if (local.running || local.stepping || local.locked) {
        skipClickSfx();
        return;
      }
      if (local.boxOpen >= 0) {
        local.commands[local.boxOpen].box.push(dir);
        saveDraft();
        playSfx(via === 'drag' ? 'snap' : 'tap');
        drawQueue();
        scrollQueueToEnd();
        updateControls();
        local.nudge?.poke();
        return;
      }
      // 差し込み（ドラッグで末尾以外の隙間へ。Issue #545）。止まった前部(lockedCount)より前には入れない。
      if (via === 'drag' && typeof index === 'number' && index < local.commands.length) {
        const at = Math.max(index, local.lockedCount);
        const prev = local.commands[at - 1];
        const next = local.commands[at];
        if (step.groupRepeats && at - 1 >= local.lockedCount && prev && prev.dir === dir) {
          prev.times += 1;
          playSfx('stack', { count: prev.times });
        } else if (step.groupRepeats && next && next.dir === dir) {
          next.times += 1;
          playSfx('stack', { count: next.times });
        } else {
          local.commands.splice(at, 0, { dir, times: 1 });
          playSfx('snap');
        }
        saveDraft();
        if (isFix) local.fixOpened = true;
        drawQueue();
        queueEl.querySelector(`.command-chip[data-index="${at}"]`)?.classList.add('spring-in');
        updateControls();
        local.nudge?.poke();
        return;
      }
      const last = local.commands.at(-1);
      if (step.groupRepeats && last && last.dir === dir) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        local.commands.push({ dir, times: 1 });
        playSfx(via === 'drag' ? 'snap' : 'tap');
      }
      saveDraft();
      if (isFix) local.fixOpened = true;
      drawQueue();
      // 命令列は横スクロールのため、積みすぎると最新のチップが右にはみ出して見えなくなる。
      // 追加のたびに右端へスクロールし、常に最新チップが見える位置にする（Issue #102）。
      scrollQueueToEnd();
      // lastElementChildは使わない（末尾にトレイの次枠(.tray-slot)が付くため。Issue #110）。
      if (via === 'drag') queueEl.querySelector(`.command-chip[data-index="${local.commands.length - 1}"]`)?.classList.add('spring-in');
      updateControls();
      local.nudge?.poke();
    },
  });

  bindEditButtons(ctx);

  function replay() {
    showNormalActions();
    clearResultBubble(bird);
    resetToFresh();
    startRunCooldown();
    drawQueue();
    drawBoard(spec.start);
    local.view.popIn();
    updateControls();
    local.nudge?.poke();
  }

  // playRetryTransition(onDark, onDone): 失敗後のためしなおすで全画面の黒幕を挟む（Issue #136）。
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
  // （Issue #111）。simulateの結果から成否を判定し、盤面・トースト・つぎへ/ためしなおすボタンを描く。
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
      clearDraft(S.lesson.lessonId);
      FAIL_COUNTS.delete(S.lesson.lessonId);
      local.resultShown = true;
      // 途中ステージのクリアはstage_clearのみを記録し、レッスン全体のクリア（clear）や
      // 単元スタンプの対象にはしない（Issue #104）。
      // 最短との比較（Issue #491）。算出不能は undefined＝記録も提示もしない。
      const optimal = judgeOptimal(countChips(local.commands), shortestOfStep(step));
      recordClear({ isFinal: isFinalStage, stageIndex, optimal });
      ctx.mut.clearSequence?.dispose();
      ctx.mut.clearSequence = showClearSequence({
        bird,
        controls,
        lockEl: opScreen,
        keepEl: gearBtn,
        host: root,
        gapEl: actionsEl,
        view: local.view,
        restore: clearResult,
        ...(spec.paint ? { label: 'みほんと おなじ！' } : {}),
        primary: isTrial()
          ? { label: 'とじる', action: closeTrialTab, id: 'close' }
          : isFinalStage
          ? { label: 'つぎへ', action: () => goToStep(S.stepIndex + 1), id: 'next' }
          : { label: 'つぎの ステージ', action: () => goToStep(S.stepIndex + 1), id: 'next-stage' },
        replay,
        ...(isFinalStage ? {} : { heading: 'つぎへ すすもう' }),
        ...(optimal === false && !isTrial() ? { afterDialogSay: shorterPhrase() } : {}),
        setActiveAnimation,
      });
    } else {
      // 「とめる」のあるステージは「ためしなおす」の代わりに2ボタン（とちゅうから／さいしょから。#395 段4）。
      if (maxPauses > 0) showRetryChoice();
      else setRunButtonMode('retry');
      local.locked = true;
      updateControls();
      const info = diagnose(result, local.commands, spec);
      triggerFailFeedback(info.reason);
      const failKey = S.lesson.lessonId;
      const fails = (FAIL_COUNTS.get(failKey) ?? 0) + 1;
      FAIL_COUNTS.set(failKey, fails);
      if (info.reason === 'wall' || info.reason === 'periodic') {
        local.failMark = info.cmdIndex;
        applyFailMark();
        // 動かせない球の手（最初にbumpedの手のrolls.stuck）は手前で止まるだけ。倒れも壁の印も出さない（#287。球の震えは ui-step.js）。
        const firstBump = result.bumped.findIndex(Boolean);
        const stuckBall = firstBump >= 0 && result.rolls?.[firstBump]?.stuck === true;
        if (!stuckBall) {
          local.view.markCell(info.cell, 'wall');
          // 壁衝突は横に倒れる演出で気づかせ、1.2秒後に「ためしなおす」をパルスで強調する（Issue #214）。
          local.view.fallOver();
        }
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
      showHint(null, { bird, kind: info.reason, message: far ? FAR_GOAL_MESSAGE : HINT_MESSAGE[info.reason], restore: clearResult, extra: fails === AUTO_HINT_AT && !spec.paint ? nextFailHint(facts) ?? undefined : undefined });
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
          clearResultBubble(bird);
          setRunButtonMode('run');
          releaseFailLock();
          local.runCooldown = true;
          drawQueue();
          drawBoard(spec.start);
          updateControls();
        },
        () => {
          startRunCooldown();
          local.view.popIn();
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
      const cur = local.stepper;
      autoAdvance(cur, { onDone: () => endSegment(cur) });
      return;
    }
    if (local.commands.length === 0) return;
    vibrate();
    closeBox();
    if (local.commands.length === 0) return;
    local.running = true;
    local.nudge?.stop();
    clearResultBubble(bird);
    logEvent('run', { commandCount: local.commands.length });
    updateControls();
    const stepper = beginSegment();
    playSfx('run');
    autoAdvance(stepper, { onDone: () => endSegment(stepper) });
  });

  // beginSegment(): 次の実行区間のstepperを作る。lockedCount=0なら盤面を最初に戻して先頭から、
  // 止まった間(lockedCount>0)は盤面を戻さず、止まった地点から後ろだけを次の「とめる」まで
  // （無ければ最後まで）動かす（#395 段2。「とめる」が無ければ従来どおり先頭から最後まで）。
  // replayTo（任意）：失敗後の「とちゅうから」で、先頭からこの「とめる」の添字まで再生し直して止まる。
  function beginSegment(replayTo = null) {
    const plan =
      replayTo === null
        ? planRun(local.commands, spec, local.lockedCount)
        : { nextPause: replayTo, startIndex: 0, stopIndex: stepsBefore(local.commands, spec, replayTo) };
    if (local.lockedCount === 0 || replayTo !== null) {
      drawBoard(spec.start);
      local.runStates = {};
    }
    local.pendingPause = plan.nextPause;
    local.failMark = -1; // 実行を始めたら失敗の強調は消える（#545）
    local.stepper = createStepper(local.commands, spec, local.view, {
      startIndex: plan.startIndex,
      stopIndex: plan.stopIndex,
      runStates: local.runStates,
      onTick: (i, _to, inner, round) => {
        local.activeIndex = i;
        local.activeInner = inner;
        // 周が変わるたびにstack音を鳴らす（2周目以降のみ。1周目は開始音と重なるため。Issue #167）。
        if (round !== local.activeRound) {
          if (round >= 1) playSfx('stack', { count: round + 1 });
          local.activeRound = round;
        }
        drawQueueFollowActive();
      },
      onPickup: () => {
        local.remaining -= 1;
        if (ctx.mut.remainingEl) ctx.mut.remainingEl.textContent = String(local.remaining);
        ctx.fn.fillNextAcornSlot();
      },
    });
    return local.stepper;
  }

  // endSegment(stepper): 区間の終わり。「とめる」で止まったなら止まった状態へ、そうでなければ判定へ。
  function endSegment(stepper) {
    if (stepper.isPaused()) enterPause();
    else finishRun(stepper.result);
  }

  // enterPause(): 盤面はそのまま、前の部分(「とめる」まで)を変更不可にして、後ろの編集を受け付ける。
  function enterPause() {
    local.running = false;
    local.stepping = false;
    local.stepper = null;
    setBackDisabled(false);
    local.lockedCount = local.pendingPause + 1;
    logEvent('pause', { count: local.commands.filter(isPause).length, index: local.pendingPause });
    local.activeIndex = -1;
    local.activeInner = -1;
    local.activeRound = -1;
    drawQueue();
    updateControls();
    local.nudge?.poke();
  }

  // restartFromStart(): 命令を残したまま盤面だけ最初に戻す（止まった地点→最初から。#395-8A。
  // 段4の「さいしょから」ボタンから呼ぶ）。
  function restartFromStart() {
    if (local.running || local.stepping) return;
    local.lockedCount = 0;
    local.runStates = {};
    local.pendingPause = -1;
    drawBoard(spec.start);
    drawQueue();
    updateControls();
  }
  local.restartFromStart = restartFromStart;

  // showRetryChoice(): 失敗時の2ボタン。止まった地点(lockedCount>0)が無ければ「とちゅうから」はマスク。
  function showRetryChoice() {
    const { resumeBtn, restartBtn } = createRetryChoice({
      canResume: local.lockedCount > 0,
      onResume: resumeFromPause,
      onRestart: restartAfterFail,
    });
    showResultActions([resumeBtn, restartBtn]);
  }

  // leaveFailState(): 失敗の表示（ロック・トースト・2ボタン）を片付けて通常のボタン行へ戻す。
  function leaveFailState() {
    clearResultBubble(bird);
    local.locked = false;
    local.resultShown = false;
    showNormalActions();
  }

  // resumeFromPause(): 失敗後、止まった地点まで盤面を再生し直して止まり、後ろの命令を直せる状態にする（#395-2A）。
  function resumeFromPause() {
    if (local.running || local.stepping || local.lockedCount <= 0) return;
    vibrate();
    const pauseIndex = local.lockedCount - 1;
    logEvent('pause_fix', { pauseIndex, commandCount: local.commands.length - local.lockedCount });
    leaveFailState();
    local.running = true;
    local.nudge?.stop();
    local.runStates = {};
    updateControls();
    const stepper = beginSegment(pauseIndex);
    autoAdvance(stepper, { onDone: () => endSegment(stepper) });
  }

  // restartAfterFail(): 失敗後、命令を残したまま盤面だけ最初に戻す（#395-8A）。
  function restartAfterFail() {
    if (local.running || local.stepping) return;
    vibrate();
    logEvent('retry', { mode: 'restart' });
    playRetryTransition(
      () => {
        leaveFailState();
        restartFromStart();
      },
      () => {
        local.view.popIn();
        local.nudge?.poke();
      }
    );
  }

  // stepBtn: 1コマずつ実行。タップごとにstepperを1手だけ進める。最初のタップでstepperを
  // 作り、パレット・編集ボタン・←をロックする（じっこうと同じ扱い。Issue #111）。
  // 止まった間は止まった地点から後ろを1コマずつ進める。止まる前の部分でも従来どおり使える（#395-6B）。
  stepBtn.addEventListener('click', () => {
    if (local.running || local.locked) return;
    if (!local.stepping && local.commands.length === 0) return;
    vibrate();
    if (!local.stepping) {
      closeBox();
      if (local.commands.length === 0) return;
      local.stepping = true;
      local.nudge?.stop();
      clearResultBubble(bird);
      logEvent('run', { commandCount: local.commands.length, mode: 'step' });
      playSfx('run');
      setBackDisabled(true);
      updateControls();
      beginSegment();
    }
    const cur = local.stepper;
    cur.advance();
    if (cur.isDone() || cur.isPaused()) endSegment(cur);
  });

  ctx.fn.renderQuestion();
  showNormalActions();
  drawBoard(spec.start);
  drawQueue();
  // 下書きから復元した列が横にはみ出すとき、最新（右端）のチップが隠れないよう右端へ寄せる（Issue #102 と同じ意図）。
  // 初期列（なおす系のずれた列など）は先頭から見せるため、初期列より長いときだけ。
  if (local.commands.length > (step.initialCommands?.length ?? 0)) {
    scrollQueueToEnd();
  }
  updateControls();
  showStartCue(boardArea); // ステージ開始時に1回（再開では出さない。#497）
  screen.announceQuestion(); // 問い文の吹き出し。「スタート！」が消えてから出る（#497 段B）
  // 無操作時、いまの段階に応じた実物ボタンを促す（8秒後・最大2回。Issue #89）。
  local.nudge = createIdleNudge({
    getTarget: () => {
      const phase = currentPhase();
      if (phase === 0) return [];
      if (phase === 1 && isFix) return [...queueEl.querySelectorAll('.command-remove')];
      if (phase === 3) return [runBtn];
      return [...paletteEl.querySelectorAll('button:not(:disabled):not([data-action="menu"])')];
    },
  });
  setActiveNudge(local.nudge);
  // キー操作（Issue #380）：矢印＝命令を足す、Enter＝じっこう、Backspace＝ひとつけす。経路はタップと同じ。
  // registerKeys は1画面分だけ持つ（再登録で前を解除）。画面が外れたら（root から opScreen が消えたら）解除する。
  const menuOpen = () =>
    ['gear-menu', 'menu-overlay'].some((id) => document.getElementById(id)?.hidden === false) || !!document.querySelector('[role="dialog"]');
  const offKeys = registerKeys({
    add: (dir) => {
      dismissStartCue(boardArea); // 矢印キーは frame のイベントを通らない（Issue #635）
      palette.tapDir(dir);
    },
    run: () => {
      if (runBtn.isConnected) runBtn.click();
    },
    removeLast: () => {
      dismissStartCue(boardArea);
      if (removeLastBtn.isConnected) removeLastBtn.click();
    },
    isBlocked: () => local.running || local.stepping || !!ctx.mut.clearSequence || menuOpen(),
    getButtons: () => ({
      up: paletteEl.querySelector('[data-command="up"]'),
      down: paletteEl.querySelector('[data-command="down"]'),
      left: paletteEl.querySelector('[data-command="left"]'),
      right: paletteEl.querySelector('[data-command="right"]'),
      run: runBtn.isConnected ? runBtn : { disabled: true },
      removeLast: removeLastBtn.isConnected ? removeLastBtn : { disabled: true },
    }),
  });
  const keyLeaveWatcher = new MutationObserver(() => {
    if (opScreen.isConnected) return;
    offKeys();
    keyLeaveWatcher.disconnect();
  });
  keyLeaveWatcher.observe(root, { childList: true });
  // 未クリアレッスンの最初のステージ（p1）表示時だけ、指ガイドを1回出す。最初のタップ/
  // ドラッグでフェードアウトして消える（Issue #95・#104でp1限定に変更）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    const firstBtn = paletteEl.querySelector('[data-command]');
    if (firstBtn) {
      setActiveHandHint(showHandHint({ from: firstBtn, to: queueEl, mode: 'drag' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
  observeBoard({
    boardArea,
    fit: () => fitCellSize({ spec, boardArea }),
    current: () => local.fit,
    // 実行中・結果表示中は盤面状態を保つため再構築しない（Issue #93）。1コマ実行中も同様（Issue #111）。
    skipWhen: () => local.running || local.stepping || local.resultShown || local.lockedCount > 0,
    redraw: () => drawBoard(spec.start),
  });
}
