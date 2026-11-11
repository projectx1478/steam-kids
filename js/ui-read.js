// 「めいれいを よむ」面（grid-runtime の play に read があるとき。Issue #723 の試作）。
// 命令列は見るだけ。ロボットが止まるマスを考え、盤面をタップして旗を置き、「じっこう」で確かめる。
// 旗の置き方は2つ：マスをタップ（止まるマスだけ予想）／ロボットから指でなぞる（通る道ごと予想。輪が残る）。
// なぞった道は実行後もそのまま残り、ロボットの足あとが輪の中に入れば合っている。外したら、道が分かれたマスと、
// その手を出した命令が光る（事実だけ。正しい道は足あととして残る）。命令のチップはタップで「ここまで よんだ」の印が付く。
// ためしなおすたびに命令列が次の1本へ替わる（同じ答えを置き直すだけでは通れない）。
// 盤面・命令列・実行アニメ・失敗とクリアの演出は play（ui-play.js）と同じ部品を使う。
import { S } from './state.js';
import { boardSpec, isRunCleared } from './engine-grid.js';
import { fitCellSize, drawBoard as drawBoardUi, observeBoard } from './ui-board.js';
import { shapeSvg } from './ui-grid.js';
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
  fork: 'ここで みちが わかれたよ',
  tapHint: 'ゆびで みちを なぞって みよう',
  cardTitle: 'めいれい',
  exact: 'みちも ぴったり！',
};
const RUN_LABEL = '▶\nじっこう';
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const EYE_SVG =
  '<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>';

// 面ごとの「何本目の命令列か」（メモリのみ。入り直しても続きから回す）。
const ROUNDS = new Map();

const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function renderRead(root, step) {
  const base = boardSpec(step);
  const programs = step.read.programs;
  const roundKey = `${S.lesson.lessonId}:${step.stepId}`;
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;
  const wallKeys = new Set(base.walls.map((w) => `${w.x},${w.y}`));
  const isWall = (p) => wallKeys.has(`${p.x},${p.y}`);

  // phase: 'edit'（予想する）→ 'running' → 'missed'（ためしなおす待ち）／'cleared'
  // trail: なぞった道（スタートを含むマスの列。タップだけで旗を置いたときは空）。readUpTo: 「ここまで よんだ」の印（-1＝なし）。
  const local = { flag: null, trail: [], readUpTo: -1, forkChip: -1, phase: 'edit', view: null, fit: null, nudge: null, clearSequence: null, drag: null };
  const program = () => programs[(ROUNDS.get(roundKey) ?? 0) % programs.length];
  const chips = () => program().map((dir) => ({ dir, times: 1 }));

  const screen = createOpScreen({ root, question: step.text ?? READ_TEXT.question, stepKey: roundKey, gear: (btn) => { vibrate(); openMenu(btn); } });
  const { frame: opScreen, boardArea, panel: controls, actions: actionsEl, bird, gearBtn } = screen;
  opScreen.classList.add('sk-screen--read');
  actionsEl.classList.add('rd-actions');
  bindStartCueDismiss(opScreen, boardArea);
  screen.setHintProvider(() => READ_TEXT.tapHint);
  screen.renderQuestion();

  const boardWrap = document.createElement('div');
  boardWrap.dataset.readBoard = 'true';
  boardArea.appendChild(boardWrap);

  // 命令のカード（見るだけ。紙の札に見せ、play の木のトレイ＝「組む場所」と区別する）。
  const card = document.createElement('div');
  card.className = 'rd-card';
  const cardHead = document.createElement('div');
  cardHead.className = 'rd-card-head';
  cardHead.innerHTML = `${EYE_SVG}<span>${READ_TEXT.cardTitle}</span>`;
  const queueEl = document.createElement('ul');
  // 読む面は命令列がすべて同時に見えていること（スクロールで隠さない）。
  queueEl.className = 'command-queue rd-queue flex flex-wrap items-center gap-2 min-h-[64px]';
  queueEl.dataset.readProgram = 'true';
  card.append(cardHead, queueEl);
  controls.insertBefore(card, actionsEl);

  // はた立て：旗がまだ手元にあることを絵で示す。置いた後に押すと、旗（となぞった道）を手元へ戻す。
  const standBtn = document.createElement('button');
  standBtn.type = 'button';
  standBtn.dataset.action = 'flag-stand';
  standBtn.className = 'rd-stand btn-tactile';
  standBtn.setAttribute('aria-label', 'はたを もどす');
  standBtn.innerHTML = shapeSvg('goal');
  standBtn.querySelectorAll('text').forEach((t) => t.remove());

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = RUN_LABEL;
  runBtn.className = 'btn-tactile px-1 bg-emerald-500 text-white text-sm font-bold whitespace-pre-line leading-tight break-keep disabled:opacity-40';
  actionsEl.append(standBtn, runBtn);

  function drawQueue(activeIndex = -1) {
    renderCommandQueue(queueEl, { commands: chips(), activeIndex, removable: false });
    queueEl.querySelectorAll('.command-chip').forEach((chip) => {
      const i = Number(chip.dataset.index);
      chip.classList.toggle('rd-chip-read', local.phase === 'edit' && i <= local.readUpTo);
      chip.classList.toggle('rd-chip-fork', i === local.forkChip);
    });
  }

  // 「ここまで よんだ」の印。命令をタップするとそこまで薄くなる（同じ命令をもう一度で1つ戻る）。答えには関わらない。
  queueEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.command-chip');
    if (!chip || local.phase !== 'edit') return;
    const i = Number(chip.dataset.index);
    local.readUpTo = local.readUpTo === i ? i - 1 : i;
    playSfx('tap');
    drawQueue();
    local.nudge?.poke();
  });

  // なぞった道の輪（スタートの次のマスから）。ロボットの足あと（マス中央の点）が輪の中に入ると、合っていることが見える。
  function renderTrail() {
    const board = boardWrap.firstElementChild;
    if (!board) return;
    board.querySelectorAll('.rd-trail').forEach((el) => el.remove());
    local.trail.slice(1).forEach((pos) => {
      if (same(pos, local.flag)) return; // 旗のマスは旗そのものが印（輪を重ねない）
      const cell = board.querySelector(`.grid-cell[data-x="${pos.x}"][data-y="${pos.y}"]`);
      if (!cell) return;
      const size = Math.round(cell.offsetWidth * 0.56);
      const ring = document.createElement('div');
      ring.className = 'rd-trail';
      ring.style.width = `${size}px`;
      ring.style.height = `${size}px`;
      ring.style.left = `${cell.offsetLeft + (cell.offsetWidth - size) / 2}px`;
      ring.style.top = `${cell.offsetTop + (cell.offsetHeight - size) / 2}px`;
      board.appendChild(ring);
    });
  }

  // 旗＝盤面のゴール旗をそのまま使う（置いたマスを goal として描く）。
  function drawBoard() {
    local.fit = fitCellSize({ spec: base, boardArea });
    const { view } = drawBoardUi({ boardWrap, spec: { ...base, goal: local.flag }, ...local.fit, playerPos: base.start });
    local.view = view;
    // 旗の「ゴール」の文字は消す（置いた旗は予想で、ゴールではない。「よそう」の札とも重なる）。
    boardWrap.querySelectorAll('.grid-cell svg text').forEach((t) => t.remove());
    renderTrail();
  }

  function updateControls() {
    runBtn.disabled = local.phase === 'running' || (local.phase === 'edit' && !local.flag);
    standBtn.disabled = local.phase !== 'edit' || !local.flag;
    standBtn.dataset.placed = local.flag ? 'true' : 'false';
    boardWrap.dataset.readPhase = local.phase;
  }

  function cellAt(clientX, clientY) {
    const cell = document.elementFromPoint(clientX, clientY)?.closest?.('.grid-cell');
    if (!cell || !boardWrap.contains(cell)) return null;
    return { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
  }

  // 盤面の操作：ロボット（またはなぞりかけの先頭）から指を動かす＝道をなぞる。ほかのマスをタップ＝旗だけ置く。
  boardWrap.addEventListener('pointerdown', (e) => {
    if (local.phase !== 'edit') return;
    const pos = cellAt(e.clientX, e.clientY);
    if (!pos) return;
    if (same(pos, base.start)) {
      local.trail = [{ ...base.start }];
      local.flag = null;
      local.drag = { trace: true };
      drawBoard();
      updateControls();
    } else if (local.trail.length > 1 && same(pos, local.trail.at(-1))) {
      local.drag = { trace: true };
    } else {
      local.drag = { tap: pos };
    }
    boardWrap.setPointerCapture?.(e.pointerId);
  });

  boardWrap.addEventListener('pointermove', (e) => {
    if (!local.drag?.trace) return;
    const pos = cellAt(e.clientX, e.clientY);
    const last = local.trail.at(-1);
    if (!pos || same(pos, last)) return;
    if (same(pos, local.trail.at(-2))) local.trail.pop(); // 1つ戻る
    else if (adjacent(pos, last) && !isWall(pos)) local.trail.push(pos);
    else return;
    vibrate(8);
    playSfx('tap');
    renderTrail();
  });

  function endDrag() {
    const drag = local.drag;
    local.drag = null;
    if (!drag || local.phase !== 'edit') return;
    if (drag.tap) {
      if (isWall(drag.tap)) {
        skipClickSfx();
        return;
      }
      local.flag = drag.tap;
      local.trail = [];
    } else if (local.trail.length > 1) {
      local.flag = { ...local.trail.at(-1) };
    } else {
      local.trail = [];
      local.flag = null;
      drawBoard();
      updateControls();
      return;
    }
    vibrate();
    playSfx('snap');
    clearResultBubble(bird);
    drawBoard();
    updateControls();
    local.nudge?.poke();
  }
  boardWrap.addEventListener('pointerup', endDrag);
  boardWrap.addEventListener('pointercancel', endDrag);

  standBtn.addEventListener('click', () => {
    if (local.phase !== 'edit' || !local.flag) return;
    local.flag = null;
    local.trail = [];
    playSfx('tap');
    drawBoard();
    updateControls();
    local.nudge?.poke();
  });

  function finish(result) {
    const actual = result.path; // スタートを含む、通ったマスの列
    const traced = local.trail.length > 1;
    if (isRunCleared(result)) {
      local.phase = 'cleared';
      updateControls();
      drawQueue();
      recordClear({ isFinal: isFinalStage, stageIndex });
      const exact = traced && local.trail.length === actual.length && local.trail.every((p, i) => same(p, actual[i]));
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
        ...(exact ? { label: READ_TEXT.exact } : {}),
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
    // 外れ：置いた旗（よそう）と止まったマス（けっか）を示す。足あとは残る。
    local.phase = 'missed';
    const stop = actual.at(-1) ?? base.start;
    local.view.markCell(local.flag, 'predicted');
    local.view.markCell(stop, 'result');
    let message = READ_TEXT.miss;
    if (traced) {
      // なぞった道があれば、足あとと最初に分かれた所（最後に同じだったマス）と、その次の手を出した命令を光らせる。
      let k = 1;
      while (k < local.trail.length && k < actual.length && same(local.trail[k], actual[k])) k += 1;
      const forkCell = actual[Math.min(k, actual.length) - 1];
      if (!same(forkCell, stop)) local.view.markCell(forkCell, 'goal-hint');
      local.forkChip = result.stepOwner[Math.min(k, actual.length - 1) - 1] ?? -1;
      message = READ_TEXT.fork;
    }
    drawQueue();
    local.view.shrug();
    playSfx('tryAgain');
    shakeBoard(boardArea);
    setRetryButton(runBtn, 'retry', { runLabel: RUN_LABEL });
    updateControls();
    showHint(null, { bird, kind: 'read', message, restore: () => {} });
  }

  // 次の命令列へ（ためしなおす・クリア後のもういちど）。旗となぞった道は外し、ロボットはスタートへ戻す。
  function nextRound() {
    ROUNDS.set(roundKey, (ROUNDS.get(roundKey) ?? 0) + 1);
    local.flag = null;
    local.trail = [];
    local.readUpTo = -1;
    local.forkChip = -1;
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

  // 未クリアの最初の面だけ、指がロボットから1マスぶんなぞる見本を出す（最初の操作で消える）。
  // 見せるのは操作と1手目だけ（1手目は命令の先頭を見れば分かる）。止まるマスは指さない。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    const [dx, dy] = DIR_VEC[program()[0]];
    const cellEl = (p) => boardWrap.querySelector(`.grid-cell[data-x="${p.x}"][data-y="${p.y}"]`);
    const from = cellEl(base.start);
    const to = cellEl({ x: base.start.x + dx, y: base.start.y + dy });
    if (from && to) {
      setActiveHandHint(showHandHint({ from, to, mode: 'drag' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }

  observeBoard({
    boardArea,
    fit: () => fitCellSize({ spec: base, boardArea }),
    current: () => local.fit,
    skipWhen: () => local.phase !== 'edit' || !!local.drag,
    redraw: drawBoard,
  });
}
