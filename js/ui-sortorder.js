// sort-order（レシピの順番）のplayステップ描画（Issue #292）。トレイのカードをタップしてスロットへ置き、
// 「ためす」で判定する。誤りは結果アニメ（こげる・こぼれる・なまのまま・からっぽ）＋違反ペア2枚の点滅（文言なし）。
// 画面の骨格・クリア演出・戻る系の無効化はシーソー（ui-seesaw.js）と同じ部品を使う。
import { S } from './state.js';
import { firstViolation } from './engine-sortorder.js';
import { logEvent } from './events.js';
import { shapeSvg, setMoodIn, prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { createOpScreen } from './ui-screen.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, setBackDisabled, setActiveHandHint, setActiveAnimation } from './ui-step.js';
import { clearResultBubble } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { bindStartCueDismiss, showStartCue } from './ui-retry.js';

const RUN_MS = 2000; // 結果アニメ（3秒以内。タップで飛ばせる）
const RUN_REDUCED_MS = 300;
const NEED_MS = 900; // 空きスロットが光る時間

// --- 結果アニメ用の SVG パーツ（viewBox 120×104。鍋は x20..100・y40..82）---
const FLAME = '<path data-p="flame" d="M34 90c6-10 8-4 12-14 4 8 8 6 10 14M60 90c6-12 8-6 12-16 4 10 8 8 12 16" stroke="#f97316" stroke-width="5" fill="none" stroke-linecap="round" opacity="0"/>';
const STEAM = '<g data-p="steam" opacity="0"><path d="M42 30c-6-6 6-10 0-18M60 30c-6-6 6-10 0-18M78 30c-6-6 6-10 0-18" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g>';
const SMOKE = '<g data-p="smoke" opacity="0"><path d="M40 30c-8-8 8-12 0-22M60 28c-8-8 8-12 0-24M80 30c-8-8 8-12 0-22" stroke="#475569" stroke-width="5" fill="none" stroke-linecap="round"/></g>';
const POT_BODY = (fill) => `<rect data-p="body" x="20" y="40" width="80" height="42" rx="10" fill="${fill}" stroke="#1e293b" stroke-width="3"/><rect x="12" y="46" width="12" height="8" rx="3" fill="#1e293b"/><rect x="96" y="46" width="12" height="8" rx="3" fill="#1e293b"/>`;
const FOOD = (fill) => `<ellipse data-p="food" cx="60" cy="52" rx="28" ry="6" fill="${fill}"/>`;

function sceneSvg(kind) {
  let inner;
  if (kind === 'burn') {
    inner = SMOKE + `<g data-p="pot">${POT_BODY('#94a3b8')}${FOOD('#0c0a09')}<circle cx="46" cy="50" r="3" fill="#57534e"/><circle cx="72" cy="53" r="2.5" fill="#57534e"/></g>` + FLAME;
  } else if (kind === 'spill') {
    inner =
      '<ellipse data-p="puddle" cx="86" cy="96" rx="22" ry="5" fill="#fbbf24" opacity="0"/>' +
      '<circle data-p="drop" cx="84" cy="60" r="4" fill="#fbbf24" opacity="0"/><circle data-p="drop" cx="92" cy="60" r="3" fill="#fbbf24" opacity="0"/>' +
      `<g data-p="pot" style="transform-box:fill-box;transform-origin:center">${POT_BODY('#94a3b8')}${FOOD('#fbbf24')}</g>`;
  } else if (kind === 'raw') {
    inner = `<g data-p="pot">${POT_BODY('#94a3b8')}${FOOD('#fecdd3')}<ellipse data-p="food2" cx="60" cy="49" rx="12" ry="5" fill="#fff1f2" stroke="#fda4af" stroke-width="2"/></g>` + FLAME;
  } else if (kind === 'empty') {
    inner =
      `<g data-p="pot">${POT_BODY('#94a3b8')}<ellipse cx="60" cy="52" rx="28" ry="6" fill="#64748b"/></g>` +
      '<g data-p="lid" style="transform-box:fill-box;transform-origin:center"><path d="M24 40a36 18 0 0 1 72 0z" fill="#cbd5e1" stroke="#1e293b" stroke-width="3"/><circle cx="60" cy="24" r="4" fill="#1e293b"/></g>' +
      FLAME;
  } else if (kind === 'ok') {
    inner = STEAM + `<g data-p="pot">${POT_BODY('#94a3b8')}${FOOD('#fbbf24')}</g>` + FLAME;
  } else {
    inner = `<g data-p="pot">${POT_BODY('#94a3b8')}</g>`;
  }
  return `<svg class="so-scene" viewBox="0 0 120 104" aria-hidden="true" data-scene="${kind}">${inner}</svg>`;
}

// 料理人役のロボット（既存の shapeSvg('player') に帽子を重ねる。新キャラではない）。
const robotHtml = () =>
  `<svg class="so-robot" viewBox="0 -8 64 72" aria-hidden="true">${shapeSvg('player')}<path d="M18 8c-6-2-4-12 4-11 3-6 17-6 20 0 8-1 10 9 4 11z" fill="#fff" stroke="#1e293b" stroke-width="2"/></svg>`;

// 結果アニメの再生（Web Animations）。返り値の animations を finish() すると終端状態になる。
function animateScene(svg, kind) {
  const q = (p) => svg.querySelectorAll(`[data-p="${p}"]`);
  const go = (el, frames, ms, delay = 0, extra = {}) => el.animate(frames, { duration: ms, delay, fill: 'forwards', easing: 'ease-in-out', ...extra });
  const all = [];
  const add = (p, frames, ms, delay, extra) => q(p).forEach((el) => all.push(go(el, frames, ms, delay, extra)));
  if (kind === 'ok') {
    add('flame', [{ opacity: 0 }, { opacity: 1 }], 300);
    add('steam', [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 0.95, transform: 'translateY(0)' }], 1200, 300);
  } else if (kind === 'burn') {
    add('flame', [{ opacity: 0 }, { opacity: 1 }], 300);
    add('body', [{ fill: '#94a3b8' }, { fill: '#292524' }], 1000, 300);
    add('smoke', [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], 1200, 500);
  } else if (kind === 'spill') {
    add('pot', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(40deg) translateX(4px)' }], 700, 200);
    add('drop', [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 1, transform: 'translateY(34px)' }], 700, 600);
    add('puddle', [{ opacity: 0, transform: 'scaleX(0.2)' }, { opacity: 1, transform: 'scaleX(1)' }], 700, 1100);
  } else if (kind === 'raw') {
    add('flame', [{ opacity: 0 }, { opacity: 1 }], 300);
    add('food2', [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], 900, 400, { iterations: 2 });
  } else if (kind === 'empty') {
    add('flame', [{ opacity: 0 }, { opacity: 1 }], 300);
    add('lid', [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-16px) rotate(-14deg)' }], 800, 500);
  } else {
    add('pot', [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], 700, 200);
  }
  return all;
}

export function renderSortOrder(root, step) {
  const spec = step.sortOrder;
  const { cards, before } = spec;
  const n = cards.length;
  const byId = new Map(cards.map((c) => [c.id, c]));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { slots: new Array(n).fill(null), phase: 'edit', wrong: [], timer: null, anims: [], fails: 0 };

  const screen = createOpScreen({ root, question: step.text, stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, panel, actions: actionsEl, bird } = screen;
  opScreen.classList.add('sk-screen--sortorder');
  actionsEl.classList.add('sk-screen-actions--sortorder');
  boardArea.classList.add('so-board');
  bindStartCueDismiss(opScreen, boardArea);
  screen.renderQuestion();

  const slotsEl = document.createElement('div');
  slotsEl.className = 'so-grid';
  slotsEl.dataset.soSlots = 'true';
  const trayEl = document.createElement('div');
  trayEl.className = 'so-grid';
  trayEl.dataset.soTray = 'true';
  for (const el of [slotsEl, trayEl]) {
    el.style.setProperty('--so-n', String(n));
    el.style.setProperty('--so-cols', String(n <= 4 ? n : 3));
  }
  panel.insertBefore(slotsEl, actionsEl);
  panel.insertBefore(trayEl, actionsEl);

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

  function cardEl(card, tag = 'button') {
    const d = document.createElement(tag);
    if (tag === 'button') d.type = 'button';
    d.className = 'so-card';
    d.dataset.cardId = card.id;
    const ic = document.createElement('span');
    ic.className = 'so-ic';
    ic.textContent = card.icon;
    const tx = document.createElement('span');
    tx.className = 'so-tx';
    renderInto(tx, card.text, S.readingLevel, S.furigana);
    d.append(ic, tx);
    return d;
  }

  const locked = () => local.phase === 'running' || local.phase === 'cleared';

  function draw() {
    slotsEl.innerHTML = '';
    local.slots.forEach((id, i) => {
      const s = document.createElement('div');
      s.className = 'so-slot';
      s.dataset.slot = String(i);
      const no = document.createElement('span');
      no.className = 'so-no';
      no.textContent = String(i + 1);
      s.appendChild(no);
      if (id) {
        s.dataset.cardId = id;
        if (local.wrong.includes(id)) s.classList.add('so-wrong');
        const c = cardEl(byId.get(id));
        c.addEventListener('click', () => unplace(id));
        s.appendChild(c);
      }
      slotsEl.appendChild(s);
    });
    trayEl.innerHTML = '';
    for (const card of cards) {
      if (local.slots.includes(card.id)) {
        const h = document.createElement('div');
        h.className = 'so-hole';
        trayEl.appendChild(h);
        continue;
      }
      const c = cardEl(card);
      c.addEventListener('click', () => place(card.id));
      trayEl.appendChild(c);
    }
    runBtn.disabled = locked();
    resetBtn.disabled = locked();
  }

  function clearWrong() {
    local.wrong = [];
  }

  function place(id) {
    if (locked()) return skipClickSfx();
    const i = local.slots.indexOf(null);
    if (i < 0 || local.slots.includes(id)) return skipClickSfx();
    setActiveHandHint(null);
    clearWrong();
    if (local.phase === 'failed') local.phase = 'edit';
    vibrate();
    playSfx('snap');
    local.slots[i] = id;
    draw();
  }

  function unplace(id) {
    if (locked()) return skipClickSfx();
    const i = local.slots.indexOf(id);
    if (i < 0) return;
    clearWrong();
    if (local.phase === 'failed') local.phase = 'edit';
    vibrate();
    local.slots[i] = null; // 穴は詰めない
    draw();
  }

  function setBoard(kind, mood = 'normal') {
    boardArea.querySelectorAll(':scope > .so-robot-frame, :scope > .so-scene-wrap').forEach((e) => e.remove());
    const rf = document.createElement('div');
    rf.className = 'so-robot-frame';
    rf.innerHTML = robotHtml();
    const sw = document.createElement('div');
    sw.className = 'so-scene-wrap';
    sw.innerHTML = sceneSvg(kind);
    boardArea.append(rf, sw);
    setMoodIn(rf, mood);
    return { rf, sw, svg: sw.querySelector('svg') };
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
    local.anims.forEach((a) => a.finish());
    local.anims = [];
    setActiveAnimation(null);
    setBackDisabled(false);
    const order = local.slots;
    const bad = firstViolation(order, before);
    if (!bad) {
      local.phase = 'cleared';
      draw();
      setMoodIn(boardArea, 'happy');
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
    local.wrong = [bad.a, bad.b];
    local.fails += 1;
    draw();
    setMoodIn(boardArea, 'puzzled');
    playSfx('tryAgain');
  }

  function run() {
    if (locked()) return;
    const empty = local.slots.map((id, i) => (id ? -1 : i)).filter((i) => i >= 0);
    if (empty.length > 0) {
      // 空きスロットが光る（文言なし）。実行はしない。
      skipClickSfx();
      slotsEl.querySelectorAll('.so-slot').forEach((s) => {
        if (empty.includes(Number(s.dataset.slot))) {
          s.classList.add('so-need');
          setTimeout(() => s.classList.remove('so-need'), NEED_MS);
        }
      });
      return;
    }
    local.phase = 'running';
    clearWrong();
    draw();
    setActiveHandHint(null);
    clearResultBubble(bird);
    vibrate();
    logEvent('run', {});
    playSfx('run');
    setBackDisabled(true);
    const bad = firstViolation(local.slots, before);
    const kind = bad ? bad.fail ?? 'none' : 'ok';
    const { svg } = setBoard(kind, 'normal');
    const reduced = prefersReducedMotion();
    local.anims = reduced ? [] : animateScene(svg, kind);
    local.timer = setTimeout(finishRun, reduced ? RUN_REDUCED_MS : RUN_MS);
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        setBackDisabled(false);
      },
    });
  }

  function reset() {
    if (locked()) return skipClickSfx();
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    local.slots = new Array(n).fill(null);
    clearWrong();
    local.phase = 'edit';
    setBoard('idle');
    draw();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    local.fails = 0;
    local.slots = new Array(n).fill(null);
    clearWrong();
    local.phase = 'edit';
    setBoard('idle');
    draw();
  }

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', reset);
  // アニメ中の盤のタップは演出を飛ばして結果へ。
  boardArea.addEventListener('pointerdown', () => {
    if (local.phase === 'running') finishRun();
  });

  showNormalActions();
  setBoard('idle');
  draw();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 未クリアレッスンの最初の面だけ、1まいめのカードへ指ガイド（文字なし）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    const first = trayEl.querySelector('.so-card');
    if (first) {
      setActiveHandHint(showHandHint({ from: first, mode: 'tap' }));
      opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
    }
  }
}
