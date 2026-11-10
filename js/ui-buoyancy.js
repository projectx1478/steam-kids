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
const PUSH_MIN = 12; // 押し込みが発火する最小の距離（px）
const PUSH_MAX = 60; // 押し込める最大の距離（px）
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
  const bodies = spec.bodies;
  const two = bodies.length === 2;
  const dots = spec.dots === true;

  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const stageIndex = playSteps.findIndex((s) => s.stepId === step.stepId);
  const isFinalStage = stageIndex === playSteps.length - 1;

  // on：付いている道具 id の集合。表示・判定の順は spec.tools の並びにそろえる。
  // side：2体の面で、付いている道具の置き場所（0＝左／1＝右）。on にある道具だけ持つ。
  const local = { on: new Set(), side: new Map(), phase: 'edit', timer: null };
  const attached = () => spec.tools.filter((id) => local.on.has(id));
  // 判定に渡す形。1体は道具 id の配列、2体は { tool, body } の配列。
  const assignment = () => (two ? attached().map((tool) => ({ tool, body: local.side.get(tool) })) : attached());
  const idsOn = (i) => attached().filter((id) => !two || local.side.get(id) === i);

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
  const tankHtml = (i) => `<div class="bu-tank${two ? (i === 0 ? ' bu-tank--l' : ' bu-tank--r') : ''}" data-tank data-body="${i}" aria-hidden="true">
    <div class="bu-water"></div>${ticks}
    <div data-fail-lines></div>
    <div class="bu-cluster" data-robot style="top:${topOf(0)}"><div data-bob></div></div>
  </div>`;
  boardArea.innerHTML = `<div class="bu-boards${two ? ' bu-boards--two' : ''}">${bodies.map((_, i) => tankHtml(i)).join('')}</div>`;
  const boards = boardArea.querySelector('.bu-boards');
  const tanks = [...boards.querySelectorAll('[data-tank]')];
  const failLines = tanks.map((t) => t.querySelector('[data-fail-lines]'));
  const robots = tanks.map((t) => t.querySelector('[data-robot]'));
  const bobs = tanks.map((t) => t.querySelector('[data-bob]'));
  let bobAnims = [];

  const view = {
    confetti: screenConfetti,
    setMood: (mood) => setMoodIn(boards, mood),
    celebrateDance() {
      if (prefersReducedMotion()) return;
      for (const bob of bobs) {
        bob.animate?.(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
          { duration: 700, easing: 'ease-in-out' }
        );
      }
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
      const side = two && on ? local.side.get(id) : -1;
      b.classList.toggle('bu-tool--on', on && !two);
      b.classList.toggle('bu-tool--l', side === 0);
      b.classList.toggle('bu-tool--r', side === 1);
      if (two) {
        b.dataset.side = side === 0 ? 'left' : side === 1 ? 'right' : 'none';
        b.firstElementChild.textContent = side === 0 ? '◀' : '▶';
      }
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
    for (const a of bobAnims) a.cancel();
    bobAnims = [];
    if (prefersReducedMotion()) return;
    for (const bob of bobs) {
      if (!bob.animate) continue;
      bobAnims.push(
        bob.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], {
          duration: 1800,
          iterations: Infinity,
          easing: 'ease-in-out',
        })
      );
    }
  }

  // ロボット・うきわ・にもつ・付いた道具を描く（ふうせんはロボットの上、おもりは下）。2体は水そうごとに、その体の道具だけ。
  function drawRobot() {
    bodies.forEach((body, i) => {
      const ids = idsOn(i);
      const balloons = ids.filter((id) => toolOf(id).kind === 'b').map((id) => balloonHtml(toolOf(id).v));
      const weights = ids.filter((id) => toolOf(id).kind === 'w').map((id) => weightHtml(toolOf(id).v));
      bobs[i].innerHTML = `<div class="bu-above">${balloons.join('')}</div>${ringHtml(body.ring, dots)}<svg class="bu-robot" viewBox="0 0 64 64" aria-hidden="true">${shapeSvg('player')}</svg>${crateHtml(body.box, dots)}<div class="bu-below">${weights.join('')}</div>`;
      robots[i].dataset.tools = ids.join(',');
    });
    updateControls();
  }

  function move(nets) {
    return nets.map((net, i) => {
      const level = clampLevel(net);
      robots[i].style.transition = prefersReducedMotion() ? 'none' : `top ${MOVE_MS}ms ease-in-out`;
      robots[i].style.top = topOf(level);
      robots[i].dataset.level = String(level);
      return level;
    });
  }

  // 1体は なし⇔付く。2体は なし→左→右→なし と巡回する。
  function toggleTool(id) {
    if (local.phase !== 'edit') {
      skipClickSfx();
      return;
    }
    if (!two) {
      if (local.on.has(id)) local.on.delete(id);
      else local.on.add(id);
    } else if (!local.on.has(id)) {
      local.on.add(id);
      local.side.set(id, 0);
    } else if (local.side.get(id) === 0) {
      local.side.set(id, 1);
    } else {
      local.on.delete(id);
      local.side.delete(id);
    }
    drawRobot();
  }

  // 失敗した高さの点線を、その水そうの壁へ残す（面の中で累積。同じ高さは1本）。
  function addFailLine(i, level) {
    if (failLines[i].querySelector(`[data-fail-line="${level}"]`)) return;
    const line = document.createElement('div');
    line.className = 'bu-fail';
    line.dataset.failLine = String(level);
    line.style.top = topOf(level);
    failLines[i].appendChild(line);
  }

  function resetBoard(clearTools) {
    local.phase = 'edit';
    if (clearTools) {
      local.on.clear();
      local.side.clear();
    }
    for (const robot of robots) {
      robot.style.transition = 'none';
      robot.style.top = topOf(0);
      robot.dataset.level = '0';
    }
    setMoodIn(boards, 'normal');
    drawRobot();
    startBob();
  }

  function finishRun(result, levels) {
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
    // ぴたりでない水そうにだけ線を残す（2体で片方がぴたりなら、その水そうには残さない）。
    result.nets.forEach((net, i) => {
      if (net !== 0) addFailLine(i, levels[i]);
    });
    playSfx('tryAgain');
    setMoodIn(boards, 'puzzled');
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
    const assign = assignment();
    logEvent('run', { tools: two ? assign.map((a) => `${a.tool}@${a.body}`) : assign });
    playSfx('run');
    setBackDisabled(true);
    for (const a of bobAnims) a.cancel();
    bobAnims = [];
    const result = buoyancy(spec, assign);
    const levels = move(result.nets);
    const delay = prefersReducedMotion() ? 0 : MOVE_MS + 100;
    local.timer = setTimeout(() => finishRun(result, levels), delay);
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
    for (const fl of failLines) fl.innerHTML = '';
    foundKeys.clear();
    resetBoard(true);
  }

  // 押し込み：ロボットを指で下へ押し、離すと「ためす」と同じ run() が走る。edit のときだけ受け、pointerId は1本。
  // 動かさず（PUSH_MIN 未満で）離したとき、pointercancel、道具・ためすボタンの操作では位置を戻して run しない。
  let push = null; // { id, el, startY, dy }
  const pushTop = (el, dy) => {
    el.style.transition = 'none';
    el.style.top = `calc(${topOf(0)} + ${dy}px)`;
  };
  function cancelPush() {
    if (!push) return;
    const { el } = push;
    push = null;
    pushTop(el, 0);
  }
  robots.forEach((el) => {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (ev) => {
      if (local.phase !== 'edit' || push) return;
      push = { id: ev.pointerId, el, startY: ev.clientY, dy: 0 };
      setActiveHandHint(null);
      el.setPointerCapture?.(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      if (!push || push.id !== ev.pointerId || push.el !== el) return;
      push.dy = Math.max(0, Math.min(PUSH_MAX, ev.clientY - push.startY));
      pushTop(el, push.dy);
    });
    el.addEventListener('pointerup', (ev) => {
      if (!push || push.id !== ev.pointerId || push.el !== el) return;
      const moved = push.dy >= PUSH_MIN;
      if (moved && local.phase === 'edit') {
        // 押した位置から結果の位置へ動かす（reduced-motion は transition なしで即時）。
        push = null;
        run();
      } else cancelPush();
    });
    el.addEventListener('pointercancel', (ev) => {
      if (push && push.id === ev.pointerId) cancelPush();
    });
  });

  for (const [id, b] of toolBtns) {
    b.addEventListener('click', () => {
      cancelPush();
      vibrate();
      toggleTool(id);
    });
  }
  runBtn.addEventListener('click', () => {
    cancelPush();
    if (runBtn.dataset.action === 'retry') retry();
    else run();
  });

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
