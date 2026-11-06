// predict-slider（うかぶ・しずむ。play.buoyancy）のplayステップ描画（Issue #288）。水槽のロボットに おもり・ふうせんを
// 付けて「ためす」→ 浮く（上）／沈む（下）／ぴたり（クリア）を見る。ドラッグは作らず、−＋ボタンで個数を決める。
// 画面の骨格・ボタン・ヒント・クリア演出は ui-seesaw.js と同じ部品を再利用する。
import { S } from './state.js';
import { buoyancy } from './engine-buoyancy.js';
import { logEvent } from './events.js';
import { shapeSvg, setMoodIn, prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { createOpScreen } from './ui-screen.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, setBackDisabled, setActiveHandHint, setActiveAnimation } from './ui-step.js';
import { showHint, clearResultBubble } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { setRetryButton, shakeBoard, showStartCue, bindStartCueDismiss } from './ui-retry.js';

const BOARD_W = 320;
const BOARD_H = 260;
const WATER_Y = 60;
const FLOOR_Y = 250;
const ROBOT = 36;
const ROBOT_X = 142;
const ROBOT_Y = 132;
const MOVE_PER_NET = 22;
const MOVE_UP_MAX = 70;
const MOVE_DOWN_MAX = 50;
const MOVE_MS = 900;
const HINT_MESSAGE = { 1: 'ぷかっと うかんだよ ▲', '-1': 'ずーんと しずんだよ ▼' };

// 数字の丸の中の文字（白の太字＋濃い茶の縁。黄色の上でも読める）。シーソーの数字と見た目をそろえる。
function numberDiscSvg(cx, cy, text, fontSize) {
  return `<text x="${cx}" y="${cy + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="#fff" stroke="#44403c" stroke-width="2" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
}

// 風船SVG（ひも18px＋直径22pxの円）。cx は風船の中心x、赤・黄を交互にする。中にうく力 lift。
function balloonSvg(cx, index, lift) {
  const top = ROBOT_Y - 18 - 22;
  const fill = index % 2 === 0 ? '#f43f5e' : '#facc15';
  return `<g data-balloon><line x1="${cx}" y1="${top + 22}" x2="${cx}" y2="${ROBOT_Y + 4}" stroke="#78716c" stroke-width="1.5" /><circle cx="${cx}" cy="${top + 11}" r="11" fill="${fill}" /><ellipse cx="${cx - 4}" cy="${top + 7}" rx="3" ry="2" fill="#fff" opacity="0.6" />${numberDiscSvg(cx, top + 11, lift, 14)}</g>`;
}

// おもりSVG（mass=1は直径20px、2以上は28px。大きい＝重い）。中に重さ mass。
function weightSvg(cx, mass) {
  const d = mass === 1 ? 20 : 28;
  const cy = ROBOT_Y + ROBOT + d / 2 - 2;
  return `<g data-weight><circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="#44403c" /><circle cx="${cx - d / 5}" cy="${cy - d / 5}" r="${d / 8}" fill="#fff" opacity="0.35" />${numberDiscSvg(cx, cy, mass, 14)}</g>`;
}

// withBadge：ロボット右肩の「↑base」（ロボットだけのうく力）。足あと（薄い写し）では描かない。
function itemsSvg(weights, balloons, mass, lift, base, withBadge) {
  const d = mass === 1 ? 20 : 28;
  const cx0 = ROBOT_X + ROBOT / 2;
  let out = '';
  for (let i = 0; i < balloons; i += 1) out += balloonSvg(cx0 + (i - (balloons - 1) / 2) * 24, i, lift);
  out += `<svg x="${ROBOT_X}" y="${ROBOT_Y}" width="${ROBOT}" height="${ROBOT}" viewBox="0 0 64 64">${shapeSvg('player')}</svg>`;
  if (withBadge) {
    out += `<g><circle cx="196" cy="150" r="13" fill="#0d9488" stroke="#fff" stroke-width="1.5" /><text x="196" y="150.5" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="800" font-size="13" fill="#fff">↑${base}</text></g>`;
  }
  for (let i = 0; i < weights; i += 1) out += weightSvg(cx0 + (i - (weights - 1) / 2) * (d + 2), mass);
  return out;
}

const ICON_WEIGHT = '<svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" aria-hidden="true"><circle cx="12" cy="13" r="9" fill="#44403c" /><circle cx="8.5" cy="9.5" r="2.5" fill="#fff" opacity="0.35" /></svg>';
const ICON_BALLOON = '<svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" aria-hidden="true"><circle cx="12" cy="9" r="7.5" fill="#f43f5e" /><line x1="12" y1="16.5" x2="12" y2="23" stroke="#78716c" stroke-width="1.5" /></svg>';

export function renderBuoyancy(root, step) {
  const spec = step.buoyancy;
  const mass = spec.mass ?? 1;
  const lift = spec.lift ?? 1;
  const base = spec.base ?? 0;
  const wMax = spec.weights?.max ?? 0;
  const bMax = spec.balloons?.max ?? 0;
  const hasW = wMax > 0;
  const hasB = bMax > 0;

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { weights: spec.weights?.start ?? 0, balloons: spec.balloons?.start ?? 0, phase: 'edit', timer: null };

  const screen = createOpScreen({ root, question: step.text ?? 'ぴったり とまる ところは？', stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, actions: actionsEl, bird } = screen;
  opScreen.classList.add('sk-screen--buoyancy');
  bindStartCueDismiss(opScreen, boardArea);
  actionsEl.classList.add(hasW && hasB ? 'sk-screen-actions--two-row' : 'sk-screen-actions--one-row');

  boardArea.innerHTML = `<svg class="buoyancy-board w-full h-full" viewBox="0 0 ${BOARD_W} ${BOARD_H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <rect x="0" y="${WATER_Y}" width="${BOARD_W}" height="${FLOOR_Y - WATER_Y}" fill="#bae6fd" />
    <path d="M0 ${WATER_Y} q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V${WATER_Y + 8} H0 Z" fill="#7dd3fc" />
    <rect x="0" y="${FLOOR_Y}" width="${BOARD_W}" height="6" rx="3" fill="#a16207" opacity="0.6" />
    <g data-footprints></g>
    <g data-robot style="transition: none"><g data-bob></g></g>
  </svg>`;
  const svg = boardArea.querySelector('svg');
  const footprints = svg.querySelector('[data-footprints]');
  const robot = svg.querySelector('[data-robot]');
  const bob = svg.querySelector('[data-bob]');
  let bobAnim = null;

  const view = {
    confetti: screenConfetti,
    setMood: (mood) => setMoodIn(svg, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      bob.animate?.(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
        { duration: 700, easing: 'ease-in-out' }
      );
    },
  };

  function makeBtn(action, label, ariaLabel, cls, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = action;
    b.setAttribute('aria-label', ariaLabel);
    b.className = `${cls} flex items-center justify-center gap-1 min-w-[64px] min-h-[64px] px-1 text-2xl font-bold transition-transform duration-100 active:scale-95 disabled:opacity-40`;
    b.innerHTML = `${icon}<span aria-hidden="true">${label}</span>`;
    return b;
  }
  const weightMinus = makeBtn('weight-minus', '−', 'かるくする', 'weight-btn', ICON_WEIGHT);
  const weightPlus = makeBtn('weight-plus', '＋', 'おもくする', 'weight-btn', ICON_WEIGHT);
  const balloonMinus = makeBtn('balloon-minus', '−', 'へらす', 'balloon-btn', ICON_BALLOON);
  const balloonPlus = makeBtn('balloon-plus', '＋', 'ふやす', 'balloon-btn', ICON_BALLOON);
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ ためす';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';

  function setRunMode(mode) {
    setRetryButton(runBtn, mode, { runLabel: '▶ ためす', emphasis: ['ring-4', 'ring-amber-300', 'ring-offset-2'] });
  }

  function updateControls() {
    const editing = local.phase === 'edit';
    weightMinus.disabled = !editing || local.weights <= 0;
    weightPlus.disabled = !editing || local.weights >= wMax;
    balloonMinus.disabled = !editing || local.balloons <= 0;
    balloonPlus.disabled = !editing || local.balloons >= bMax;
    runBtn.disabled = local.phase === 'running';
  }

  let clearSequence = null;

  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.append(...(hasW ? [weightMinus, weightPlus] : []), ...(hasB ? [balloonMinus, balloonPlus] : []), runBtn);
  }

  function startBob() {
    bobAnim?.cancel();
    bobAnim = null;
    if (prefersReducedMotion() || !bob.animate) return;
    bobAnim = bob.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], {
      duration: 1800,
      iterations: Infinity,
      easing: 'ease-in-out',
    });
  }

  function drawRobot() {
    bob.innerHTML = itemsSvg(local.weights, local.balloons, mass, lift, base, true);
    robot.dataset.weights = String(local.weights);
    robot.dataset.balloons = String(local.balloons);
    updateControls();
  }

  function move(net) {
    const dy = Math.max(-MOVE_UP_MAX, Math.min(MOVE_DOWN_MAX, -net * MOVE_PER_NET));
    robot.style.transition = prefersReducedMotion() ? 'none' : `transform ${MOVE_MS}ms ease-in-out`;
    robot.style.transform = `translateY(${dy}px)`;
    robot.dataset.dy = String(dy);
    return dy;
  }

  function setCount(key, value, max) {
    const next = Math.max(0, Math.min(max, value));
    if (local.phase !== 'edit' || next === local[key]) {
      skipClickSfx();
      return;
    }
    local[key] = next;
    drawRobot();
  }

  function addFootprint(weights, balloons, dy) {
    const key = `${weights}:${balloons}`;
    if (footprints.querySelector(`[data-footprint="${key}"]`)) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.footprint = key;
    g.setAttribute('opacity', '0.25');
    g.setAttribute('transform', `translate(0,${dy})`);
    g.innerHTML = itemsSvg(weights, balloons, mass, lift, base, false);
    footprints.appendChild(g);
  }

  function resetBoard() {
    local.phase = 'edit';
    local.weights = spec.weights?.start ?? 0;
    local.balloons = spec.balloons?.start ?? 0;
    robot.style.transition = 'none';
    robot.style.transform = 'translateY(0)';
    robot.dataset.dy = '0';
    setMoodIn(svg, 'normal');
    drawRobot();
    startBob();
  }

  function finishRun(result, dy) {
    local.timer = null;
    setActiveAnimation(null);
    setBackDisabled(false);
    if (result.dir === 0) {
      local.phase = 'cleared';
      updateControls();
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
    setRunMode('retry');
    updateControls();
    addFootprint(local.weights, local.balloons, dy);
    playSfx('tryAgain');
    setMoodIn(svg, 'puzzled');
    shakeBoard(boardArea);
    showHint(null, { bird, kind: 'buoyancy', message: HINT_MESSAGE[result.dir] });
  }

  function run() {
    if (local.phase !== 'edit') return;
    local.phase = 'running';
    updateControls();
    setActiveHandHint(null);
    clearResultBubble(bird);
    vibrate();
    logEvent('run', { weights: local.weights, balloons: local.balloons });
    playSfx('run');
    setBackDisabled(true);
    bobAnim?.cancel();
    bobAnim = null;
    const result = buoyancy(spec, local.weights, local.balloons);
    const dy = move(result.net);
    const delay = prefersReducedMotion() ? 0 : MOVE_MS + 100;
    local.timer = setTimeout(() => finishRun(result, dy), delay);
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
      },
    });
  }

  function retry() {
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    setRunMode('run');
    resetBoard();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    footprints.innerHTML = '';
    resetBoard();
  }

  weightMinus.addEventListener('click', () => {
    vibrate();
    setCount('weights', local.weights - 1, wMax);
  });
  weightPlus.addEventListener('click', () => {
    vibrate();
    setCount('weights', local.weights + 1, wMax);
  });
  balloonMinus.addEventListener('click', () => {
    vibrate();
    setCount('balloons', local.balloons - 1, bMax);
  });
  balloonPlus.addEventListener('click', () => {
    vibrate();
    setCount('balloons', local.balloons + 1, bMax);
  });
  runBtn.addEventListener('click', () => (runBtn.dataset.action === 'retry' ? retry() : run()));

  screen.renderQuestion();
  showNormalActions();
  drawRobot();
  startBob();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 未クリアレッスンの最初のステージだけ、＋の指ガイドを1回出す（最初の操作で消える）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    setActiveHandHint(showHandHint({ from: hasW ? weightPlus : balloonPlus, mode: 'tap' }));
    opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
  }
}
