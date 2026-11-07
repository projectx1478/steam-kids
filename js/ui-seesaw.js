// predict-slider（シーソーで つりあい）のplayステップ描画（Issue #150）。右のロボットを◀▶かドラッグで
// 動かして置く（＝予想）→「ためす」で支えが外れ、傾きを見る。選択肢UIは使わない（#104を踏襲）。
// 画面の骨格・ボタン・ヒント・クリア演出は ui-play.js と同じ部品を再利用する。
import { S } from './state.js';
import { balance, allowedPositions, moversOf } from './engine-seesaw.js';
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

const BOARD_H = 270;
const PLANK_Y = 180;
const PLANK_H = 14;
const GROUND_Y = 260;
const ROBOT = 30;
const ROBOT_STACK = 30; // 6体のみ24（robotStack）
const NUM_R = 11; // おもさの数字の円の半径
const TILT_DEG = 8;
const TILT_MS = 900;
const MOVER_COLORS = ['#5b3a1a', '#0f766e']; // 2組の面の色（①茶・②青緑）
const HEAVY_MESSAGE = { '-1': '◀ こっちが おもいよ', 1: 'こっちが おもいよ ▶' };

// 1刻みの幅（viewBox単位）。刻みが多い面ほど詰める。
function unitFor(notches) {
  if (notches <= 4) return 40;
  return notches === 5 ? 36 : 31;
}

const robotStack = (count) => (count >= 6 ? 24 : ROBOT_STACK);

function robotsSvg(cx, count, extraAttrs = '') {
  let out = '';
  const stack = robotStack(count);
  for (let i = 0; i < count; i += 1) {
    const y = PLANK_Y - ROBOT - i * stack + 2;
    out += `<svg x="${cx - ROBOT / 2}" y="${y}" width="${ROBOT}" height="${ROBOT}" viewBox="0 0 64 64" ${extraAttrs}>${shapeSvg('player')}</svg>`;
  }
  return out;
}

// おもさの数字：山の真上の円（<g>。<svg>にしない）。
function weightNumSvg(cx, count, color = '#5b3a1a') {
  const top = PLANK_Y - ROBOT - (count - 1) * robotStack(count) + 2;
  const cy = top - NUM_R;
  return `<g data-weight-disc><circle cx="${cx}" cy="${cy}" r="${NUM_R}" fill="${color}" /><text data-num="weight" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="16" font-weight="800">${count}</text></g>`;
}

function distNumSvg(x, n) {
  return `<text data-num="dist" x="${x}" y="${PLANK_Y + PLANK_H / 2}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="14" font-weight="800" stroke="#44403c" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke">${n}</text>`;
}

export function renderSeesaw(root, step) {
  const spec = step.seesaw;
  const notches = spec.notches;
  const unit = unitFor(notches);
  const cx0 = (notches + 1) * unit;
  const boardW = cx0 * 2;
  const pivotY = PLANK_Y + PLANK_H;

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  // 動かすロボットは1組（従来）または2組（mover が配列。Issue #689）。local.pos・local.robots は選択中の組の値。
  const movers = moversOf(spec);
  const multi = movers.length === 2;
  const local = { poses: movers.map((m) => m.start), robotsList: movers.map((m) => m.robots), sel: 0, phase: 'edit', timer: null, fails: 0 };
  Object.defineProperties(local, {
    pos: { get: () => local.poses[local.sel], set: (v) => (local.poses[local.sel] = v) },
    robots: { get: () => local.robotsList[local.sel], set: (v) => (local.robotsList[local.sel] = v) },
  });
  // 重さが動く面（maxRobots あり）／位置が固定の面（fixedPos あり）。teko-01〜03 はどちらも無い。2組の面はどちらも無い。
  const maxRobots = multi ? null : (movers[0].maxRobots ?? null);
  const posFixed = !multi && movers[0].fixedPos != null;

  // 画面の枠は共通部品（js/ui-screen.js。Issue #343）。
  const screen = createOpScreen({ root, question: step.text ?? (multi ? 'ふたりを つりあう ところに おこう' : 'つりあう ところに おこう'), stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, actions: actionsEl, bird } = screen;
  bindStartCueDismiss(opScreen, boardArea); // 盤面の最初の操作で「スタート！」を消す（Issue #635）
  actionsEl.classList.add(multi || (maxRobots && !posFixed) ? 'sk-screen-actions--two-row' : 'sk-screen-actions--one-row');
  function renderQuestion() {
    screen.renderQuestion();
  }

  const ticks = Array.from({ length: notches * 2 + 1 }, (_, i) => i - notches)
    .filter((n) => n !== 0)
    .map((n) => distNumSvg(cx0 + n * unit, Math.abs(n)))
    .join('');
  const leftRobots = spec.left.map((w) => robotsSvg(cx0 - w.pos * unit, w.robots) + weightNumSvg(cx0 - w.pos * unit, w.robots)).join('');
  const rightRobots = (spec.right ?? []).map((w) => robotsSvg(cx0 + w.pos * unit, w.robots) + weightNumSvg(cx0 + w.pos * unit, w.robots)).join('');
  // 選択中の組が置ける刻み（固定ロボット・もう1組のいる刻みは置けない）
  const allowedNow = () => allowedPositions(spec, local.sel, local.poses);
  const both = movers.some((m) => m.side === 'both'); // 支点の左（負の刻み）にも置ける面（点線を出す）
  // 支点の真上の縦の点線（side:"both" の盤だけ。板の外に置き、傾けない）。
  const pivotLine = both
    ? `<line data-pivot-line x1="${cx0}" y1="${PLANK_Y - 60}" x2="${cx0}" y2="${PLANK_Y}" stroke="#64748b" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" opacity="0.5" />`
    : '';
  const postX = (side) => cx0 + side * notches * unit;
  boardArea.innerHTML = `<svg class="seesaw-board w-full h-full" viewBox="0 0 ${boardW} ${BOARD_H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <rect x="0" y="${GROUND_Y}" width="${boardW}" height="6" rx="3" fill="#a16207" opacity="0.5" />
    <polygon points="${cx0 - 30},${GROUND_Y} ${cx0 + 30},${GROUND_Y} ${cx0},${pivotY}" fill="#92400e" />
    <g data-support style="transition: opacity 300ms">
      <rect x="${postX(-1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
      <rect x="${postX(1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
    </g>
    ${pivotLine}
    <g data-plank style="transform-origin: ${cx0}px ${pivotY}px">
      <rect x="${cx0 - (notches + 0.7) * unit}" y="${PLANK_Y}" width="${(notches * 2 + 1.4) * unit}" height="${PLANK_H}" rx="6" fill="#b45309" />
      <rect x="${cx0 - (notches + 0.7) * unit + 4}" y="${PLANK_Y + 1}" width="${(notches * 2 + 1.4) * unit - 8}" height="4" rx="2" fill="#f59e0b" opacity="0.6" />
      ${ticks}
      <g data-footprints></g>
      <g data-left>${leftRobots}</g>
      <g data-right>${rightRobots}</g>
      ${movers.map((_, i) => `<g data-mover-slot><g data-mover data-mover-index="${i}" class="cursor-grab" style="touch-action: none"></g></g>`).join('')}
    </g>
  </svg>`;
  const svg = boardArea.querySelector('svg');
  const plank = svg.querySelector('[data-plank]');
  const support = svg.querySelector('[data-support]');
  const footprints = svg.querySelector('[data-footprints]');
  const moverSlots = [...svg.querySelectorAll('[data-mover-slot]')];
  const moverEls = [...svg.querySelectorAll('[data-mover]')];
  const mover = moverEls[0]; // 単体の面の mover。2組の面の踊りは両方
  // 2組の面は選んだ組の山の周りに琥珀の点線枠（data-sel-frame）を出す。
  const frameSvg = (count) => {
    const top = PLANK_Y - ROBOT - (count - 1) * robotStack(count) + 2 - NUM_R * 2 - 4;
    return `<rect data-sel-frame x="${cx0 - ROBOT / 2 - 4}" y="${top}" width="${ROBOT + 8}" height="${PLANK_Y - top}" rx="6" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5 4" display="none" />`;
  };
  moverEls.forEach((el, i) => {
    el.innerHTML = robotsSvg(cx0, movers[i].robots) + weightNumSvg(cx0, movers[i].robots, multi ? MOVER_COLORS[i] : undefined) + (multi ? frameSvg(movers[i].robots) : '');
  });
  plank.style.transition = 'none';

  const view = {
    confetti: (opts) => screenConfetti(opts),
    setMood: (mood) => setMoodIn(svg, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      moverEls.forEach((el) =>
        el.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
          { duration: 700, easing: 'ease-in-out' }
        )
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
  const robotsBtnClass =
    'robots-btn min-w-[64px] min-h-[64px] px-4 text-2xl font-bold transition-transform duration-100 active:scale-95 disabled:opacity-40';
  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.dataset.action = 'robots-minus';
  minusBtn.textContent = '−';
  minusBtn.setAttribute('aria-label', 'かるくする');
  minusBtn.className = robotsBtnClass;
  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.dataset.action = 'robots-plus';
  plusBtn.textContent = '＋';
  plusBtn.setAttribute('aria-label', 'おもくする');
  plusBtn.className = robotsBtnClass;
  // 2組の面の選択ボタン（①②。ロボットの小アイコン＋数字。色は盤の数字円と同じ）。
  const selectBtns = multi
    ? movers.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.action = `select-mover-${i + 1}`;
        b.setAttribute('aria-label', i === 0 ? 'ひとつめの ロボット' : 'ふたつめの ロボット');
        b.className = 'min-w-[64px] min-h-[64px] px-2 rounded-lg text-white text-2xl font-bold flex items-center justify-center gap-1 transition-transform duration-100 active:scale-95 disabled:opacity-40';
        b.style.backgroundColor = MOVER_COLORS[i];
        b.innerHTML = `<svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true" class="bg-white rounded-full">${shapeSvg('player')}</svg>${i + 1}`;
        b.addEventListener('click', () => {
          vibrate();
          selectMover(i);
        });
        return b;
      })
    : [];
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
    const allowed = allowedNow();
    leftBtn.disabled = !editing || !allowed.some((p) => p < local.pos);
    rightBtn.disabled = !editing || !allowed.some((p) => p > local.pos);
    selectBtns.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === local.sel));
      b.classList.toggle('ring-4', i === local.sel);
      b.classList.toggle('ring-amber-300', i === local.sel);
    });
    minusBtn.disabled = !editing || local.robots <= 1;
    plusBtn.disabled = !editing || local.robots >= (maxRobots ?? 1);
    runBtn.disabled = local.phase === 'running';
  }

  // クリア演出（星→間→結果ダイアログ。Issue #342）は js/ui-clear.js の共通部品に任せる。
  let clearSequence = null;

  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    const posBtns = posFixed ? [] : [leftBtn, rightBtn];
    const weightBtns = maxRobots ? [minusBtn, plusBtn] : [];
    actionsEl.append(...posBtns, ...selectBtns, ...weightBtns, runBtn);
  }

  function drawMover() {
    moverSlots.forEach((slot, i) => {
      slot.setAttribute('transform', `translate(${local.poses[i] * unit},0)`);
      moverEls[i].dataset.pos = String(local.poses[i]);
      moverEls[i].querySelector('[data-sel-frame]')?.setAttribute('display', i === local.sel ? 'inline' : 'none');
    });
    if (maxRobots) {
      mover.dataset.robots = String(local.robots);
      mover.innerHTML = robotsSvg(cx0, local.robots) + weightNumSvg(cx0, local.robots);
    }
    updateControls();
  }

  function setRobots(robots) {
    const next = Math.max(1, Math.min(maxRobots ?? robots, robots));
    if (local.phase !== 'edit' || next === local.robots) {
      skipClickSfx();
      return;
    }
    local.robots = next;
    drawMover();
  }

  // 動かす組を切り替える（2組の面）。同じ組・操作できない間は何もしない（無音）。
  function selectMover(i) {
    if (local.phase !== 'edit' || i === local.sel) {
      skipClickSfx();
      return;
    }
    local.sel = i;
    drawMover();
  }

  function setPos(pos, via) {
    const allowed = allowedNow();
    const clamped = Math.max(movers[local.sel].side === 'both' ? -notches : 1, Math.min(notches, pos));
    // 0（支点の上）と占有された刻みは、動いてきた向きの次の置ける刻みへ飛ぶ。行き先が無ければ動かさない。
    const forward = clamped >= local.pos;
    const next = allowed.includes(clamped) ? clamped : forward ? allowed.find((p) => p > clamped) : [...allowed].reverse().find((p) => p < clamped);
    if (local.phase !== 'edit' || next === undefined || next === local.pos) {
      skipClickSfx();
      return;
    }
    local.pos = next;
    if (via === 'drag') playSfx('snap');
    drawMover();
  }

  function setTilt(tilt) {
    plank.style.transition = prefersReducedMotion() ? 'none' : `transform ${TILT_MS}ms ease-in-out`;
    plank.style.transform = `rotate(${tilt * TILT_DEG}deg)`;
    plank.dataset.tilt = String(tilt);
  }

  // 足あとのキー：重さが動く面だけ `pos:robots`、位置だけの面は今までどおり pos、2組は `1組目の位置/2組目の位置`。
  function addFootprint(pos, robots) {
    const key = multi ? local.poses.join('/') : maxRobots ? `${pos}:${robots}` : String(pos);
    if (footprints.querySelector(`[data-footprint="${key}"]`)) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.footprint = key;
    g.setAttribute('opacity', '0.25');
    if (multi) {
      g.innerHTML = movers.map((m, i) => `<g transform="translate(${local.poses[i] * unit},0)">${robotsSvg(cx0, m.robots)}</g>`).join('');
    } else {
      g.setAttribute('transform', `translate(${pos * unit},0)`);
      g.innerHTML = robotsSvg(cx0, robots);
    }
    footprints.appendChild(g);
  }

  function resetBoard() {
    local.phase = 'edit';
    local.poses = movers.map((m) => m.start);
    local.robotsList = movers.map((m) => m.robots);
    local.sel = 0;
    setTilt(0);
    support.style.opacity = '1';
    setMoodIn(svg, 'normal');
    drawMover();
  }

  const currentBalance = () =>
    multi ? balance(spec, movers.map((m, i) => ({ pos: local.poses[i], robots: m.robots }))) : balance(spec, local.pos, local.robots);

  function finishRun() {
    local.timer = null;
    setActiveAnimation(null);
    setBackDisabled(false);
    const result = currentBalance();
    if (result.tilt === 0) {
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
    addFootprint(local.pos, local.robots);
    playSfx('tryAgain');
    setMoodIn(svg, 'puzzled');
    shakeBoard(boardArea);
    local.fails += 1;
    if (local.fails === 1) {
      showHint(null, { bird, kind: 'tilt', message: 'もういちど' });
    } else {
      showHint(null, { bird, kind: 'tilt', message: HEAVY_MESSAGE[result.tilt], big: true });
    }
  }

  function run() {
    if (local.phase !== 'edit') return;
    local.phase = 'running';
    updateControls();
    setActiveHandHint(null);
    clearResultBubble(bird);
    vibrate();
    logEvent('run', multi ? { p1: local.poses[0], p2: local.poses[1] } : maxRobots ? { pos: local.pos, robots: local.robots } : { pos: local.pos });
    playSfx('run');
    setBackDisabled(true);
    support.style.opacity = '0';
    setTilt(currentBalance().tilt);
    const delay = prefersReducedMotion() ? 0 : TILT_MS + 100;
    local.timer = setTimeout(finishRun, delay);
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
    local.fails = 0;
    resetBoard();
  }

  leftBtn.addEventListener('click', () => {
    vibrate();
    setPos(local.pos - 1, 'tap');
  });
  rightBtn.addEventListener('click', () => {
    vibrate();
    setPos(local.pos + 1, 'tap');
  });
  minusBtn.addEventListener('click', () => {
    vibrate();
    setRobots(local.robots - 1);
  });
  plusBtn.addEventListener('click', () => {
    vibrate();
    setRobots(local.robots + 1);
  });
  runBtn.addEventListener('click', () => (runBtn.dataset.action === 'retry' ? retry() : run()));

  // ドラッグ：ロボットを横になぞって刻みへ置く。座標はviewBox単位へ換算する。
  let dragging = false;
  function posFromPointer(ev) {
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / boardW, rect.height / BOARD_H);
    const left = rect.left + (rect.width - boardW * scale) / 2;
    return Math.round(((ev.clientX - left) / scale - cx0) / unit);
  }
  const endDrag = () => {
    dragging = false;
  };
  moverEls.forEach((el, i) => {
    el.addEventListener('pointerdown', (ev) => {
      if (local.phase !== 'edit' || posFixed) return;
      if (i !== local.sel) selectMover(i); // 盤のロボットをタップ／ドラッグしてもその組を選べる
      dragging = true;
      setActiveHandHint(null);
      el.setPointerCapture?.(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      if (dragging) setPos(posFromPointer(ev), 'drag');
    });
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  });

  renderQuestion();
  showNormalActions();
  drawMover();
  showStartCue(boardArea); // ステージ開始時に1回（再開では出さない。#497）
  screen.announceQuestion(); // 問い文の吹き出し。「スタート！」が消えてから出る（#497 段B）

  // 未クリアレッスンの最初のステージだけ、◀▶の指ガイドを1回出す（最初の操作で消える）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    const hintBtn = posFixed ? plusBtn : rightBtn.disabled ? leftBtn : rightBtn;
    setActiveHandHint(showHandHint({ from: hintBtn, mode: 'tap' }));
    opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
  }
}
