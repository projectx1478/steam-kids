// predict-slider（シーソーで つりあい）のplayステップ描画（Issue #150）。右のロボットを◀▶かドラッグで
// 動かして置く（＝予想）→「ためす」で支えが外れ、傾きを見る。選択肢UIは使わない（#104を踏襲）。
// 画面の骨格・ボタン・ヒント・クリア演出は ui-play.js と同じ部品を再利用する。
import { S } from './state.js';
import { balance } from './engine-seesaw.js';
import { logEvent } from './events.js';
import { shapeSvg, setMoodIn, prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, setBackDisabled, setActiveHandHint, setActiveAnimation } from './ui-step.js';
import { showHint } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { clearToast, showToast } from './ui-toast.js';

const UNIT = 40; // 1刻みの幅（viewBox単位）
const BOARD_H = 260;
const PLANK_Y = 170;
const PLANK_H = 14;
const GROUND_Y = 250;
const ROBOT = 36;
const ROBOT_STACK = 30;
const TILT_DEG = 8;
const TILT_MS = 900;
const HEAVY_MESSAGE = { '-1': '◀ こっちが おもいよ', 1: 'こっちが おもいよ ▶' };

function robotsSvg(cx, count, extraAttrs = '') {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const y = PLANK_Y - ROBOT - i * ROBOT_STACK + 2;
    out += `<svg x="${cx - ROBOT / 2}" y="${y}" width="${ROBOT}" height="${ROBOT}" viewBox="0 0 64 64" ${extraAttrs}>${shapeSvg('player')}</svg>`;
  }
  return out;
}

export function renderSeesaw(root, step) {
  const spec = step.seesaw;
  const notches = spec.notches;
  const cx0 = (notches + 1) * UNIT;
  const boardW = cx0 * 2;
  const pivotY = PLANK_Y + PLANK_H;

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { pos: spec.mover.start, phase: 'edit', timer: null };

  // 画面の枠は共通部品（js/ui-screen.js。Issue #343）。
  const screen = createOpScreen({ root, question: step.text ?? 'つりあう ところに おこう' });
  const { frame: opScreen, questionEl: statusBar, boardArea, actions: actionsEl } = screen;
  function renderQuestion() {
    screen.renderQuestion();
  }

  const ticks = Array.from({ length: notches * 2 + 1 }, (_, i) => i - notches)
    .map((n) => `<circle cx="${cx0 + n * UNIT}" cy="${PLANK_Y + PLANK_H / 2}" r="${n === 0 ? 0 : 2.5}" fill="#7c4a1e" opacity="0.55" />`)
    .join('');
  const leftRobots = spec.left.map((w) => robotsSvg(cx0 - w.pos * UNIT, w.robots)).join('');
  const postX = (side) => cx0 + side * notches * UNIT;
  boardArea.innerHTML = `<svg class="seesaw-board w-full h-full" viewBox="0 0 ${boardW} ${BOARD_H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <rect x="0" y="${GROUND_Y}" width="${boardW}" height="6" rx="3" fill="#a16207" opacity="0.5" />
    <polygon points="${cx0 - 30},${GROUND_Y} ${cx0 + 30},${GROUND_Y} ${cx0},${pivotY}" fill="#92400e" />
    <g data-support style="transition: opacity 300ms">
      <rect x="${postX(-1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
      <rect x="${postX(1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
    </g>
    <g data-plank style="transform-origin: ${cx0}px ${pivotY}px">
      <rect x="${cx0 - (notches + 0.7) * UNIT}" y="${PLANK_Y}" width="${(notches * 2 + 1.4) * UNIT}" height="${PLANK_H}" rx="6" fill="#b45309" />
      <rect x="${cx0 - (notches + 0.7) * UNIT + 4}" y="${PLANK_Y + 1}" width="${(notches * 2 + 1.4) * UNIT - 8}" height="4" rx="2" fill="#f59e0b" opacity="0.6" />
      ${ticks}
      <g data-footprints></g>
      <g data-left>${leftRobots}</g>
      <g data-mover class="cursor-grab" style="touch-action: none"></g>
    </g>
  </svg>`;
  const svg = boardArea.querySelector('svg');
  const plank = svg.querySelector('[data-plank]');
  const support = svg.querySelector('[data-support]');
  const footprints = svg.querySelector('[data-footprints]');
  const mover = svg.querySelector('[data-mover]');
  mover.innerHTML = robotsSvg(cx0, spec.mover.robots);
  plank.style.transition = 'none';

  const view = {
    confetti: (opts) => screenConfetti(opts),
    setMood: (mood) => setMoodIn(svg, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      mover.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
        { duration: 700, easing: 'ease-in-out' }
      );
    },
  };

  const moveBtnClass =
    'min-w-[64px] min-h-[64px] px-4 rounded-lg bg-slate-200 text-2xl font-bold transition-transform duration-100 active:scale-95 disabled:opacity-40';
  const leftBtn = document.createElement('button');
  leftBtn.type = 'button';
  leftBtn.dataset.action = 'pos-left';
  leftBtn.textContent = '◀';
  leftBtn.className = moveBtnClass;
  const rightBtn = document.createElement('button');
  rightBtn.type = 'button';
  rightBtn.dataset.action = 'pos-right';
  rightBtn.textContent = '▶';
  rightBtn.className = moveBtnClass;
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ ためす';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';

  function setRunMode(mode) {
    const retry = mode === 'retry';
    runBtn.dataset.action = retry ? 'retry' : 'run';
    runBtn.textContent = retry ? '↺ もういちど' : '▶ ためす';
    runBtn.classList.toggle('bg-emerald-500', !retry);
    runBtn.classList.toggle('bg-amber-500', retry);
    runBtn.classList.toggle('ring-4', retry);
    runBtn.classList.toggle('ring-amber-300', retry);
    runBtn.classList.toggle('ring-offset-2', retry);
  }

  function updateControls() {
    const editing = local.phase === 'edit';
    leftBtn.disabled = !editing || local.pos <= 1;
    rightBtn.disabled = !editing || local.pos >= notches;
    runBtn.disabled = local.phase === 'running';
  }

  // クリア演出（星→間→結果ダイアログ。Issue #342）は js/ui-clear.js の共通部品に任せる。
  let clearSequence = null;

  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.append(leftBtn, rightBtn, runBtn);
  }

  function drawMover() {
    mover.setAttribute('transform', `translate(${local.pos * UNIT},0)`);
    mover.dataset.pos = String(local.pos);
    updateControls();
  }

  function setPos(pos, via) {
    const next = Math.max(1, Math.min(notches, pos));
    if (local.phase !== 'edit' || next === local.pos) return;
    local.pos = next;
    playSfx(via === 'drag' ? 'snap' : 'tap');
    drawMover();
  }

  function setTilt(tilt) {
    plank.style.transition = prefersReducedMotion() ? 'none' : `transform ${TILT_MS}ms ease-in-out`;
    plank.style.transform = `rotate(${tilt * TILT_DEG}deg)`;
    plank.dataset.tilt = String(tilt);
  }

  function addFootprint(pos) {
    if (footprints.querySelector(`[data-footprint="${pos}"]`)) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.footprint = String(pos);
    g.setAttribute('opacity', '0.25');
    g.setAttribute('transform', `translate(${pos * UNIT},0)`);
    g.innerHTML = robotsSvg(cx0, spec.mover.robots);
    footprints.appendChild(g);
  }

  function resetBoard() {
    local.phase = 'edit';
    local.pos = spec.mover.start;
    setTilt(0);
    support.style.opacity = '1';
    setMoodIn(svg, 'normal');
    drawMover();
  }

  function finishRun() {
    local.timer = null;
    setActiveAnimation(null);
    setBackDisabled(false);
    const result = balance(spec, local.pos);
    if (result.tilt === 0) {
      local.phase = 'cleared';
      updateControls();
      recordClear({ isFinal: isFinalStage, stageIndex });
      clearSequence?.dispose();
      clearSequence = showClearSequence({
        statusBar,
        controls: opScreen,
        lockEl: opScreen,
        host: root,
        gapEl: actionsEl,
        view,
        restore: renderQuestion,
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
    setRunMode('retry');
    updateControls();
    addFootprint(local.pos);
    playSfx('tryAgain');
    setMoodIn(svg, 'puzzled');
    if (prefersReducedMotion()) {
      boardArea.classList.add('ring-4', 'ring-amber-400', 'rounded-2xl');
      setTimeout(() => boardArea.classList.remove('ring-4', 'ring-amber-400', 'rounded-2xl'), 500);
    } else {
      boardArea.classList.add('wobble-soft');
      boardArea.addEventListener('animationend', () => boardArea.classList.remove('wobble-soft'), { once: true });
    }
    showHint(statusBar, { kind: 'tilt', message: HEAVY_MESSAGE[result.tilt], restore: renderQuestion });
  }

  function run() {
    if (local.phase !== 'edit') return;
    local.phase = 'running';
    updateControls();
    setActiveHandHint(null);
    clearToast(statusBar);
    vibrate();
    logEvent('run', { pos: local.pos });
    playSfx('run');
    setBackDisabled(true);
    support.style.opacity = '0';
    setTilt(balance(spec, local.pos).tilt);
    const delay = prefersReducedMotion() ? 0 : TILT_MS + 100;
    local.timer = setTimeout(finishRun, delay);
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
      },
    });
  }

  function restartCue() {
    playSfx('start');
    showToast(statusBar, {
      render: (el) => {
        el.dataset.restart = 'true';
        const p = document.createElement('p');
        p.className = 'text-lg font-bold text-sky-700';
        p.textContent = 'スタート！';
        el.appendChild(p);
      },
      durationMs: 1000,
      restore: (el) => {
        delete el.dataset.restart;
        renderQuestion();
      },
    });
  }

  function retry() {
    vibrate();
    logEvent('retry', {});
    clearToast(statusBar);
    setRunMode('run');
    resetBoard();
    restartCue();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearToast(statusBar);
    footprints.innerHTML = '';
    resetBoard();
    restartCue();
  }

  leftBtn.addEventListener('click', () => {
    vibrate();
    setPos(local.pos - 1, 'tap');
  });
  rightBtn.addEventListener('click', () => {
    vibrate();
    setPos(local.pos + 1, 'tap');
  });
  runBtn.addEventListener('click', () => (runBtn.dataset.action === 'retry' ? retry() : run()));

  // ドラッグ：ロボットを横になぞって刻みへ置く。座標はviewBox単位へ換算する。
  let dragging = false;
  function posFromPointer(ev) {
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / boardW, rect.height / BOARD_H);
    const left = rect.left + (rect.width - boardW * scale) / 2;
    return Math.round(((ev.clientX - left) / scale - cx0) / UNIT);
  }
  mover.addEventListener('pointerdown', (ev) => {
    if (local.phase !== 'edit') return;
    dragging = true;
    setActiveHandHint(null);
    mover.setPointerCapture?.(ev.pointerId);
  });
  mover.addEventListener('pointermove', (ev) => {
    if (dragging) setPos(posFromPointer(ev), 'drag');
  });
  const endDrag = () => {
    dragging = false;
  };
  mover.addEventListener('pointerup', endDrag);
  mover.addEventListener('pointercancel', endDrag);

  renderQuestion();
  showNormalActions();
  drawMover();

  // 未クリアレッスンの最初のステージだけ、◀▶の指ガイドを1回出す（最初の操作で消える）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    setActiveHandHint(showHandHint({ from: rightBtn, mode: 'tap' }));
    opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
  }
}
