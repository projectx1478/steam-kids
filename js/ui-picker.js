// 単元マップ（「しま」）の描画。レッスンをクリアするとスタンプ、単元全クリアで旗が立つ（Issue #58）。
// クリア判定はanalytics.jsのcomputeLessonStatus相当（summarize）を再利用し、判定ロジックを重複させない。
import { loadLesson } from './lesson-loader.js';
import { getEvents } from './events.js';
import { summarize } from './analytics.js';

function isCleared(lessonStatus, lessonId) {
  return lessonStatus[lessonId]?.status === 'cleared';
}

function islandSvg() {
  return `<svg viewBox="0 0 200 100" class="absolute inset-0 w-full h-full -z-10" aria-hidden="true">
    <ellipse cx="100" cy="70" rx="90" ry="26" fill="#a7f3d0" stroke="#34d399" stroke-width="2" />
    <path d="M60 68 L100 20 L140 68 Z" fill="#6ee7b7" stroke="#34d399" stroke-width="2" />
  </svg>`;
}

function stampSvg() {
  return `<svg viewBox="0 0 32 32" class="w-7 h-7" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="#fecdd3" stroke="#e11d48" stroke-width="2" />
    <path d="M9 16l5 5 9-11" fill="none" stroke="#e11d48" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function flagSvg() {
  return `<svg viewBox="0 0 32 32" class="w-7 h-7" aria-hidden="true">
    <line x1="6" y1="4" x2="6" y2="28" stroke="#92400e" stroke-width="2" stroke-linecap="round" />
    <path d="M6 5 L26 10 L6 15 Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round" />
  </svg>`;
}

// data-lesson-idを持つボタン本体はタイトル文字列のみを持つ（既存シナリオlesson-picker.mjsの
// textContent完全一致テストを壊さないため）。スタンプはボタン外のsiblingとして重ねる。
async function createLessonStop(lessonId, cleared, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'relative inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.lessonId = lessonId;
  btn.className = 'lesson-pick-btn min-h-[48px] px-4 rounded-xl bg-sky-500 text-white text-lg';
  try {
    btn.textContent = (await loadLesson(lessonId)).title;
  } catch {
    btn.textContent = lessonId;
  }
  btn.addEventListener('click', () => onPick(lessonId));
  wrap.appendChild(btn);

  if (cleared) {
    const stamp = document.createElement('span');
    stamp.className = 'lesson-stamp absolute -top-2 -right-2';
    stamp.setAttribute('aria-label', 'たっせい');
    stamp.innerHTML = stampSvg();
    wrap.appendChild(stamp);
  }

  return wrap;
}

async function createUnitIsland(unit, lessonStatus, onPick) {
  const island = document.createElement('div');
  island.className = 'relative rounded-3xl p-4 mb-4 overflow-hidden';
  island.dataset.unitId = unit.unitId;
  island.innerHTML = islandSvg();

  const header = document.createElement('div');
  header.className = 'flex items-center justify-center gap-2 mb-3';
  const title = document.createElement('p');
  title.className = 'text-lg font-bold text-emerald-800';
  title.textContent = unit.title;
  header.appendChild(title);

  if (unit.lessonIds.every((id) => isCleared(lessonStatus, id))) {
    const flag = document.createElement('span');
    flag.className = 'unit-flag';
    flag.setAttribute('aria-label', 'たんげんたっせい');
    flag.innerHTML = flagSvg();
    header.appendChild(flag);
  }
  island.appendChild(header);

  const list = document.createElement('div');
  list.className = 'flex flex-wrap justify-center gap-3';
  for (const lessonId of unit.lessonIds) {
    list.appendChild(await createLessonStop(lessonId, isCleared(lessonStatus, lessonId), onPick));
  }
  island.appendChild(list);

  return island;
}

// stage: 描画先のコンテナ要素。units: index.jsonのunits配列。onPick(lessonId): タップ時のコールバック。
export async function renderUnitMap(stage, units, onPick) {
  stage.innerHTML = '';

  const heading = document.createElement('p');
  heading.className = 'text-2xl text-center py-4';
  heading.textContent = 'れっすんをえらぼう';
  stage.appendChild(heading);

  const { lessons: lessonStatus } = summarize(getEvents(), Date.now());

  for (const unit of units) {
    stage.appendChild(await createUnitIsland(unit, lessonStatus, onPick));
  }
}
