// playステップ（盤面・矢印ボタン・並んだ命令・じっこう）の描画。課題カードは廃止し、
// 操作画面に直接入る。説明は「れんしゅう」画面と指ガイドで行う（Issue #97。旧仕様はIssue #93）。
// 画面上部の問い文スロットは、実行結果（やったね／ヒント）を数秒だけトースト表示する場所も兼ねる。
import { S } from './state.js';
import { boardSpec, isRunCleared, judgeOptimal, shortestOfStep } from './engine-grid.js';
import { logEvent } from './events.js';
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';
import { fitCellSize, drawBoard as drawBoardUi, observeBoard } from './ui-board.js';
import { createZoom } from './ui-zoom.js';
import { openMenu } from './ui-menu.js';
import { registerKeys } from './ui-keys.js';
import { renderCommandPalette, renderCommandQueue, toggleGhostSlot, computeGapIndex, vibrate, countChips, planRun, clearUnlocked, isLockedIndex, stepsBefore, isPause, setPauseLeft } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { UNDO_CLEAR_MS, snapshotUnlocked, restoreUnlocked } from './undo-clear.js';
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
import { paintMiniBoard } from './gimmicks/paint.js';
import { renderKeyTray, resetKeyTray } from './gimmicks/keys.js';
import { readDraft, writeDraft, clearDraft } from './storage.js';
import { setRetryButton, createRetryChoice, shakeBoard, showStartCue } from './ui-retry.js';

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
  // 下段の順・間隔は sk-screen-actions--play（tailwind.src.css）：ぜんぶけす・１つけす｜32px｜1コマ・じっこう（Issue #549）。
  actionsEl.classList.add('sk-screen-actions--play');
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
  let undoSnap = null;
  let undoTimer = null;
  function dropUndo() {
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;
    undoSnap = null;
    if (undoBtn.parentNode) undoBtn.replaceWith(clearBtn);
  }
  function showUndo(snap) {
    undoSnap = snap;
    undoBar.style.transition = 'none';
    undoBar.style.width = '100%';
    clearBtn.replaceWith(undoBtn);
    // reduced-motion は減り棒を静止（満タンのまま）。5秒たてば札ごと消える。
    if (!prefersReducedMotion()) {
      void undoBar.offsetWidth;
      undoBar.style.transition = `width ${UNDO_CLEAR_MS}ms linear`;
      undoBar.style.width = '0%';
    }
    undoTimer = setTimeout(() => {
      undoTimer = null;
      dropUndo();
      updateControls();
    }, UNDO_CLEAR_MS);
  }

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

  // クリア時はつぎへ・ためしなおす（レッスン再挑戦）を通常アクション行に差し替えて表示する
  // （盤面上に重ねない。Issue #97）。
  function showNormalActions() {
    dropUndo();
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.appendChild(clearBtn);
    actionsEl.appendChild(removeLastBtn);
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
    syncAcornTray();
    resetKeyTray(keyTrayEl);
  }

  // saveDraft(): 命令列を変える全ての入口から呼ぶ、下書き保存の唯一の入口（Issue #556）。
  // 実行中は命令列が変わらないので、再読込しても実行前の列が残る。空の箱は保存しない。
  function saveDraft() {
    local.failMark = -1; // 列が動いたら、失敗の強調（添字）は外す（#545）
    if (isTrial()) return;
    writeDraft(S.lesson.lessonId, step.stepId, local.commands.filter((c) => !(c.box && c.box.length === 0)));
  }

  // resetToFresh(): 命令列をfreshCommands（なおす系は初期の「ずれた」列、それ以外は空）へ戻す。
  // クリア後のreplay・ステージ切替・離れるで呼ぶ。失敗後の「ためしなおす」は命令列を残すので
  // これを呼ばず releaseFailLock を使う（#545。以前は失敗後も必ずこれを呼んでいた。Issue #104）。
  // 参照(S.drafts)は保ったまま中身だけ入れ替える。
  function resetToFresh() {
    dropUndo();
    local.commands.length = 0;
    freshCommands.forEach((c) => local.commands.push({ ...c }));
    local.boxOpen = -1;
    local.lockedCount = 0;
    local.runStates = {};
    S.drafts[step.stepId] = local.commands;
    saveDraft();
    local.fixOpened = false;
    local.locked = false;
    // 塗りの失敗は結果トーストを出さず resultShown だけ立てる。旧 showRestartCue が戻していた分を、ここで確実に戻す（#497）。
    local.resultShown = false;
  }

  // releaseFailLock(): 失敗後の「ためしなおす」。命令列と失敗の強調（failMark）は残し、
  // resetToFresh と同じ残存状態だけ初期化して編集可へ戻す（#545-9A）。
  function releaseFailLock() {
    dropUndo();
    local.boxOpen = -1;
    local.lockedCount = 0;
    local.runStates = {};
    local.fixOpened = false;
    local.locked = false;
    local.resultShown = false;
  }

  // 失敗後の強調（#545）：最初に外れた命令（info.cmdIndex）の枠。再描画しても付け直す。
  function applyFailMark() {
    if (local.failMark < 0) return;
    queueEl.querySelector(`[data-index="${local.failMark}"]`)?.classList.add('ring-4', 'ring-amber-400', 'sk-cmd-fail');
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

  // 末尾へ寄せる。列が折り返して1行ぶん(72px)しか見えないとき、末尾の空き枠が次の行へ回ると最新のチップが上へ外れるので、
  // 最新のチップが列の中に入るところまで戻す（Issue #615。空き枠が同じ行に残るときはそのまま両方見える）。
  function scrollQueueToEnd() {
    queueEl.scrollLeft = queueEl.scrollWidth;
    queueEl.scrollTop = queueEl.scrollHeight;
    const chips = queueEl.querySelectorAll(':scope > .command-chip');
    const last = chips[chips.length - 1];
    if (!last) return;
    const over = queueEl.getBoundingClientRect().top - last.getBoundingClientRect().top;
    if (over > 0) queueEl.scrollTop -= over;
  }

  // drawQueueFollowActive(): 実行中の再描画。再描画で戻るスクロール位置を復元し、今動いているチップを
  // 列の中央へ寄せる（Issue #393）。scrollIntoViewは使わず、queueElのscrollLeft/scrollTopだけを動かす。
  function drawQueueFollowActive() {
    const left = queueEl.scrollLeft;
    const top = queueEl.scrollTop;
    drawQueue();
    queueEl.scrollLeft = left;
    queueEl.scrollTop = top;
    const chip = queueEl.querySelector('.command-chip[data-active="true"]');
    if (!chip) return;
    const q = queueEl.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const chipX = c.left - q.left + queueEl.scrollLeft;
    const chipY = c.top - q.top + queueEl.scrollTop;
    queueEl.scrollLeft = chipX - (queueEl.clientWidth - c.width) / 2;
    queueEl.scrollTop = chipY - (queueEl.clientHeight - c.height) / 2;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      activeInner: local.activeInner,
      activeRound: local.activeRound,
      openIndex: local.boxOpen,
      removable: true,
      lockedCount: local.lockedCount,
      // 次の空き枠は常に出す（命令の置ける数に上限は無い。#615）。
      nextSlot: countChips(local.commands) + 1,
      onRemove: (i) => {
        if (local.running || local.stepping || local.locked || isLockedIndex(i, local.lockedCount)) return;
        if (isFix) local.fixOpened = true;
        local.commands.splice(i, 1);
        if (i === local.boxOpen) local.boxOpen = -1;
        else if (i < local.boxOpen) local.boxOpen -= 1;
        saveDraft();
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
        local.nudge?.poke();
      },
    });
    applyFailMark();
  }

  function updateControls() {
    // 取り消し札は、命令列が消した直後の状態から動いた（追加・実行・1コマなど）時点で破棄する。
    if (undoSnap && (local.commands.length !== local.lockedCount || local.running || local.stepping || local.locked)) dropUndo();
    paletteEl.querySelectorAll('button:not([data-action="menu"])').forEach((b) => {
      b.disabled = local.running || local.stepping || local.locked;
    });
    // 「とめる」：残り回数が0なら無効。maxCommandsには数えないので、上限に達していても置ける（#395 段3）。
    const pausesLeft = maxPauses - local.commands.filter(isPause).length;
    const pauseBtn = paletteEl.querySelector('[data-action="pause"]');
    if (pauseBtn) pauseBtn.disabled = pausesLeft <= 0 || local.boxOpen >= 0 || local.running || local.stepping || local.locked;
    setPauseLeft(paletteEl, Math.max(0, pausesLeft));
    const isRetry = runBtn.dataset.action === 'retry';
    const hasEmptyBox = local.commands.some((c) => c.box && c.box.length === 0);
    runBtn.disabled = local.running || local.runCooldown || (!isRetry && (local.commands.length === 0 || hasEmptyBox));
    if (boxBtn) boxBtn.disabled = local.boxOpen >= 0 || local.running || local.stepping || local.locked;
    drawBoxBar();
    clearBtn.disabled = local.commands.length <= local.lockedCount || local.running || local.stepping || local.locked;
    removeLastBtn.disabled = local.commands.length <= local.lockedCount || local.running || local.stepping || local.locked;
    // 1コマ実行中はタップを続けられるよう有効のままにする。開始条件のみ命令0件で無効化する（Issue #111）。
    stepBtn.disabled = local.running || local.locked || (!local.stepping && local.commands.length === 0);
    // ロック中は命令列自体もぼかし、タップを受け付けないようにする（チップ×の誤タップ防止。Issue #106）。
    queueEl.classList.toggle('opacity-50', local.locked);
    queueEl.classList.toggle('pointer-events-none', local.locked);
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

  // くりかえしの箱：はこ→方向タップで箱に入れる→回数ボタン(2→3→4→2)→とじる（Issue #66）。
  function closeBox() {
    if (local.boxOpen < 0) return;
    // 空の箱は残さない。
    if (local.commands[local.boxOpen].box.length === 0) local.commands.splice(local.boxOpen, 1);
    local.boxOpen = -1;
    saveDraft();
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
    if (local.running || local.stepping || local.locked || local.boxOpen < 0) {
      skipClickSfx();
      return;
    }
    vibrate();
    const box = local.commands[local.boxOpen];
    box.times = box.times >= 4 ? 2 : box.times + 1;
    saveDraft();
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
    if (local.running || local.stepping || local.locked) {
      skipClickSfx();
      return;
    }
    vibrate();
    closeBox();
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
      if (local.running || local.stepping || local.locked || local.boxOpen >= 0) {
        skipClickSfx();
        return;
      }
      vibrate();
      local.commands.push({ box: [], times: 2 });
      local.boxOpen = local.commands.length - 1;
      saveDraft();
      drawQueue();
      scrollQueueToEnd();
      updateControls();
      local.nudge?.poke();
    });
    paletteEl.appendChild(boxBtn);
  }

  removeLastBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.commands.length <= local.lockedCount) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    const i = local.commands.length - 1;
    const last = local.commands[i];
    if (last.box) {
      // 開いている箱は中の最後の1個、閉じた箱は箱ごと消す。空になった箱も消す。
      if (local.boxOpen === i && last.box.length > 0) last.box.pop();
      else local.commands.splice(i, 1);
      if (local.boxOpen === i && !local.commands[i]) local.boxOpen = -1;
      saveDraft();
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
    saveDraft();
    logEvent('undo', { index: i });
    playSfx('remove');
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

  clearBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.commands.length <= local.lockedCount) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    logEvent('undo', { all: true, commandCount: local.commands.length - local.lockedCount });
    // 参照を維持したまま空にする（S.drafts[step.stepId]との共有を切らないため。Issue #95）。
    // 止まった間は後ろだけ消す（前の部分は変更不可。#395 段2）。
    const snap = snapshotUnlocked(local.commands, local.lockedCount);
    clearUnlocked(local.commands, local.lockedCount);
    local.boxOpen = -1;
    saveDraft();
    playSfx('reset');
    drawQueue();
    showUndo(snap);
    updateControls();
    local.nudge?.poke();
  });

  undoBtn.addEventListener('click', () => {
    if (!undoSnap || local.running || local.stepping || local.locked) {
      skipClickSfx();
      return;
    }
    vibrate();
    // 同じ配列へ戻す（S.drafts[step.stepId]との共有参照を保つ）。
    restoreUnlocked(local.commands, undoSnap, local.lockedCount);
    saveDraft();
    dropUndo();
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

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
      clearSequence?.dispose();
      clearSequence = showClearSequence({
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
        local.view.markCell(info.cell, 'wall');
        // 壁衝突は横に倒れる演出で気づかせ、1.2秒後に「ためしなおす」をパルスで強調する（Issue #214）。
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
        if (remainingEl) remainingEl.textContent = String(local.remaining);
        fillNextAcornSlot();
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

  renderQuestion();
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
    add: (dir) => palette.tapDir(dir),
    run: () => {
      if (runBtn.isConnected) runBtn.click();
    },
    removeLast: () => {
      if (removeLastBtn.isConnected) removeLastBtn.click();
    },
    isBlocked: () => local.running || local.stepping || !!clearSequence || menuOpen(),
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
