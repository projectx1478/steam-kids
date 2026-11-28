// unfold-cube（てんかいず・はこ）の描画（Issue #289）。5×3 のマスをタップで塗り、6マスにして「ためす」で判定する。
// 誤りは結果帯の文言なしで、重なる2マス／離れたマスだけが点滅する（赤は使わない）。枚数が6でないときは進まず、結果帯の文言だけ変える。
// 画面の骨格・クリア演出・戻る系の無効化は sort-order（ui-sortorder.js）と同じ部品を使う。
import { S } from './state.js';
import { readPlacement, writePlacement, clearPlacement } from './storage.js';
import { isTrial } from './trial-lesson.js';
import { IS_DEV } from './dev-mode.js';
import { isCubeNet, firstOverlap, disconnectedCells, solutionsOf, foldTree, CUBE_CELLS, firstColorMismatch, baseCell, COLOR_IDS } from './engine-unfold.js';
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

const FOLD_MS = 1200; // 折り上げの動き（全面同時。Issue #713）
const BLINK_MS = 1000; // 折り上げのあと、失敗の点滅・強調を見せる時間（タップで飛ばせる）
const OK_MS = 1200; // 折り上げのあと、成功の点の目を見せる時間
const REDUCED_MS = 300;

const key = (c) => c.x + ',' + c.y;
const byYX = (a, b) => a.y - b.y || a.x - b.x;

// 結果の「はこ」（ロボットが持つ簡易SVGの部品。intro ②は別の立方体 cubeSvg を使う）。
const BOX_G =
  '<g><rect x="16" y="38" width="32" height="22" rx="3" fill="#d6a05a" stroke="#1e293b" stroke-width="2.5"/><rect x="29" y="38" width="6" height="22" fill="#f1d8a8"/></g>';

// さいころの目（3×3 の位置）。
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pipsHtml(n) {
  return PIPS[n]
    .map((i) => `<span class="uf-pip" style="left:${11 + (i % 3) * 18}px;top:${11 + Math.floor(i / 3) * 18}px"></span>`)
    .join('');
}

// --- 折り上げの場面（Issue #713）。foldTree の木をそのまま DOM の入れ子にし、子の面を親の辺で回す。 ---
// dir（親から見た向き）ごとの置き位置・回転の軸・最終の変形。
const FOLD_SPEC = {
  E: { pos: (s) => ({ left: s, top: 0 }), origin: '0 50%', rot: 'rotateY', deg: -90 },
  W: { pos: (s) => ({ left: -s, top: 0 }), origin: '100% 50%', rot: 'rotateY', deg: 90 },
  N: { pos: (s) => ({ left: 0, top: -s }), origin: '50% 100%', rot: 'rotateX', deg: -90 },
  S: { pos: (s) => ({ left: 0, top: s }), origin: '50% 0', rot: 'rotateX', deg: 90 },
};
// 穴（まだ埋まっていない面）：根の子として箱の面の位置に置く。
const HOLE_SPEC = {
  1: { origin: '50% 50%', tf: (s) => `translateZ(${s}px)` },
  2: { origin: '50% 0', tf: () => 'rotateX(90deg)' },
  3: { origin: '50% 100%', tf: () => 'rotateX(-90deg)' },
  4: { origin: '100% 50%', tf: () => 'rotateY(90deg)' },
  5: { origin: '0 50%', tf: () => 'rotateY(-90deg)' },
};

// 場面を wrap に作る。wrap は DOM に入って寸法が出ている前提。戻り値 { size, anims }。
// opts（色ぬり・Issue #813）：colors＝Map(マスkey→'a'|'b'|'c'|'base')、miss＝Set(マスkey)、noHoles＝穴を作らない。
function buildFoldScene(wrap, cells, presetKeys, reduced, opts = {}) {
  const { nodes, over, holes } = foldTree(cells);
  const overKeys = new Set(over.map(key));
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const bw = Math.max(...xs) - minX + 1;
  const bh = Math.max(...ys) - minY + 1;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const s = Math.max(12, Math.min(32, Math.floor(Math.min((W - 8) / bw, (H - 8) / bh))));
  wrap.dataset.foldSize = String(s);
  const scene = document.createElement('div');
  scene.className = 'uf-fold';
  const anims = [];
  const els = new Map();
  nodes.forEach((n) => {
    const el = document.createElement('div');
    const col = opts.colors?.get(key(n));
    el.className =
      'uf-fold-face' +
      (opts.colors ? ' uf-fold-face--col' : presetKeys.has(key(n)) ? ' uf-fold-face--pre' : '') +
      (overKeys.has(key(n)) ? ' uf-fold-face--over' : '') +
      (opts.miss?.has(key(n)) ? ' uf-fold-face--miss' : '');
    if (col) el.dataset.color = col;
    el.dataset.x = String(n.x);
    el.dataset.y = String(n.y);
    el.dataset.face = String(n.face);
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
    els.set(key(n), el);
    if (!n.parent) {
      el.style.left = `${(W - bw * s) / 2 + (n.x - minX) * s}px`;
      el.style.top = `${(H - bh * s) / 2 + (n.y - minY) * s}px`;
      scene.appendChild(el);
      return;
    }
    const sp = FOLD_SPEC[n.dir];
    const { left, top } = sp.pos(s);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transformOrigin = sp.origin;
    const end = `${sp.rot}(${sp.deg}deg)`;
    els.get(key(n.parent)).appendChild(el);
    if (reduced || typeof el.animate !== 'function') {
      el.style.transform = end;
    } else {
      el.style.transform = `${sp.rot}(0deg)`;
      anims.push(el.animate([{ transform: `${sp.rot}(0deg)` }, { transform: end }], { duration: FOLD_MS, easing: 'ease-in-out', fill: 'forwards' }));
    }
  });
  const rootEl = els.get(key(nodes[0]));
  (opts.noHoles ? [] : holes).forEach((f) => {
    if (f === 0) return; // 根は必ず面0を持つ
    const h = document.createElement('div');
    h.className = 'uf-fold-hole';
    h.dataset.face = String(f);
    h.style.width = `${s}px`;
    h.style.height = `${s}px`;
    h.style.transformOrigin = HOLE_SPEC[f].origin;
    h.style.transform = HOLE_SPEC[f].tf(s);
    if (reduced || typeof h.animate !== 'function') {
      h.style.opacity = '1';
    } else {
      h.style.opacity = '0';
      anims.push(h.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: FOLD_MS, fill: 'forwards' }));
    }
    rootEl.appendChild(h);
  });
  wrap.appendChild(scene);
  return { size: s, anims };
}

const robotHtml = (withBox) =>
  `<svg class="so-robot" viewBox="0 -8 64 72" aria-hidden="true">${shapeSvg('player')}${withBox ? BOX_G : ''}</svg>`;

export function renderUnfold(root, step) {
  if (step.unfoldColor) return renderUnfoldColor(root, step);
  const { cols, rows, preset } = step.unfold;
  const presetKeys = new Set(preset.map(key));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { painted: new Map(), phase: 'edit', wrong: new Set(), timer: null, pips: false, foldWrap: null, anims: [] };

  // 置き方の保存・復元（Issue #745）。試しのレッスンでは読まない・書かない。盤の範囲内で preset と重ならないマスだけ採用する。
  const lessonId = S.lesson.lessonId;
  const persistOn = !isTrial() && !IS_DEV;
  const savePlacement = () => {
    if (persistOn) writePlacement(lessonId, step.stepId, 'unfold', { painted: [...local.painted] });
  };
  if (persistOn) {
    const saved = readPlacement(lessonId, step.stepId, 'unfold');
    const cellOk = (e) =>
      Array.isArray(e) && e.length === 2 && e[1] && Number.isInteger(e[1].x) && Number.isInteger(e[1].y) &&
      e[1].x >= 0 && e[1].x < cols && e[1].y >= 0 && e[1].y < rows && e[0] === key(e[1]) && !presetKeys.has(e[0]);
    if (saved && Array.isArray(saved.painted) && saved.painted.every(cellOk)) {
      saved.painted.forEach(([k, c]) => local.painted.set(k, { x: c.x, y: c.y }));
    }
  }

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
  runBtn.textContent = '▶ ためす';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.dataset.action = 'reset';
  resetBtn.className = 'so-reset';
  resetBtn.textContent = '↺ もどす';

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

  // 折り上げの場面を消して結果帯の文言を戻す。
  function removeFold() {
    local.anims.forEach((a) => a.cancel());
    local.anims = [];
    local.foldWrap?.remove();
    local.foldWrap = null;
    msgEl.hidden = false;
  }

  function showFold(cells, reduced) {
    removeFold();
    const wrap = document.createElement('div');
    wrap.className = 'uf-fold-wrap';
    wrap.dataset.unfoldFold = 'true';
    boardArea.insertBefore(wrap, msgEl);
    msgEl.hidden = true;
    local.foldWrap = wrap;
    local.anims = buildFoldScene(wrap, cells, presetKeys, reduced).anims;
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
    if (local.phase === 'failed') {
      local.phase = 'edit';
      clearResultBubble(bird);
    }
    removeFold();
    vibrate();
    playSfx('snap');
    if (local.painted.has(k)) local.painted.delete(k);
    else local.painted.set(k, { x, y });
    savePlacement();
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
    actionsEl.append(resetBtn, runBtn);
  }

  function finishRun() {
    clearTimeout(local.timer);
    local.timer = null;
    local.anims.forEach((a) => a.finish()); // 途中で飛ばしたときは折り上がった形にする
    setActiveAnimation(null);
    setBackDisabled(false);
    if (local.pips) {
      local.phase = 'cleared';
      if (persistOn) clearPlacement(lessonId);
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
    // 理由を事実の1行で（Issue #713。sort-order の #712 と同じ出し方）。
    const why = disconnectedCells(allCells()).length > 0 ? 'はなれた ますが あるよ' : 'ここが かさなるよ';
    bird.showBubble(why, { result: 'fail', ufWhy: 'true' });
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
    removeFold();
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
    showFold(cells, reduced);
    local.timer = setTimeout(finishRun, reduced ? REDUCED_MS : FOLD_MS + (local.pips ? OK_MS : BLINK_MS));
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
        removeFold();
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
    if (persistOn) clearPlacement(lessonId);
    local.painted = new Map();
    local.wrong = new Set();
    local.pips = false;
    local.phase = 'edit';
    removeFold();
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

// --- 色ぬり（unfold-02。Issue #813）。空きマスをタップで なし→a→b→c→なし と塗り、「ためす」で向かい合う組の色を判定する。 ---
function renderUnfoldColor(root, step) {
  const { cols, rows, net, given } = step.unfoldColor;
  const netKeys = new Set(net.map(key));
  const base = baseCell(net);
  const baseKey = base ? key(base) : null;
  const givenMap = new Map(given.map((g) => [key(g), g.c]));
  const blanks = net.filter((c) => !givenMap.has(key(c)) && key(c) !== baseKey).sort(byYX);
  const blankKeys = new Set(blanks.map(key));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { painted: new Map(), phase: 'edit', wrong: new Set(), timer: null, ok: false, foldWrap: null, anims: [] };

  // 置き方の保存・復元（Issue #745）。全要素が「空きマスのkeyと a/b/c」のときだけ採用。試し・開発モードでは読まない・書かない。
  const lessonId = S.lesson.lessonId;
  const persistOn = !isTrial() && !IS_DEV;
  const savePlacement = () => {
    if (persistOn) writePlacement(lessonId, step.stepId, 'unfold-color', { painted: [...local.painted] });
  };
  if (persistOn) {
    const saved = readPlacement(lessonId, step.stepId, 'unfold-color');
    const entryOk = (e) => Array.isArray(e) && e.length === 2 && blankKeys.has(e[0]) && COLOR_IDS.includes(e[1]);
    if (saved && Array.isArray(saved.painted) && saved.painted.every(entryOk)) {
      saved.painted.forEach(([k, c]) => local.painted.set(k, c));
    }
  }

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
  gridEl.dataset.unfoldColor = 'true';
  gridEl.style.setProperty('--uf-cols', String(cols));
  panel.insertBefore(gridEl, actionsEl);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.className = 'so-try';
  runBtn.textContent = '▶ ためす';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.dataset.action = 'reset';
  resetBtn.className = 'so-reset';
  resetBtn.textContent = '↺ もどす';

  const msgEl = document.createElement('div');
  msgEl.className = 'uf-msg';
  msgEl.dataset.unfoldMsg = 'true';
  const robotFrame = document.createElement('div');
  robotFrame.className = 'so-robot-frame';
  boardArea.append(robotFrame, msgEl);

  const locked = () => local.phase === 'running' || local.phase === 'cleared';
  const remaining = () => blanks.length - local.painted.size;
  // 色（given と塗った色）。{ "x,y": c }
  const colorObj = () => Object.fromEntries([...givenMap, ...local.painted]);

  function drawBoard(withBox) {
    robotFrame.innerHTML = robotHtml(withBox);
    setMoodIn(robotFrame, withBox ? 'happy' : 'normal');
  }

  const setMsg = (text) => {
    msgEl.textContent = text;
  };

  function countMsg() {
    if (local.painted.size === 0) return 'どこを ぬる？';
    const k = remaining();
    return k > 0 ? `あと ${k}めん` : '';
  }

  function removeFold() {
    local.anims.forEach((a) => a.cancel());
    local.anims = [];
    local.foldWrap?.remove();
    local.foldWrap = null;
    msgEl.hidden = false;
  }

  function showFold(reduced) {
    removeFold();
    const wrap = document.createElement('div');
    wrap.className = 'uf-fold-wrap';
    wrap.dataset.unfoldFold = 'true';
    boardArea.insertBefore(wrap, msgEl);
    msgEl.hidden = true;
    local.foldWrap = wrap;
    const colors = new Map([...givenMap, ...local.painted]);
    if (baseKey) colors.set(baseKey, 'base');
    local.anims = buildFoldScene(wrap, net, new Set(), reduced, { colors, miss: local.wrong, noHoles: true }).anims;
  }

  function draw() {
    gridEl.innerHTML = '';
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const k = key({ x, y });
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'uf-cell';
        b.dataset.x = String(x);
        b.dataset.y = String(y);
        if (!netKeys.has(k)) {
          b.classList.add('uf-void');
          b.disabled = true;
          b.setAttribute('aria-hidden', 'true');
          gridEl.appendChild(b);
          continue;
        }
        const c = givenMap.get(k) ?? local.painted.get(k);
        if (k === baseKey) b.classList.add('uf-base');
        else if (givenMap.has(k)) b.classList.add('uf-col', 'uf-given');
        else if (c) b.classList.add('uf-col');
        else b.classList.add('uf-blank');
        if (c && k !== baseKey) b.dataset.color = c;
        if (local.wrong.has(k)) b.classList.add(local.phase === 'running' ? 'uf-wrong' : 'uf-wrong-still');
        b.addEventListener('click', () => tap(k));
        gridEl.appendChild(b);
      }
    }
    runBtn.disabled = locked();
    resetBtn.disabled = locked();
  }

  function tap(k) {
    if (locked() || !blankKeys.has(k)) return skipClickSfx();
    setActiveHandHint(null);
    local.wrong = new Set();
    if (local.phase === 'failed') {
      local.phase = 'edit';
      clearResultBubble(bird);
    }
    removeFold();
    vibrate();
    playSfx('snap');
    const i = COLOR_IDS.indexOf(local.painted.get(k));
    if (i === COLOR_IDS.length - 1) local.painted.delete(k);
    else local.painted.set(k, COLOR_IDS[i + 1]);
    savePlacement();
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
    actionsEl.append(resetBtn, runBtn);
  }

  function finishRun() {
    clearTimeout(local.timer);
    local.timer = null;
    local.anims.forEach((a) => a.finish());
    setActiveAnimation(null);
    setBackDisabled(false);
    if (local.ok) {
      local.phase = 'cleared';
      if (persistOn) clearPlacement(lessonId);
      draw();
      drawBoard(true);
      setMsg('いろが そろった！');
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
    bird.showBubble('ここが むかいあうよ', { result: 'fail', ufWhy: 'true' });
  }

  function run() {
    if (locked()) return;
    if (remaining() > 0) {
      skipClickSfx();
      setMsg(`あと ${remaining()}めん`);
      return;
    }
    local.phase = 'running';
    setActiveHandHint(null);
    clearResultBubble(bird);
    removeFold();
    vibrate();
    logEvent('run', {});
    playSfx('run');
    setBackDisabled(true);
    const miss = firstColorMismatch(net, colorObj());
    local.ok = miss === null;
    local.wrong = new Set((miss ?? []).map(key));
    setMsg('');
    draw();
    const reduced = prefersReducedMotion();
    showFold(reduced);
    local.timer = setTimeout(finishRun, reduced ? REDUCED_MS : FOLD_MS + (local.ok ? OK_MS : BLINK_MS));
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
        removeFold();
      },
    });
  }

  function reset() {
    if (locked()) return skipClickSfx();
    if (local.painted.size === 0 && local.wrong.size === 0) return; // 冪等
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    replayState();
  }

  function replayState() {
    if (persistOn) clearPlacement(lessonId);
    local.painted = new Map();
    local.wrong = new Set();
    local.ok = false;
    local.phase = 'edit';
    removeFold();
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
  boardArea.addEventListener('pointerdown', () => {
    if (local.phase === 'running') finishRun();
  });

  showNormalActions();
  drawBoard(false);
  setMsg(countMsg());
  draw();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 1面目だけ、開くたびに指ガイド（記録しない）。塗っても答えにはならないので、空きの先頭マスを指す。
  if (stageIndex === 0 && blanks.length > 0) {
    const el = gridEl.querySelector(`.uf-cell[data-x="${blanks[0].x}"][data-y="${blanks[0].y}"]`);
    if (el) {
      setActiveHandHint(showHandHint({ from: el, mode: 'tap' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
}

// --- intro：展開図 → はこ の静止2枚。円①②をタップして切り替える（冪等）。 ---
const CUBE_FILLS = ['#7dd3fc', '#0ea5e9', '#0369a1']; // 上・左・右（色ぬりでない intro）
const CUBE_POLYS = [
  '120,22 168,46 120,70 72,46',
  '72,46 120,70 120,124 72,100',
  '120,70 168,46 168,100 120,124',
];
const COLOR_HEX = { a: '#2563eb', b: '#16a34a', c: '#db2777' }; // 色ぬり（unfold-02）の3色
const cubeSvg = (fills = CUBE_FILLS) =>
  CUBE_POLYS.map((pts, i) => `<polygon points="${pts}" fill="${fills[i]}" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>`).join('');

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
        `<rect x="${ox + (c.x - minX) * s}" y="${oy + (c.y - minY) * s}" width="${s}" height="${s}" fill="${COLOR_HEX[c.c] ?? '#0ea5e9'}" stroke="#1e293b" stroke-width="2.5"/>`
    )
    .join('');
}

export function renderUnfoldIntro(body, demo) {
  const wrap = document.createElement('div');
  wrap.className = 'uf-intro';
  wrap.dataset.unfoldIntro = 'true';
  // 色つきの展開図なら、②の立方体は上＝face1・左＝face3・右＝face4 のマスの色で塗る。
  let cube = cubeSvg();
  if (demo.net.some((c) => c.c)) {
    const nodes = foldTree(demo.net).nodes;
    const colorOf = (f) => COLOR_HEX[demo.net.find((c) => nodes.some((n) => n.face === f && n.x === c.x && n.y === c.y))?.c] ?? '#0ea5e9';
    cube = cubeSvg([colorOf(1), colorOf(3), colorOf(4)]);
  }
  const slides = [netSvg(demo.net), cube].map((inner, i) => {
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
