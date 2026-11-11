// build-egg（たまごの みち。play.egg）の描画（Issue #290）。5×5 の格子の「置ける点」をタップして板を置き、再タップで4向きを循環する。
// 「ためす」で落下を再生する。結果は js/engine-egg.js の simulate（状態列）だけで決まり、描画のフレーム数・時間に依存しない。
// 失敗はたまごを割らない：軌跡（直前1回分）と落下位置の印だけを出し、赤は使わない。置いた板は残る。solution は画面に出さない。
// 画面の骨格・クリア演出・戻る系の無効化は unfold-cube（ui-unfold.js）と同じ部品を使う。
import { S } from './state.js';
import { simulate, ANGLES, EGG_TEXT } from './engine-egg.js';
import { logEvent } from './events.js';
import { shapeSvg, setMoodIn, prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { showHandHint } from './ui-hand.js';
import { goToStep, setBackDisabled, setActiveHandHint, setActiveAnimation } from './ui-step.js';
import { clearResultBubble } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { bindStartCueDismiss, showStartCue } from './ui-retry.js';

const PLAY_MS = 3000; // 落下の再生の上限（3秒以内。タップで飛ばせる）
const MS_PER_STEP = 120;
const MIN_MS = 500;
const TICK_MS = 40;
const REDUCED_MS = 300;
const SKIP_CLICK_GUARD_MS = 400; // 飛ばしのタップの直後に届く click を、板の操作として扱わない

const NS = 'http://www.w3.org/2000/svg';
const svg = (inner) => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;

// 新規SVG3点（たまご・巣・板）。画風は review/design/290/mock/ の見本。石（障害物）は灰の角丸。
const EGG_G =
  '<ellipse cx="32" cy="34" rx="12" ry="15" fill="#f3f4f1" stroke="#1e293b" stroke-width="3"/><circle cx="28" cy="30" r="2.5" fill="#d1d5db"/><circle cx="37" cy="38" r="3" fill="#d1d5db"/>';
const NEST_G =
  '<path d="M8 36 Q32 66 56 36 L52 52 Q32 62 12 52 Z" fill="#c68a4a" stroke="#1e293b" stroke-width="3" stroke-linejoin="round"/>';
const BLOCK_G =
  '<rect x="6" y="6" width="52" height="52" rx="8" fill="#94a3b8" stroke="#1e293b" stroke-width="3"/><path d="M16 22h32M16 34h32M16 46h32" stroke="#64748b" stroke-width="3"/>';
const PLATE_LINES = [
  [10, 54, 54, 10], // '/'
  [10, 10, 54, 54], // '\'
  [8, 32, 56, 32], // '-'
  [32, 8, 32, 56], // '|'
];
function plateG(a) {
  const [x1, y1, x2, y2] = PLATE_LINES[a];
  return (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1e293b" stroke-width="12" stroke-linecap="round"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/>`
  );
}
const MARK_G =
  '<circle cx="32" cy="32" r="22" fill="none" stroke="#f59e0b" stroke-width="5" stroke-dasharray="6 5"/>';

const robotHtml = () => `<svg class="egg-robot" viewBox="0 -8 64 72" aria-hidden="true">${shapeSvg('player')}</svg>`;

const key = (c, r) => c + ',' + r;

export function renderEgg(root, step) {
  const egg = step.egg;
  const { cols, rows } = egg.grid;
  const placeKeys = new Set(egg.places.map((p) => key(p.col, p.row)));
  const obstacleKeys = new Set(egg.obstacles.map((o) => key(o.col, o.row)));
  const nestOf = new Map(egg.nests.map((n) => [key(n.col, n.row), n]));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  // plates: [{col,row,angle}]（置いた順）。trace: 直前1回分の再生結果（{ path, result }）か null。
  const local = { plates: [], phase: 'edit', trace: null, timer: null, ticker: null, skippedAt: 0 };

  const screen = createOpScreen({ root, question: step.text, stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, panel, actions: actionsEl, bird } = screen;
  opScreen.classList.add('sk-screen--sortorder', 'sk-screen--egg');
  actionsEl.classList.add('sk-screen-actions--sortorder');
  bindStartCueDismiss(opScreen, boardArea);
  screen.renderQuestion();

  // 盤：上の余白行（たまご）＋格子。たまごと軌跡は格子の内側に重ねた層（.egg-layer）に描く。
  const wrap = document.createElement('div');
  wrap.className = 'egg-wrap';
  wrap.style.setProperty('--egg-cols', String(cols));
  wrap.style.setProperty('--egg-rows', String(rows));
  const eggRow = document.createElement('div');
  eggRow.className = 'egg-row';
  const gridEl = document.createElement('div');
  gridEl.className = 'egg-grid';
  gridEl.dataset.eggGrid = 'true';
  const layer = document.createElement('div');
  layer.className = 'egg-layer';
  const trajEl = document.createElementNS(NS, 'svg');
  trajEl.setAttribute('class', 'egg-traj');
  trajEl.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
  trajEl.setAttribute('aria-hidden', 'true');
  const eggEl = document.createElement('div');
  eggEl.className = 'egg-egg';
  eggEl.innerHTML = svg(EGG_G);
  layer.append(trajEl, eggEl);
  wrap.append(eggRow, gridEl);
  boardArea.appendChild(wrap);
  // 層は格子の内側の左上を原点にする（CSS）。板より手前に出すため、格子の最後の子にする。
  gridEl.appendChild(layer);

  // 状態行：ロボット＋結果の文言。
  const status = document.createElement('div');
  status.className = 'egg-status';
  const robotFrame = document.createElement('div');
  robotFrame.className = 'egg-robot-frame';
  const msgEl = document.createElement('div');
  msgEl.className = 'egg-msg';
  msgEl.dataset.eggMsg = 'true';
  status.append(robotFrame, msgEl);
  panel.insertBefore(status, actionsEl);

  const tryBtn = document.createElement('button');
  tryBtn.type = 'button';
  tryBtn.id = 'egg-try';
  tryBtn.dataset.action = 'run';
  tryBtn.className = 'egg-try';
  tryBtn.textContent = EGG_TEXT.try;
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.id = 'egg-undo';
  undoBtn.dataset.action = 'reset';
  undoBtn.className = 'egg-undo';
  undoBtn.textContent = EGG_TEXT.undo;

  const locked = () => local.phase === 'running' || local.phase === 'cleared';
  const setMsg = (t) => {
    msgEl.textContent = t;
  };
  const plateAt = (c, r) => local.plates.find((p) => p.col === c && p.row === r);

  function drawRobot(mood) {
    robotFrame.innerHTML = robotHtml();
    setMoodIn(robotFrame, mood);
  }

  // 格子の座標（セル単位）を、層（左上＝格子の内側の原点）の中へ収める。落下は端の1マス外までで、外側は端へ寄せる。
  const clampC = (c) => Math.max(0, Math.min(cols - 1, c));
  const clampR = (r) => Math.max(-1, Math.min(rows - 1, r));
  function placeEgg(c, r) {
    eggEl.style.left = `calc(var(--egg-c) * ${clampC(c)})`;
    eggEl.style.top = `calc(var(--egg-c) * ${clampR(r)})`;
  }

  function drawTrace() {
    const t = local.trace;
    if (!t) {
      trajEl.innerHTML = '';
      return;
    }
    const pts = t.path.map((p) => `${clampC(p.col) + 0.5},${clampR(p.row) + 0.5}`);
    trajEl.innerHTML = `<polyline class="egg-trace" points="${pts.join(' ')}" fill="none" stroke="#475569" stroke-opacity=".4" stroke-width=".12" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray=".25 .2"/>`;
  }

  function draw() {
    // 層（たまご・軌跡）を残して、格子のマスだけ作り直す。
    [...gridEl.children].forEach((el) => {
      if (el !== layer) el.remove();
    });
    const markCell = local.phase === 'failed' && local.trace ? lastInGrid(local.trace.path) : null;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const k = key(c, r);
        const isPlace = placeKeys.has(k);
        const cell = document.createElement(isPlace ? 'button' : 'div');
        if (isPlace) cell.type = 'button';
        cell.className = 'egg-cell';
        cell.dataset.x = String(c);
        cell.dataset.y = String(r);
        const plate = plateAt(c, r);
        let html = '';
        if (obstacleKeys.has(k)) html += svg(BLOCK_G);
        if (nestOf.has(k)) html += svg(NEST_G);
        if (isPlace) {
          cell.classList.add('egg-place');
          if (plate) cell.classList.add('egg-place-full');
          cell.setAttribute('aria-label', `${c + 1}れつ ${r + 1}ぎょう`);
          cell.addEventListener('click', () => tapPlace(c, r));
        }
        if (markCell && markCell.col === c && markCell.row === r) html += svg(MARK_G).replace('<svg', '<svg class="egg-mark"');
        cell.innerHTML = html;
        if (plate) {
          const p = document.createElement('span');
          p.className = 'egg-plate';
          p.dataset.angle = String(plate.angle);
          p.setAttribute('aria-label', `いた ${ANGLES[plate.angle]}`);
          p.innerHTML = svg(plateG(plate.angle));
          cell.appendChild(p);
        }
        gridEl.insertBefore(cell, layer);
      }
    }
    tryBtn.disabled = locked();
    undoBtn.disabled = locked() || local.plates.length === 0;
  }

  function lastInGrid(path) {
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const p = path[i];
      if (p.col >= 0 && p.col < cols && p.row >= 0 && p.row < rows) return p;
    }
    return null;
  }

  // 板を変えたら、直前の軌跡・印・結果の文言を消してたまごを最初の位置へ戻す。
  function clearTrace() {
    local.trace = null;
    if (local.phase === 'failed') local.phase = 'edit';
    drawTrace();
    placeEgg(egg.col, -1);
    eggEl.classList.remove('egg-in-nest');
    setMsg('');
    drawRobot('normal');
  }

  function tapPlace(c, r) {
    if (Date.now() - local.skippedAt < SKIP_CLICK_GUARD_MS) return;
    if (locked()) return skipClickSfx();
    const plate = plateAt(c, r);
    if (!plate && local.plates.length >= egg.limit) return skipClickSfx();
    setActiveHandHint(null);
    vibrate();
    playSfx('snap');
    clearTrace();
    if (plate) plate.angle = (plate.angle + 1) % ANGLES.length;
    else local.plates.push({ col: c, row: r, angle: 0 });
    draw();
  }

  const view = {
    confetti: screenConfetti,
    setMood: (mood) => setMoodIn(boardArea, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      robotFrame.querySelector('.egg-robot')?.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
        { duration: 600, easing: 'ease-in-out' }
      );
    },
  };

  let clearSequence = null;
  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.append(undoBtn, tryBtn);
  }

  function stopTimers() {
    clearTimeout(local.timer);
    clearInterval(local.ticker);
    local.timer = null;
    local.ticker = null;
  }

  // 再生の終わり（時間の経過でも、タップで飛ばしても同じ）。結果は run で決めた状態列の結果をそのまま使う。
  function finishRun() {
    stopTimers();
    setActiveAnimation(null);
    setBackDisabled(false);
    const { path, result } = local.trace;
    const end = path[path.length - 1];
    placeEgg(end.col, end.row);
    drawTrace();
    if (result === 'nest') {
      local.phase = 'cleared';
      eggEl.classList.add('egg-in-nest');
      draw();
      drawRobot('happy');
      setMsg(EGG_TEXT.nest);
      recordClear({ isFinal: isFinalStage, stageIndex });
      clearSequence?.dispose();
      clearSequence = showClearSequence({
        bird,
        controls: opScreen,
        lockEl: opScreen,
        host: root,
        gapEl: actionsEl,
        view,
        primary: isFinalStage
          ? { label: 'つぎへ', action: () => goToStep(S.stepIndex + 1), id: 'next' }
          : { label: 'つぎの ステージ', action: () => goToStep(S.stepIndex + 1), id: 'next-stage' },
        replay,
        ...(isFinalStage ? {} : { heading: 'つぎへ すすもう' }),
        setActiveAnimation,
      });
      return;
    }
    local.phase = 'failed';
    setMsg(EGG_TEXT[result]);
    draw(); // 落下位置の印
    drawRobot('puzzled');
    playSfx('tryAgain');
  }

  function run() {
    if (locked()) return;
    setActiveHandHint(null);
    clearResultBubble(bird);
    vibrate();
    logEvent('run', {});
    playSfx('run');
    setBackDisabled(true);
    // 結果は先に状態列で決める。以降の描画（時間・フレーム数）は結果を変えない。
    const sim = simulate(egg, local.plates);
    local.trace = { path: sim.path, result: sim.result };
    local.phase = 'running';
    setMsg('');
    drawTrace();
    placeEgg(egg.col, -1);
    draw();
    const n = sim.path.length;
    const reduced = prefersReducedMotion();
    const total = reduced ? REDUCED_MS : Math.min(PLAY_MS, Math.max(MIN_MS, n * MS_PER_STEP));
    const startedAt = Date.now();
    if (!reduced) {
      local.ticker = setInterval(() => {
        const i = Math.min(n - 1, Math.floor(((Date.now() - startedAt) / total) * n));
        placeEgg(sim.path[i].col, sim.path[i].row);
      }, TICK_MS);
    }
    local.timer = setTimeout(finishRun, total);
    setActiveAnimation({
      cancel() {
        stopTimers();
        setBackDisabled(false);
      },
    });
  }

  // もどす：直前に置いた1枚を外す。向きだけ変えた操作は戻さない。
  function undo() {
    if (locked()) return skipClickSfx();
    if (local.plates.length === 0) return;
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    clearTrace();
    local.plates.pop();
    draw();
  }

  function resetAll() {
    stopTimers();
    local.plates = [];
    local.trace = null;
    local.phase = 'edit';
    drawTrace();
    placeEgg(egg.col, -1);
    eggEl.classList.remove('egg-in-nest');
    drawRobot('normal');
    setMsg('');
    draw();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    resetAll();
  }

  tryBtn.addEventListener('click', run);
  undoBtn.addEventListener('click', undo);
  // 再生の途中で盤のタップは演出を飛ばして結果へ（結果は同じ）。
  boardArea.addEventListener('pointerdown', () => {
    if (local.phase !== 'running') return;
    local.skippedAt = Date.now();
    finishRun();
  });

  showNormalActions();
  resetAll();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 最初の面だけ、開くたびに指ガイド（文字なし・記録しない）。答えを見せないよう、solution に含まれない点を指す。
  if (stageIndex === 0) {
    const solKeys = new Set((egg.solution || []).map((p) => key(p.col, p.row)));
    const target = egg.places.find((p) => !solKeys.has(key(p.col, p.row)));
    const el = target && gridEl.querySelector(`.egg-cell[data-x="${target.col}"][data-y="${target.row}"]`);
    if (el) {
      setActiveHandHint(showHandHint({ from: el, mode: 'tap' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
}
