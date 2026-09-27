// 課題カード（もんだい・目標・やりかたデモ→操作画面）。操作画面には区分バナー・デモ・
// やりかた帯・キャプション・長い指示文を置かない方針のため、それらをここへ集約する（Issue #93）。
import { S } from './state.js';
import { renderInto } from './text-render.js';
import { renderDemo } from './ui-demo.js';
import { renderHowTo } from './ui-guide.js';
import { shapeSvg } from './ui-grid.js';

const CATEGORY_LABEL = { predict: 'もんだい1 よそう', play: 'もんだい2 うごかす' };
const TASK_CARD_KEY = 'steamkids.taskCard';

// taskCardEnabled(): 課題カードを操作画面の前に自動で出すか（既定ON）。
// 検証ハーネス（.claude/verify/config.mjs）がOFFにして「開始→即操作」前提の既存シナリオを
// 保護する（凍結fixtureと同じ考え方。Issue #93）。OFFでも「？」からはいつでも見られる。
export function taskCardEnabled() {
  try {
    return localStorage.getItem(TASK_CARD_KEY) !== 'off';
  } catch {
    return true;
  }
}

// renderTaskCard(root, { kind, text, defaultText, items, howtoVariant, onBegin }) -> void
// kind: 'predict' | 'play'。root.innerHTML はここで初期化する（呼び出し側で空にする必要はない）。
export function renderTaskCard(root, { kind, text, defaultText, items = 0, howtoVariant, onBegin }) {
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'task-card flex flex-col items-center gap-2 py-2';

  const heading = document.createElement('h2');
  heading.className = 'text-sm font-bold text-slate-700';
  heading.textContent = CATEGORY_LABEL[kind] ?? '';
  card.appendChild(heading);

  const goalText = document.createElement('p');
  goalText.className = 'text-xl text-center';
  renderInto(goalText, text ?? defaultText, S.readingLevel, S.furigana);
  card.appendChild(goalText);

  if (kind === 'play') {
    const objectiveRow = document.createElement('div');
    objectiveRow.className = 'objective-row flex justify-center items-center gap-4 text-sm font-bold text-slate-700';
    objectiveRow.innerHTML = `<span class="inline-flex items-center gap-1"><span class="inline-block w-5 h-5">${shapeSvg('flag')}</span>ゴール</span>`;
    if (items > 0) {
      objectiveRow.innerHTML += `<span class="inline-flex items-center gap-1"><span class="inline-block w-5 h-5">${shapeSvg('item')}</span>のこり ${items}</span>`;
    }
    card.appendChild(objectiveRow);
  }

  renderHowTo(card, howtoVariant ?? kind);
  renderDemo(card, kind);

  const beginBtn = document.createElement('button');
  beginBtn.type = 'button';
  beginBtn.dataset.action = 'begin-task';
  beginBtn.textContent = 'はじめる';
  beginBtn.className = 'btn-tactile px-6 py-3 mt-1 bg-sky-500 text-white text-lg';
  beginBtn.addEventListener('click', onBegin);
  card.appendChild(beginBtn);

  root.appendChild(card);
}

// renderShowTaskButton(container, onClick) -> button。操作画面右上の「？」（Issue #93）。
export function renderShowTaskButton(container, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.action = 'show-task';
  btn.setAttribute('aria-label', 'かだいを みる');
  btn.className =
    'min-w-[64px] min-h-[64px] flex items-center justify-center rounded-lg bg-white shadow text-lg font-bold text-sky-600 shrink-0';
  btn.textContent = '？';
  btn.addEventListener('click', onClick);
  container.appendChild(btn);
  return btn;
}
