// intro・predict・playの簡易デモ（Issue #91）。実盤面ではなく操作の流れを示す
// 最小限のアイコン列。CSSアニメで2周再生して最終コマで停止し、「もういちど みる」で
// 再生し直せる。reduced-motion時は①②③を静止で並べる（見出しは<h2>・<span>で書き、
// <p>は使わない。ui-play.jsのc1-goal-objectiveがpromptの直後<p>をxpathで参照するため）。
import { prefersReducedMotion } from './ui-grid.js';
import { arrowSvg } from './ui-commands.js';

const FRAME_MS = 900;
const CYCLES = 2;
const CIRCLED = ['①', '②', '③'];

// kind: 'play' -> やじるしを おす→めいれいが ならぶ→じっこうを おす
//       'predict' -> ますをタップ
const SEQUENCES = {
  play: ['arrow', 'queue', 'run'],
  predict: ['tap'],
};

function fingerSvg() {
  return `<svg viewBox="0 0 24 24" class="w-4 h-4 text-slate-700" fill="currentColor" aria-hidden="true">
    <path d="M9 2a2 2 0 0 1 2 2v7h1V6a2 2 0 1 1 4 0v5h1V8a2 2 0 1 1 4 0v6c0 4-3 7-7 7h-1c-3 0-5-1-6-3l-3-5a2 2 0 0 1 3-2.5L9 12V4a2 2 0 0 1 0-2Z"/>
  </svg>`;
}

function frameHtml(icon, active) {
  const finger = active ? `<span class="absolute -bottom-2 -right-2">${fingerSvg()}</span>` : '';
  if (icon === 'arrow') {
    return `<span class="relative inline-flex items-center justify-center w-10 h-10 rounded-lg ${active ? 'bg-sky-500 text-white' : 'bg-sky-100 text-sky-500'}">${arrowSvg('up')}${finger}</span>`;
  }
  if (icon === 'queue') {
    return `<span class="inline-flex items-center justify-center gap-0.5 w-10 h-10 rounded-lg ${active ? 'bg-sky-200' : 'bg-slate-100'}">
      <span class="w-2 h-5 rounded-sm bg-sky-400"></span><span class="w-2 h-5 rounded-sm bg-sky-400"></span>
    </span>`;
  }
  if (icon === 'run') {
    return `<span class="relative inline-flex items-center justify-center w-10 h-10 rounded-lg text-[10px] font-bold ${active ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'}">じっこう${finger}</span>`;
  }
  // tap
  return `<span class="relative inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sky-700 ${active ? 'bg-sky-200' : 'bg-sky-50'}">B${finger}</span>`;
}

// renderDemo(container, kind) -> 追加したdemo-widget要素。kind: 'play' | 'predict'。
export function renderDemo(container, kind) {
  const seq = SEQUENCES[kind];
  const wrap = document.createElement('div');
  wrap.className = 'demo-widget flex flex-col items-center gap-2 my-2';
  wrap.dataset.demo = kind;

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';
  wrap.appendChild(row);

  const reduced = prefersReducedMotion();

  if (reduced) {
    row.innerHTML = seq
      .map(
        (icon, i) =>
          `<span class="flex flex-col items-center gap-0.5">${frameHtml(icon, false)}<span class="text-[10px]">${CIRCLED[i]}</span></span>`
      )
      .join('');
    container.appendChild(wrap);
    return wrap;
  }

  let frameIndex = 0;
  let timer = null;

  function paint() {
    row.innerHTML = seq.map((icon, i) => frameHtml(icon, i === frameIndex)).join('');
  }

  function play() {
    if (timer) clearInterval(timer);
    frameIndex = 0;
    paint();
    let cycles = 0;
    timer = setInterval(() => {
      frameIndex += 1;
      if (frameIndex >= seq.length) {
        frameIndex = 0;
        cycles += 1;
        if (cycles >= CYCLES) {
          clearInterval(timer);
          frameIndex = seq.length - 1;
          paint();
          return;
        }
      }
      paint();
    }, FRAME_MS);
  }

  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.dataset.action = 'demo-replay';
  replayBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-slate-100 text-xs transition-transform duration-100 active:scale-95';
  replayBtn.textContent = '▶ もういちど みる';
  replayBtn.addEventListener('click', play);
  wrap.appendChild(replayBtn);

  play();
  container.appendChild(wrap);
  return wrap;
}
