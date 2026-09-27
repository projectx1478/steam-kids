// やりかた帯（操作の流れをブロック図＋短文で常時表示）と、無操作時の促し（Issue #89）。
// tutorial（なぞり操作型・Issue #81）には出さない。二重の案内でしつこくなるため。
import { arrowSvg } from './ui-commands.js';

export const NUDGE_GLOW_CLASSES = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];

const TODO_CLASSES = ['border-slate-200', 'text-slate-500'];
const CURRENT_CLASSES = ['border-amber-400', 'bg-amber-50', 'text-slate-800', 'font-bold'];
const DONE_CLASSES = ['border-slate-200', 'text-slate-400', 'opacity-60'];
const ALL_STATE_CLASSES = [...new Set([...TODO_CLASSES, ...CURRENT_CLASSES, ...DONE_CLASSES])];

// variant別のブロック定義。playは「おす→ならぶ→じっこう」、fixはinitialCommandsがある
// 「なおす」レッスン用に「けす→たす→じっこう」、predictは選択肢タップの単一ブロック。
const HOWTO = {
  play: [
    { icon: 'arrows', text: 'やじるしを おす' },
    { icon: 'queue', text: 'めいれいが ならぶ' },
    { icon: 'run', text: 'じっこうを おす' },
  ],
  fix: [
    { icon: 'remove', text: '×で けす' },
    { icon: 'arrows', text: 'やじるしで たす' },
    { icon: 'run', text: 'じっこうを おす' },
  ],
  predict: [{ icon: 'options', text: 'とまる ますを タップ' }],
};

function iconHtml(kind) {
  if (kind === 'arrows') return `${arrowSvg('up')}${arrowSvg('right')}`;
  if (kind === 'run') {
    return '<span class="w-6 h-6 rounded bg-emerald-500 text-white flex items-center justify-center text-xs">▶</span>';
  }
  if (kind === 'remove') {
    return '<span class="w-6 h-6 rounded bg-slate-400 text-white flex items-center justify-center text-sm font-bold">×</span>';
  }
  if (kind === 'queue') {
    return '<span class="w-2 h-5 rounded-sm bg-sky-300"></span><span class="w-2 h-5 rounded-sm bg-sky-300"></span>';
  }
  if (kind === 'options') {
    return ['A', 'B', 'C']
      .map(
        (id) =>
          `<span class="w-4 h-4 rounded-full bg-sky-200 text-[8px] font-bold flex items-center justify-center">${id}</span>`
      )
      .join('');
  }
  return '';
}

// renderHowTo(container, variant) -> { setPhase(n) }
// variant: 'play' | 'fix' | 'predict'。containerの末尾に帯を追加する（挿入位置は呼び出し側で
// container=root、他の要素をappendする前に呼ぶことで制御する）。
// setPhase(n): n番目（1始まり）のブロックだけ強調(current)、それより前はdone(✓)、後はtodo。
// n=0または未指定で全ブロックをtodoに戻す（実行中・結果表示中の落ち着いた表示）。
export function renderHowTo(container, variant) {
  const blocks = HOWTO[variant];
  const strip = document.createElement('div');
  strip.className = 'howto-strip flex justify-center items-stretch gap-1 mb-2';
  strip.setAttribute('aria-hidden', 'true');

  const blockEls = blocks.map((block, i) => {
    const el = document.createElement('span');
    el.dataset.phase = String(i + 1);
    el.dataset.state = 'todo';
    el.className =
      'howto-block relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border-2 border-slate-200 text-slate-500 text-[10px] leading-tight text-center';
    el.innerHTML = `<span class="flex items-center justify-center gap-0.5 h-6">${iconHtml(block.icon)}</span><span>${block.text}</span>`;
    const check = document.createElement('span');
    check.className =
      'howto-check hidden absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-xs flex items-center justify-center';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    el.appendChild(check);
    strip.appendChild(el);
    if (i < blocks.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'howto-arrow self-center text-slate-300 text-xs';
      arrow.textContent = '▶';
      strip.appendChild(arrow);
    }
    return el;
  });
  container.appendChild(strip);

  function setPhase(n) {
    blockEls.forEach((el, i) => {
      const phase = i + 1;
      el.classList.remove(...ALL_STATE_CLASSES);
      const check = el.querySelector('.howto-check');
      if (n && phase === n) {
        el.dataset.state = 'current';
        el.classList.add(...CURRENT_CLASSES);
        check.classList.add('hidden');
      } else if (n && phase < n) {
        el.dataset.state = 'done';
        el.classList.add(...DONE_CLASSES);
        check.classList.remove('hidden');
      } else {
        el.dataset.state = 'todo';
        el.classList.add(...TODO_CLASSES);
        check.classList.add('hidden');
      }
    });
  }

  return { setPhase };
}

// createIdleNudge({ getTarget, delayMs, durationMs, maxCount }) -> { poke(), stop() }
// delayMs操作が無ければgetTarget()が返す要素を光らせ、durationMs後に消す。
// 光る回数はmaxCountまで（しつこくしないため）。poke()は操作があった時に呼び、
// タイマーをリセットし現在の点灯を消す。stop()はステップ離脱時・実行中に呼ぶ。
export function createIdleNudge({ getTarget, delayMs = 8000, durationMs = 3000, maxCount = 2 }) {
  let timer = null;
  let hideTimer = null;
  let count = 0;
  let activeEls = [];

  function clearHighlight() {
    activeEls.forEach((el) => {
      delete el.dataset.nudge;
      el.classList.remove(...NUDGE_GLOW_CLASSES);
    });
    activeEls = [];
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function fire() {
    const targets = getTarget();
    if (!targets || targets.length === 0) {
      // 実行中など対象が無い一時的な状態。回数は消費せず後で再試行する。
      arm();
      return;
    }
    count += 1;
    activeEls = targets;
    targets.forEach((el) => {
      el.dataset.nudge = 'true';
      el.classList.add(...NUDGE_GLOW_CLASSES);
    });
    hideTimer = setTimeout(() => {
      clearHighlight();
      arm(); // 無操作が続く限り、maxCountまでは自動で再武装する
    }, durationMs);
  }

  function arm() {
    if (timer) clearTimeout(timer);
    if (count >= maxCount) return;
    timer = setTimeout(fire, delayMs);
  }

  function poke() {
    clearHighlight();
    arm();
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    clearHighlight();
  }

  arm();
  return { poke, stop };
}
