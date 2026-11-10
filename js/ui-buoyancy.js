// predict-slider（うかぶ・しずむ。play.buoyancy）のplayステップ描画（Issue #288・#710）。
// 水そうのロボット（うきわ・にもつつき）に、道具（おもり・ふうせん。最大4個）を付けて「ためす」→ 浮く（上）／沈む（下）／ぴたり（クリア）を見る。
// 数字は出さない。値は道具の大きさ（と、dots の面だけ点の数）で伝え、水そうの段目盛（数字なし）で高さを読む。
// 画面の骨格・ボタン・ヒント・クリア演出は ui-seesaw.js と同じ部品を再利用する。
import { S } from './state.js';
import { buoyancy, toolOf } from './engine-buoyancy.js';
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

const LEVEL_MAX = 6; // 段目盛は ±6 段。これを超える net は端で止める。
const STEPS = LEVEL_MAX * 2 + 2; // 水そうの高さを割る数（上下に半段ずつの余白＋13本の目盛）
const MOVE_MS = 900;
const HINT_MESSAGE = { 1: 'ぷかっと うかんだよ ▲', '-1': 'ずーんと しずんだよ ▼' };
const FOUND_MS = 1500; // find:2 の面で、ぴたりの後に道具を外して編集へ戻るまでの間
const TOOL_NAME = { w: 'おもり', b: 'ふうせん' };

const clampLevel = (net) => Math.max(-LEVEL_MAX, Math.min(LEVEL_MAX, net));
// 高さ k（段）の水そう上端からの位置（%）。0＝水面（真ん中）。
const topOf = (k) => `${((LEVEL_MAX + 1 - k) * 100) / STEPS}%`;
// 道具の絵の直径（値に比例）。
const toolSize = (v) => 18 + v * 9;
const dotsHtml = (n, cls = '') => Array.from({ length: n }, () => `<span class="bu-dot ${cls}"></span>`).join('');

function balloonHtml(v) {
  const d = toolSize(v);
  return `<div class="bu-bal" data-balloon><i style="width:${d}px;height:${d}px"></i><b></b></div>`;
}
function weightHtml(v) {
  const d = toolSize(v);
  return `<div class="bu-wt" data-weight><b></b><i style="width:${d}px;height:${d}px"></i></div>`;
}

function ringHtml(ring, dots) {
  const size = 64 + ring * 6;
  const sw = ring * 2 + 2;
  const r = (size - sw) / 2;
  const svg = `<svg class="bu-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" data-ring><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f97316" stroke-width="${sw}" /><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 8" /></svg>`;
  const ringDots = dots ? `<div class="bu-ringdots" data-dots style="right:calc(50% + ${size / 2 - 4}px)">${dotsHtml(ring, 'bu-dot--o')}</div>` : '';
  return svg + ringDots;
}

function crateHtml(box, dots) {
  if (!box) return '';
  const hidden = box.hidden === true;
  const size = hidden ? 46 : 18 + box.v * 7;
  const inner = hidden ? '？' : dots ? dotsHtml(box.v) : '';
  return `<div class="bu-crate" data-crate${dots && !hidden ? ' data-dots' : ''} style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.6)}px">${inner}</div>`;
}

function toolIconHtml(kind, v) {
  const d = toolSize(v);
  return `<span class="bu-ic bu-ic--${kind}"><i style="width:${d}px;height:${d}px"></i>${kind === 'b' ? '<b></b>' : ''}</span>`;
}

export function renderBuoyancy(root, step) {
  const spec = step.buoyancy;
  const body = spec.bodies[0];
  const dots = spec.dots === true;

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  // on：付いている道具 id の集合。表示・判定の順は spec.tools の並びにそろえる。
  const local = { on: new Set(), phase: 'edit', timer: null };
  const attached = () => spec.tools.filter((id) => local.on.has(id));

  const screen = createOpScreen({ root, question: step.text ?? 'ぴったり とまる ところは？', stepKey: `${S.lesson.lessonId}:${step.stepId}` });
  const { frame: opScreen, boardArea, actions: actionsEl, bird } = screen;
  opScreen.classList.add('sk-screen--buoyancy');
  bindStartCueDismiss(opScreen, boardArea);
  actionsEl.classList.add('sk-screen-actions--two-row');

  let ticks = '';
  for (let k = LEVEL_MAX; k >= -LEVEL_MAX; k -= 1) {
    const zero = k === 0 ? ' bu-tick--zero' : '';
    ticks += `<div class="bu-tick bu-tick--l${zero}" data-tick="${k}" style="top:${topOf(k)}"></div><div class="bu-tick bu-tick--r${zero}" style="top:${topOf(k)}"></div>`;
  }
  boardArea.innerHTML = `<div class="bu-boards"><div class="bu-tank" data-tank aria-hidden="true">
    <div class="bu-water"></div>${ticks}
    <div data-fail-lines></div>
    <div class="bu-cluster" data-robot style="top:${topOf(0)}"><div data-bob></div></div>
  </div></div>`;
  const tank = boardArea.querySelector('[data-tank]');
  const failLines = tank.querySelector('[data-fail-lines]');
  const robot = tank.querySelector('[data-robot]');
  const bob = tank.querySelector('[data-bob]');
  let bobAnim = null;

  const view = {
    confetti: screenConfetti,
    setMood: (mood) => setMoodIn(tank, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      bob.animate?.(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
        { duration: 700, easing: 'ease-in-out' }
      );
    },
  };

  // 道具ボタン（最大4個）。押すと付く／もう一度で外れる。
  const toolBtns = new Map();
  for (const id of spec.tools) {
    const t = toolOf(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = `tool-${id}`;
    b.setAttribute('aria-label', `${TOOL_NAME[t.kind]}${t.v}`);
    b.setAttribute('aria-pressed', 'false');
    b.className = 'bu-tool transition-transform duration-100 active:scale-95 disabled:opacity-40';
    b.innerHTML = `<span class="bu-badge" aria-hidden="true">✓</span>${toolIconHtml(t.kind, t.v)}<span class="bu-tooldots" aria-hidden="true">${dots ? dotsHtml(t.v) : ''}</span>`;
    if (dots) b.dataset.dots = String(t.v);
    toolBtns.set(id, b);
  }
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
    for (const [id, b] of toolBtns) {
      b.disabled = !editing;
      const on = local.on.has(id);
      b.classList.toggle('bu-tool--on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    runBtn.disabled = local.phase === 'running';
  }

  let clearSequence = null;
  const foundKeys = new Set(); // find:2 の面で、ぴたりになった組（道具 id を並べ替えて連結）

  function showNormalActions() {
    clearSequence?.dispose();
    clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.append(...toolBtns.values(), runBtn);
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

  // ロボット・うきわ・にもつ・付いた道具を描く（ふうせんはロボットの上、おもりは下）。
  function drawRobot() {
    const ids = attached();
    const balloons = ids.filter((id) => toolOf(id).kind === 'b').map((id) => balloonHtml(toolOf(id).v));
    const weights = ids.filter((id) => toolOf(id).kind === 'w').map((id) => weightHtml(toolOf(id).v));
    bob.innerHTML = `<div class="bu-above">${balloons.join('')}</div>${ringHtml(body.ring, dots)}<svg class="bu-robot" viewBox="0 0 64 64" aria-hidden="true">${shapeSvg('player')}</svg>${crateHtml(body.box, dots)}<div class="bu-below">${weights.join('')}</div>`;
    robot.dataset.tools = ids.join(',');
    updateControls();
  }

  function move(net) {
    const level = clampLevel(net);
    robot.style.transition = prefersReducedMotion() ? 'none' : `top ${MOVE_MS}ms ease-in-out`;
    robot.style.top = topOf(level);
    robot.dataset.level = String(level);
    return level;
  }

  function toggleTool(id) {
    if (local.phase !== 'edit') {
      skipClickSfx();
      return;
    }
    if (local.on.has(id)) local.on.delete(id);
    else local.on.add(id);
    drawRobot();
  }

  // 失敗した高さの点線を水そうの壁へ残す（面の中で累積。同じ高さは1本）。
  function addFailLine(level) {
    if (failLines.querySelector(`[data-fail-line="${level}"]`)) return;
    const line = document.createElement('div');
    line.className = 'bu-fail';
    line.dataset.failLine = String(level);
    line.style.top = topOf(level);
    failLines.appendChild(line);
  }

  function resetBoard(clearTools) {
    local.phase = 'edit';
    if (clearTools) local.on.clear();
    robot.style.transition = 'none';
    robot.style.top = topOf(0);
    robot.dataset.level = '0';
    setMoodIn(tank, 'normal');
    drawRobot();
    startBob();
  }

  function finishRun(result, level) {
    local.timer = null;
    setActiveAnimation(null);
    setBackDisabled(false);
    if (result.dir === 0 && spec.find === 2) {
      const key = attached().slice().sort().join(',');
      const again = foundKeys.has(key);
      foundKeys.add(key);
      if (foundKeys.size < 2) {
        // 1つ目のぴたり、または1つ目と同じ組。道具を全部外して編集へ戻す（前の組は見せない）。
        local.phase = 'found';
        updateControls();
        showHint(null, { bird, kind: 'buoyancy', message: again ? 'それは さっきと おなじ' : 'べつの くみあわせも あるよ' });
        setBackDisabled(true);
        local.timer = setTimeout(() => {
          local.timer = null;
          setActiveAnimation(null);
          setBackDisabled(false);
          resetBoard(true);
        }, FOUND_MS);
        setActiveAnimation({
          cancel() {
            clearTimeout(local.timer);
            setBackDisabled(false);
          },
        });
        return;
      }
    }
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
    addFailLine(level);
    playSfx('tryAgain');
    setMoodIn(tank, 'puzzled');
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
    const ids = attached();
    logEvent('run', { tools: ids });
    playSfx('run');
    setBackDisabled(true);
    bobAnim?.cancel();
    bobAnim = null;
    const result = buoyancy(spec, ids);
    const level = move(result.net);
    const delay = prefersReducedMotion() ? 0 : MOVE_MS + 100;
    local.timer = setTimeout(() => finishRun(result, level), delay);
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
    resetBoard(false);
  }

  function replay() {
    vibrate();
    showNormalActions();
    clearResultBubble(bird);
    failLines.innerHTML = '';
    foundKeys.clear();
    resetBoard(true);
  }

  for (const [id, b] of toolBtns) {
    b.addEventListener('click', () => {
      vibrate();
      toggleTool(id);
    });
  }
  runBtn.addEventListener('click', () => (runBtn.dataset.action === 'retry' ? retry() : run()));

  screen.renderQuestion();
  showNormalActions();
  drawRobot();
  startBob();
  showStartCue(boardArea);
  screen.announceQuestion();

  // 未クリアレッスンの最初のステージだけ、道具ボタンの指ガイドを1回出す（最初の操作で消える）。
  if (stageIndex === 0 && !isLessonCleared(S.lesson.lessonId)) {
    setActiveHandHint(showHandHint({ from: toolBtns.get(spec.tools[0]), mode: 'tap' }));
    opScreen.addEventListener('pointerdown', () => setActiveHandHint(null), { once: true });
  }
}
