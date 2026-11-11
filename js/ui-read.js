// 「めいれいを よむ」面（grid-runtime の play に read があるとき。Issue #723 の試作）。
// 命令列は見るだけ。ロボットが止まるマスを考え、盤面をタップして旗を置き、「じっこう」で確かめる。
// 外したら「よそう」と「けっか」の2マスだけを示し（答えの道は足あとという事実で残る）、
// ためしなおすたびに命令列が次の1本へ替わる（同じ答えを置き直すだけでは通れない）。
// 盤面・命令列・実行アニメ・失敗とクリアの演出は play（ui-play.js）と同じ部品を使う。
import { S } from './state.js';
import { boardSpec, isRunCleared } from './engine-grid.js';
import { fitCellSize, drawBoard as drawBoardUi, observeBoard } from './ui-board.js';
import { openMenu } from './ui-menu.js';
import { renderCommandQueue, vibrate } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { createIdleNudge } from './ui-guide.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, playAnimation, setActiveNudge, setActiveHandHint, setActiveAnimation } from './ui-step.js';
import { clearResultBubble, showHint } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { isTrial, closeTrialTab } from './trial-lesson.js';
import { setRetryButton, shakeBoard, showStartCue, bindStartCueDismiss } from './ui-retry.js';
import { logEvent } from './events.js';

export const READ_TEXT = {
  question: 'ロボットは どこで とまる？',
  miss: 'ロボットは ここで とまったよ',
  tapHint: 'ゆびで ひとつずつ たどって みよう',
};
const RUN_LABEL = '▶\nじっこう';

// 面ごとの「何本目の命令列か」（メモリのみ。入り直しても続きから回す）。
const ROUNDS = new Map();

export function renderRead(root, step) {
  const base = boardSpec(step);
  const programs = step.read.programs;
  const roundKey = `${S.lesson.lessonId}:${step.stepId}`;
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;
  const wallKeys = new Set(base.walls.map((w) => `${w.x},${w.y}`));

  // phase: 'edit'（旗を置く）→ 'running' → 'missed'（ためしなおす待ち）／'cleared'
  const local = { flag: null, phase: 'edit', view: null, fit: null, nudge: null, clearSequence: null };
  const program = () => programs[(ROUNDS.get(roundKey) ?? 0) % programs.length];
  const chips = () => program().map((dir) => ({ dir, times: 1 }));

  const screen = createOpScreen({ root, question: step.text ?? READ_TEXT.question, stepKey: roundKey, gear: (btn) => { vibrate(); openMenu(btn); } });
  const { frame: opScreen, boardArea, panel: controls, actions: actionsEl, bird, gearBtn } = screen;
  actionsEl.classList.add('sk-screen-actions--play');
  bindStartCueDismiss(opScreen, boardArea);
  screen.setHintProvider(() => READ_TEXT.tapHint);
  screen.renderQuestion();

  const boardWrap = document.createElement('div');
  boardWrap.dataset.readBoard = 'true';
  boardArea.appendChild(boardWrap);

  const queueEl = document.createElement('ul');
  // 読む面は命令列がすべて同時に見えていること（スクロールで隠さない）。番号の札が切れないよう上と左を空ける。
  queueEl.className = 'command-queue command-tray flex flex-wrap items-center gap-2 min-h-[64px]';
  queueEl.dataset.readProgram = 'true';
  queueEl.style.padding = '12px 8px 4px 12px';
  controls.insertBefore(queueEl, actionsEl);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = RUN_LABEL;
  runBtn.className = 'btn-tactile px-1 bg-emerald-500 text-white text-sm font-bold whitespace-pre-line leading-tight break-keep disabled:opacity-40';
  actionsEl.appendChild(runBtn);

  function drawQueue(activeIndex = -1) {
    renderCommandQueue(queueEl, { commands: chips(), activeIndex, removable: false });
  }

  // 旗＝盤面のゴール旗をそのまま使う（置いたマスを goal として描く）。
  function drawBoard() {
    local.fit = fitCellSize({ spec: base, boardArea });
    const { view } = drawBoardUi({ boardWrap, spec: { ...base, goal: local.flag }, ...local.fit, playerPos: base.start });
    local.view = view;
    // 旗の「ゴール」の文字は消す（置いた旗は予想で、ゴールではない。「よそう」の札とも重なる）。
    boardWrap.querySelectorAll('.grid-cell svg text').forEach((t) => t.remove());
  }

  function updateControls() {
    runBtn.disabled = local.phase === 'running' || (local.phase === 'edit' && !local.flag);
    boardWrap.dataset.readPhase = local.phase;
  }

  boardWrap.addEventListener('click', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell || local.phase !== 'edit') return;
    const pos = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
    const onStart = pos.x === base.start.x && pos.y === base.start.y;
    if (wallKeys.has(`${pos.x},${pos.y}`) || onStart) {
      skipClickSfx();
      return;
    }
    local.flag = pos;
    vibrate();
    playSfx('snap');
    clearResultBubble(bird);
    drawBoard();
    updateControls();
    local.nudge?.poke();
  });

  function finish(result) {
    if (isRunCleared(result)) {
      local.phase = 'cleared';
      updateControls();
      drawQueue();
      recordClear({ isFinal: isFinalStage, stageIndex });
      local.clearSequence?.dispose();
      local.clearSequence = showClearSequence({
        bird,
        controls,
        lockEl: opScreen,
        keepEl: gearBtn,
        host: root,
        gapEl: actionsEl,
        view: local.view,
        restore: () => {},
        primary: isTrial()
          ? { label: 'とじる', action: closeTrialTab, id: 'close' }
          : isFinalStage
          ? { label: 'つぎへ', action: () => goToStep(S.stepIndex + 1), id: 'next' }
          : { label: 'つぎの ステージ', action: () => goToStep(S.stepIndex + 1), id: 'next-stage' },
        replay: nextRound,
        ...(isFinalStage ? {} : { heading: 'つぎへ すすもう' }),
        setActiveAnimation,
      });
      return;
    }
    // 外れ：置いた旗（よそう）と、止まったマス（けっか）だけを示す。足あとは残る。
    local.phase = 'missed';
    drawQueue();
    const stop = result.path.at(-1) ?? base.start;
    local.view.markCell(local.flag, 'predicted');
    local.view.markCell(stop, 'result');
    local.view.shrug();
    playSfx('tryAgain');
    shakeBoard(boardArea);
    setRetryButton(runBtn, 'retry', { runLabel: RUN_LABEL });
    updateControls();
    showHint(null, { bird, kind: 'read', message: READ_TEXT.miss, restore: () => {} });
  }

  // 次の命令列へ（ためしなおす・クリア後のもういちど）。旗は外し、ロボットはスタートへ戻す。
  function nextRound() {
    ROUNDS.set(roundKey, (ROUNDS.get(roundKey) ?? 0) + 1);
    local.flag = null;
    local.phase = 'edit';
    clearResultBubble(bird);
    setRetryButton(runBtn, 'run', { runLabel: RUN_LABEL });
    drawBoard();
    local.view.popIn();
    drawQueue();
    queueEl.querySelectorAll('.command-chip').forEach((chip) => chip.classList.add('spring-in'));
    updateControls();
    local.nudge?.poke();
  }

  runBtn.addEventListener('click', () => {
    if (runBtn.dataset.action === 'retry') {
      logEvent('retry', {});
      nextRound();
      return;
    }
    if (local.phase !== 'edit' || !local.flag) {
      skipClickSfx();
      return;
    }
    local.phase = 'running';
    local.nudge?.stop();
    clearResultBubble(bird);
    updateControls();
    logEvent('run', { commandCount: program().length, mode: 'read' });
    const anim = playAnimation(chips(), { ...base, goal: local.flag }, local.view, { onTick: (i) => drawQueue(i), onDone: finish });
    setActiveAnimation(anim);
  });

  drawQueue();
  drawBoard();
  updateControls();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 無操作のとき：旗がまだなら盤面、置いてあれば「じっこう」を光らせる（8秒後・最大2回）。
  local.nudge = createIdleNudge({
    getTarget: () => (local.phase !== 'edit' ? [] : local.flag ? [runBtn] : [boardWrap.firstElementChild].filter(Boolean)),
  });
  setActiveNudge(local.nudge);

  // 未クリアの最初の面だけ、指が盤面のマスを軽くたたく見本を出す（最初のタップで消える）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    // 指すマスは、答え（1本目の止まるマス）・スタート・壁を避けた、盤の中央にいちばん近いマス。
    const cx = (base.grid.cols - 1) / 2;
    const cy = (base.grid.rows - 1) / 2;
    const target = [...boardWrap.querySelectorAll('.grid-cell')]
      .map((el) => ({ el, x: Number(el.dataset.x), y: Number(el.dataset.y) }))
      .filter((c) => !wallKeys.has(`${c.x},${c.y}`) && !(c.x === base.start.x && c.y === base.start.y) && !(c.x === base.goal.x && c.y === base.goal.y))
      .sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))[0]?.el;
    if (target) {
      setActiveHandHint(showHandHint({ from: target, mode: 'tap' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }

  observeBoard({
    boardArea,
    fit: () => fitCellSize({ spec: base, boardArea }),
    current: () => local.fit,
    skipWhen: () => local.phase !== 'edit',
    redraw: drawBoard,
  });
}
