// unfold-cube（てんかいず・はこ）の描画（Issue #289）。5×3 のマスをタップで塗り、6マスにして「ためす」で判定する。
// 誤りは結果帯の文言なしで、重なる2マス／離れたマスだけが点滅する（赤は使わない）。枚数が6でないときは進まず、結果帯の文言だけ変える。
// 画面の骨格・クリア演出・戻る系の無効化は sort-order（ui-sortorder.js）と同じ部品を使う。
import { S } from './state.js';
import { isCubeNet, firstOverlap, disconnectedCells, solutionsOf, CUBE_CELLS } from './engine-unfold.js';
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

const BLINK_MS = 2000; // 失敗の点滅（3秒以内。タップで飛ばせる）
const OK_MS = 1200; // 成功の点の目を見せる時間
const REDUCED_MS = 300;

const key = (c) => c.x + ',' + c.y;
const byYX = (a, b) => a.y - b.y || a.x - b.x;

// 結果の「はこ」（ロボットが持つ簡易SVGの部品。intro ②は別の立方体 CUBE_SVG を使う）。
const BOX_G =
  '<g><rect x="16" y="38" width="32" height="22" rx="3" fill="#d6a05a" stroke="#1e293b" stroke-width="2.5"/><rect x="29" y="38" width="6" height="22" fill="#f1d8a8"/></g>';

// さいころの目（3×3 の位置）。
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pipsHtml(n) {
  return PIPS[n]
    .map((i) => `<span class="uf-pip" style="left:${11 + (i % 3) * 18}px;top:${11 + Math.floor(i / 3) * 18}px"></span>`)
    .join('');
}

const robotHtml = (withBox) =>
  `<svg class="so-robot" viewBox="0 -8 64 72" aria-hidden="true">${shapeSvg('player')}${withBox ? BOX_G : ''}</svg>`;

export function renderUnfold(root, step) {
  const { cols, rows, preset } = step.unfold;
  const presetKeys = new Set(preset.map(key));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { painted: new Map(), phase: 'edit', wrong: new Set(), timer: null, pips: false };

  const screen = createOpScreen({ root, question: step.text, stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, panel, actions: actionsEl, bird } = screen;
  opScreen.classList.add('sk-screen--sortorder', 'sk-screen--unfold');
  actionsEl.classList.add('sk-screen-actions--sortorder');
  boardArea.classList.add('so-board');
  bindStartCueDismiss(opScreen, boardArea);
  screen.renderQuestion();

  const gridEl = document.createElement('div');
  gridEl.className = 'uf-grid';
  gridEl.dataset.unfoldGrid = 'true';
  gridEl.style.setProperty('--uf-cols', String(cols));
  panel.insertBefore(gridEl, actionsEl);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.className = 'so-try';
  runBtn.textContent = 'ためす';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.dataset.action = 'reset';
  resetBtn.className = 'so-reset';
  resetBtn.textContent = 'やりなおす';

  const msgEl = document.createElement('div');
  msgEl.className = 'uf-msg';
  msgEl.dataset.unfoldMsg = 'true';
  const robotFrame = document.createElement('div');
  robotFrame.className = 'so-robot-frame';
  boardArea.append(robotFrame, msgEl);

  const locked = () => local.phase === 'running' || local.phase === 'cleared';
  const allCells = () => [...preset, ...local.painted.values()];

  function drawBoard(withBox) {
    robotFrame.innerHTML = robotHtml(withBox);
    setMoodIn(robotFrame, withBox ? 'happy' : 'normal');
  }

  function setMsg(text) {
    msgEl.textContent = text;
  }

  function countMsg() {
    if (local.painted.size === 0) return 'どこを ぬる？';
    const total = allCells().length;
    if (total < CUBE_CELLS) return `あと ${CUBE_CELLS - total}ます`;
    if (total > CUBE_CELLS) return 'ひとつ けそう';
    return '';
  }

  function draw() {
    gridEl.innerHTML = '';
    const order = local.pips ? allCells().sort(byYX).map(key) : [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const k = key({ x, y });
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'uf-cell';
        b.dataset.x = String(x);
        b.dataset.y = String(y);
        const isPre = presetKeys.has(k);
        const isPaint = local.painted.has(k);
        if (isPre) b.classList.add('uf-pre');
        if (isPaint) b.classList.add('uf-paint');
        if (local.pips && (isPre || isPaint)) {
          b.classList.add('uf-ok');
          b.innerHTML = pipsHtml(order.indexOf(k) + 1);
        }
        if (local.wrong.has(k)) b.classList.add(local.phase === 'running' ? 'uf-wrong' : 'uf-wrong-still');
        b.addEventListener('click', () => toggle(x, y));
        gridEl.appendChild(b);
      }
    }
    runBtn.disabled = locked();
    resetBtn.disabled = locked();
  }

  function toggle(x, y) {
    const k = key({ x, y });
    if (locked() || presetKeys.has(k)) return skipClickSfx();
    setActiveHandHint(null);
    local.wrong = new Set();
    if (local.phase === 'failed') local.phase = 'edit';
    vibrate();
    playSfx('snap');
    if (local.painted.has(k)) local.painted.delete(k);
    else local.painted.set(k, { x, y });
    setMsg(countMsg());
    draw();
  }

  const view = {
    confetti: screenConfetti,
    setMood: (mood) => setMoodIn(boardArea, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      boardArea.querySelector('.so-robot')?.animate(
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
    actionsEl.append(runBtn, resetBtn);
  }

  function finishRun() {
    clearTimeout(local.timer);
    local.timer = null;
    setActiveAnimation(null);
    setBackDisabled(false);
    if (local.pips) {
      local.phase = 'cleared';
      draw();
      drawBoard(true);
      setMsg('はこが できた！');
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
    draw(); // 点滅を止め、枠だけ残す
    setMoodIn(boardArea, 'puzzled');
    playSfx('tryAgain');
  }

  function run() {
    if (locked()) return;
    const cells = allCells();
    if (cells.length !== CUBE_CELLS) {
      // 進まない。結果帯の文言だけ（イベントなし・点滅なし）。
      skipClickSfx();
      setMsg(cells.length < CUBE_CELLS ? `あと ${CUBE_CELLS - cells.length}ます` : 'ひとつ けそう');
      return;
    }
    local.phase = 'running';
    setActiveHandHint(null);
    clearResultBubble(bird);
    vibrate();
    logEvent('run', {});
    playSfx('run');
    setBackDisabled(true);
    local.wrong = new Set();
    local.pips = false;
    if (isCubeNet(cells)) {
      local.pips = true;
    } else {
      const far = disconnectedCells(cells);
      const bad = far.length > 0 ? far : firstOverlap(cells) ?? [];
      local.wrong = new Set(bad.map(key));
    }
    setMsg('');
    draw();
    const reduced = prefersReducedMotion();
    local.timer = setTimeout(finishRun, reduced ? REDUCED_MS : local.pips ? OK_MS : BLINK_MS);
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
      },
    });
  }

  function reset() {
    if (locked()) return skipClickSfx();
    if (local.painted.size === 0 && local.wrong.size === 0) return; // 冪等（2回目以降は何も起きない）
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    replayState();
  }

  function replayState() {
    local.painted = new Map();
    local.wrong = new Set();
    local.pips = false;
    local.phase = 'edit';
    drawBoard(false);
    setMsg(countMsg());
    draw();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    replayState();
  }

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', reset);
  // 点滅・点の目の途中で盤のタップは演出を飛ばして結果へ。
  boardArea.addEventListener('pointerdown', () => {
    if (local.phase === 'running') finishRun();
  });

  showNormalActions();
  drawBoard(false);
  setMsg(countMsg());
  draw();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 最初の面だけ、開くたびに指ガイド（文字なし・記録しない）。答えを見せないよう、
  // preset に隣る空きマスのうち正解（solutionsOf の先頭）に含まれないマスを指す。
  if (stageIndex === 0) {
    const solKeys = new Set((solutionsOf(cols, rows, preset)[0] || []).map(key));
    const target = preset
      .flatMap((c) => [
        { x: c.x + 1, y: c.y },
        { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y + 1 },
        { x: c.x, y: c.y - 1 },
      ])
      .find((c) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows && !presetKeys.has(key(c)) && !solKeys.has(key(c)));
    const el = target && gridEl.querySelector(`.uf-cell[data-x="${target.x}"][data-y="${target.y}"]`);
    if (el) {
      setActiveHandHint(showHandHint({ from: el, mode: 'tap' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
}

// --- intro：展開図 → はこ の静止2枚。円①②をタップして切り替える（冪等）。 ---
const CUBE_SVG =
  '<polygon points="120,22 168,46 120,70 72,46" fill="#7dd3fc" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<polygon points="72,46 120,70 120,124 72,100" fill="#0ea5e9" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<polygon points="120,70 168,46 168,100 120,124" fill="#0369a1" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>';

function netSvg(net) {
  const xs = net.map((c) => c.x);
  const ys = net.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 1;
  const h = Math.max(...ys) - minY + 1;
  const s = Math.min(36, Math.floor(220 / w), Math.floor(140 / h));
  const ox = (240 - w * s) / 2;
  const oy = (160 - h * s) / 2;
  return net
    .map(
      (c) =>
        `<rect x="${ox + (c.x - minX) * s}" y="${oy + (c.y - minY) * s}" width="${s}" height="${s}" fill="#0ea5e9" stroke="#1e293b" stroke-width="2.5"/>`
    )
    .join('');
}

export function renderUnfoldIntro(body, demo) {
  const wrap = document.createElement('div');
  wrap.className = 'uf-intro';
  wrap.dataset.unfoldIntro = 'true';
  const slides = [netSvg(demo.net), CUBE_SVG].map((inner, i) => {
    const d = document.createElement('div');
    d.className = 'uf-slide';
    d.dataset.slide = String(i + 1);
    d.innerHTML = `<svg viewBox="0 0 240 160" aria-label="${i === 0 ? 'てんかいず' : 'はこ'}">${inner}</svg>`;
    return d;
  });
  const dots = document.createElement('div');
  dots.className = 'uf-dots';
  const dotEls = ['①', '②'].map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'uf-dot';
    b.dataset.i = String(i + 1);
    b.textContent = t;
    return b;
  });
  dots.append(...dotEls);
  function show(i) {
    slides.forEach((s, j) => s.classList.toggle('uf-hide', j !== i - 1));
    dotEls.forEach((d, j) => d.classList.toggle('uf-dot-on', j === i - 1));
  }
  dotEls.forEach((d, j) =>
    d.addEventListener('click', () => {
      setActiveHandHint(null);
      show(j + 1); // すでにその絵なら何も変わらない（冪等）
    })
  );
  show(1);
  wrap.append(...slides, dots);
  body.appendChild(wrap);
  // 指ガイド：intro を開くたびに出す（記録しない）。切替の②を指す。
  setActiveHandHint(showHandHint({ from: dotEls[1], mode: 'tap' }));
}
