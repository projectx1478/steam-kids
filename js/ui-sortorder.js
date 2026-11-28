// sort-order（レシピの順番）のplayステップ描画（Issue #292）。トレイのカードをタップしてスロットへ置き、
// 「ためす」で並べた順に手カードが1手ずつ動き（実行アニメ。Issue #712）、違反の手で止まって結果アニメ（こげる・こぼれる・なまのまま・からっぽ）＋違反ペア2枚の点滅。why があれば理由を小鳥の吹き出しに1行出す。
// 画面の骨格・クリア演出・戻る系の無効化はシーソー（ui-seesaw.js）と同じ部品を使う。
import { S } from './state.js';
import { readPlacement, writePlacement, clearPlacement } from './storage.js';
import { isTrial } from './trial-lesson.js';
import { IS_DEV } from './dev-mode.js';
import { firstViolation } from './engine-sortorder.js';
import { logEvent } from './events.js';
import { shapeSvg, setMoodIn, prefersReducedMotion, screenConfetti } from './ui-grid.js';
import { vibrate, fastSteps } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { createOpScreen } from './ui-screen.js';
import { showHandHint } from './ui-hand.js';
import { isLessonCleared } from './ui-picker.js';
import { goToStep, setBackDisabled, setActiveHandHint, setActiveAnimation, STEP_DELAY_MS, FAST_STEP_DELAY_MS } from './ui-step.js';
import { clearResultBubble } from './ui-reaction.js';
import { showClearSequence, recordClear } from './ui-clear.js';
import { dishSvg, DISH_NAMES } from './sortorder-dishes.js';
import { sceneSvg, addIngredient, lightFlame, animateScene } from './sortorder-scene.js';
import { bindStartCueDismiss, showStartCue } from './ui-retry.js';

const SCENE_MS = 2200; // 最後の鍋の場面（結果アニメ）を見せる長さ。タップで飛ばせる
const RUN_REDUCED_MS = 300;
const NEED_MS = 900; // 空きスロットが光る時間

// 実行アニメの手カードの動き（Issue #712）。長さ＝その手の間隔。
const ACT_FRAMES = {
  cut: [0, -6, 6, -6, 6, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
  mix: [[6, 0], [0, 6], [-6, 0], [0, -6], [6, 0]].map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` })),
  bake: [
    { transform: 'scale(1)', boxShadow: '0 0 0 0 #f97316' },
    { transform: 'scale(1.15)', boxShadow: '0 0 0 4px #f97316' },
    { transform: 'scale(1)', boxShadow: '0 0 0 0 #f97316' },
  ],
  put: [
    { transform: 'translateY(-24px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1, offset: 0.6 },
    { transform: 'translateY(-6px)', opacity: 1, offset: 0.8 },
    { transform: 'translateY(0)', opacity: 1 },
  ],
};

// 成功の料理の絵（figure）。dish が無い・絵が未実装なら null（図なしの現行のダイアログ。Issue #712）。
function dishFigure(key) {
  const svg = key ? dishSvg(key, { robot: shapeSvg('player') }) : null;
  if (!svg) return null;
  const fig = document.createElement('figure');
  fig.className = 'so-dish';
  fig.dataset.soDish = key;
  fig.innerHTML = svg;
  const cap = document.createElement('figcaption');
  cap.textContent = DISH_NAMES[key];
  fig.appendChild(cap);
  setMoodIn(fig, 'happy');
  return fig;
}

export function renderSortOrder(root, step) {
  const spec = step.sortOrder;
  const { cards, before } = spec;
  const n = cards.length;
  const byId = new Map(cards.map((c) => [c.id, c]));

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  const local = { slots: new Array(n).fill(null), phase: 'edit', wrong: [], timer: null, anims: [], fails: 0, prev: null, kind: 'ok', sceneShown: false };

  // 置き方の保存・復元（Issue #745）。試しのレッスンでは読まない・書かない。カード id が重複せず cards にあるものだけ採用する。
  const lessonId = S.lesson.lessonId;
  const persistOn = !isTrial() && !IS_DEV;
  const savePlacement = () => {
    if (persistOn) writePlacement(lessonId, step.stepId, 'sortorder', { slots: local.slots });
  };
  if (persistOn) {
    const saved = readPlacement(lessonId, step.stepId, 'sortorder');
    const ids = saved && Array.isArray(saved.slots) && saved.slots.length === n ? saved.slots.filter((id) => id !== null) : null;
    if (ids && ids.every((id) => byId.has(id)) && new Set(ids).size === ids.length) local.slots = saved.slots.slice();
  }
  const clearSaved = () => {
    if (persistOn) clearPlacement(lessonId);
  };

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
  runBtn.textContent = '▶ ためす';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.dataset.action = 'reset';
  resetBtn.className = 'so-reset';
  resetBtn.textContent = '↺ もどす';

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
    if (local.phase === 'failed') {
      local.phase = 'edit';
      clearResultBubble(bird);
    }
    vibrate();
    playSfx('snap');
    local.slots[i] = id;
    savePlacement();
    draw();
  }

  function unplace(id) {
    if (locked()) return skipClickSfx();
    const i = local.slots.indexOf(id);
    if (i < 0) return;
    clearWrong();
    if (local.phase === 'failed') {
      local.phase = 'edit';
      clearResultBubble(bird);
    }
    vibrate();
    local.slots[i] = null; // 穴は詰めない
    savePlacement();
    draw();
  }

  // 台所の場面（svg.so-scene 1枚。ロボットも中に描く）を作り直す。手順の再生中に足した具材もここで消える。
  function setBoard(mood = 'normal') {
    boardArea.querySelectorAll(':scope > .so-scene, :scope > .so-act').forEach((e) => e.remove());
    boardArea.insertAdjacentHTML('afterbegin', sceneSvg(shapeSvg('player')));
    const svg = boardArea.querySelector(':scope > svg.so-scene');
    setMoodIn(svg, mood);
    return svg;
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
    local.anims = [];
    setActiveAnimation(null);
    setBackDisabled(false);
    const order = local.slots;
    const bad = firstViolation(order, before);
    local.prev = { slots: order.slice(), failIndex: bad ? order.indexOf(bad.a) : -1 };
    if (local.phase === 'running' && !local.sceneShown) {
      // 手の再生中に飛ばしたとき：まだ入っていない具材（違反の手まで）を足し、最後の鍋の場面を終端状態で出す。
      const svg = boardArea.querySelector(':scope > svg.so-scene');
      for (let i = svg.querySelectorAll('.so-in').length; i < local.count; i += 1) {
        const card = byId.get(order[i]);
        if (card.act === 'bake') lightFlame(svg);
        addIngredient(svg, i, card.icon, n);
      }
      setMoodIn(svg, local.kind === 'ok' ? 'happy' : 'puzzled');
      animateScene(svg, local.kind).forEach((a) => a.finish());
    }
    boardArea.querySelector('.so-act')?.remove();
    if (!bad) {
      local.phase = 'cleared';
      clearSaved();
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
        figure: dishFigure(spec.dish),
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
    if (bad.why) bird.showBubble(bad.why, { result: 'fail', soWhy: 'true' }); // 破った組の理由を1行（Issue #712）
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
    local.kind = kind;
    local.sceneShown = false;
    const count = bad ? local.slots.indexOf(bad.a) + 1 : n; // 違反は a の手まで再生して止まる
    local.count = count;
    const indexes = local.slots.map((_, i) => i);
    const fast = local.prev
      ? fastSteps(local.prev.slots, local.prev.failIndex, local.slots, indexes)
      : indexes.map(() => false);
    const delayOf = (i) => (fast[i] ? FAST_STEP_DELAY_MS : STEP_DELAY_MS);
    const reduced = prefersReducedMotion();
    const svg = setBoard('normal');
    const act = document.createElement('div');
    act.className = 'so-act';
    boardArea.appendChild(act);
    // 手カードの箱を鍋の真上（場面の座標 150,40）に重ねる。場面は meet で縮むので実寸から割り出す。
    function placeAct() {
      const r = svg.getBoundingClientRect();
      const b = boardArea.getBoundingClientRect();
      const sc = Math.min(r.width / 240, r.height / 160);
      const size = Math.max(28, Math.round(40 * sc));
      const cx = r.left - b.left + (r.width - 240 * sc) / 2 + 150 * sc;
      const cy = r.top - b.top + (r.height - 160 * sc) / 2 + 36 * sc;
      Object.assign(act.style, { width: `${size}px`, height: `${size}px`, left: `${Math.round(cx - size / 2)}px`, top: `${Math.round(cy - size / 2)}px`, fontSize: `${Math.round(size * 0.55)}px` });
      return sc;
    }

    function showScene() {
      act.remove();
      slotsEl.querySelectorAll('.so-now').forEach((e) => e.classList.remove('so-now'));
      local.sceneShown = true;
      setMoodIn(svg, kind === 'ok' ? 'happy' : 'puzzled');
      local.anims = animateScene(svg, kind);
      if (reduced) local.anims.forEach((a) => a.finish()); // 動きを減らす設定は終端の静止画だけ
      local.timer = setTimeout(finishRun, reduced ? RUN_REDUCED_MS : SCENE_MS);
    }
    function playStep(i) {
      const card = byId.get(local.slots[i]);
      act.dataset.act = card.act ?? 'put';
      act.textContent = card.icon;
      const sc = placeAct();
      if (card.act === 'bake') lightFlame(svg);
      slotsEl.querySelectorAll('.so-now').forEach((e) => e.classList.remove('so-now'));
      slotsEl.querySelector(`.so-slot[data-slot="${i}"]`)?.classList.add('so-now');
      const ms = delayOf(i);
      if (!reduced) {
        // 手の動きに重ねて、手の終わり（最後の4分の1）で鍋へ落ちる（個別の translate は transform と別に合成される）。
        local.anims = [
          act.animate(ACT_FRAMES[act.dataset.act], { duration: ms, easing: 'ease-in-out' }),
          act.animate(
            [{ translate: '0 0', opacity: 1 }, { translate: '0 0', opacity: 1, offset: 0.75 }, { translate: `0 ${Math.round(30 * sc)}px`, opacity: 0 }],
            { duration: ms, easing: 'ease-in' }
          ),
        ];
      }
      local.timer = setTimeout(() => {
        const t = addIngredient(svg, i, card.icon, n);
        if (!reduced) t.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 250, easing: 'ease-out' });
        if (i + 1 < count) playStep(i + 1);
        else showScene();
      }, ms);
    }
    playStep(0);
    setActiveAnimation({
      cancel() {
        clearTimeout(local.timer);
        local.anims.forEach((a) => a.cancel());
        local.anims = [];
        setBackDisabled(false);
      },
    });
  }

  function reset() {
    if (locked()) return skipClickSfx();
    vibrate();
    logEvent('retry', {});
    clearResultBubble(bird);
    local.prev = null;
    local.slots = new Array(n).fill(null);
    clearSaved();
    clearWrong();
    local.phase = 'edit';
    setBoard();
    draw();
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    local.fails = 0;
    local.prev = null;
    local.slots = new Array(n).fill(null);
    clearSaved();
    clearWrong();
    local.phase = 'edit';
    setBoard();
    draw();
  }

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', reset);
  // アニメ中の盤のタップは演出を飛ばして結果へ。
  boardArea.addEventListener('pointerdown', () => {
    if (local.phase === 'running') finishRun();
  });

  showNormalActions();
  setBoard();
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
