// 単元マップ（「しま」）の描画。レッスンをクリアするとスタンプ、単元全クリアで旗が立つ（Issue #58）。
// クリア判定はanalytics.jsのcomputeLessonStatus相当（summarize）を再利用し、判定ロジックを重複させない。
import { loadLesson } from './lesson-loader.js';
import { getEvents } from './events.js';
import { summarize } from './analytics.js';
import { shapeSvg } from './ui-grid.js';

// 単元ヘッダーの単元種別アイコン（Issue #107）。未知のunitIdはアイコン無し。
const UNIT_TYPE_ICON = {
  commands: () => flagSvg(),
  donguri: () => shapeSvg('item'),
};

function isCleared(lessonStatus, lessonId) {
  return lessonStatus[lessonId]?.status === 'cleared';
}

// isLessonCleared(lessonId): 単発でクリア済みか調べる（js/ui-play.jsの指ガイド表示判定から
// 利用。Issue #95）。単元マップを描くisCleared()と同じ判定を1レッスン分だけ行う。
export function isLessonCleared(lessonId) {
  const { lessons: lessonStatus } = summarize(getEvents(), Date.now());
  return isCleared(lessonStatus, lessonId);
}

function islandSvg() {
  return `<svg viewBox="0 0 200 100" class="absolute inset-0 w-full h-full -z-10" aria-hidden="true">
    <ellipse cx="100" cy="70" rx="90" ry="26" fill="#a7f3d0" stroke="#34d399" stroke-width="2" />
    <path d="M60 68 L100 20 L140 68 Z" fill="#6ee7b7" stroke="#34d399" stroke-width="2" />
  </svg>`;
}

// 単元進捗（ui-summary.jsの「しま」進み具合）でも再利用する（Issue #91）。
export function stampSvg() {
  return `<svg viewBox="0 0 32 32" class="w-7 h-7" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="#fecdd3" stroke="#e11d48" stroke-width="2" />
    <path d="M9 16l5 5 9-11" fill="none" stroke="#e11d48" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

// summaryの単元ぜんぶクリア演出でも再利用する（Issue #104）。
export function flagSvg() {
  return `<svg viewBox="0 0 32 32" class="w-7 h-7" aria-hidden="true">
    <line x1="6" y1="4" x2="6" y2="28" stroke="#92400e" stroke-width="2" stroke-linecap="round" />
    <path d="M6 5 L26 10 L6 15 Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round" />
  </svg>`;
}

// medalSvg(): 単元ぜんぶクリアだけで出すメダル（画像素材を使わず自作SVG。Issue #104）。
export function medalSvg() {
  return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
    <path d="M22 30 L14 52 L24 48 L30 58 L38 38Z" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
    <path d="M42 30 L50 52 L40 48 L34 58 L26 38Z" fill="#f87171" stroke="#dc2626" stroke-width="1.5" />
    <circle cx="32" cy="26" r="18" fill="#fde68a" stroke="#f59e0b" stroke-width="3" />
    <circle cx="32" cy="26" r="12" fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
    <polygon points="32,18 34.4,23.2 40,23.8 35.8,27.6 37,33 32,30 27,33 28.2,27.6 24,23.8 29.6,23.2"
      fill="#fff7ed" />
  </svg>`;
}

// starBadgeSvg(): 選択画面のクリア済みバッジ（金色★）。stampSvg（赤チェック）はui-summaryの
// 単元進捗ドットで使い続けるため残し、選択画面側だけ差し替える（Issue #107）。
function starBadgeSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="#fbbf24" stroke="#f59e0b" stroke-width="1" aria-hidden="true">
    <path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.3l7.1-.7Z" />
  </svg>`;
}

// レッスンボタンの小アイコン。初回playの特徴からIssue #107で導出する（JSONにアイコン指定は追加しない）。
function arrowIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="currentColor" aria-hidden="true"><path d="M5 4l14 8-14 8V4Z" /></svg>`;
}
function groupIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="3" y="7" width="12" height="12" rx="2" />
    <rect x="9" y="3" width="12" height="12" rx="2" />
  </svg>`;
}
function fixIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 20l4-1 10-10-3-3L5 16l-1 4Z" />
    <path d="M14 6l3 3" />
  </svg>`;
}

function keyIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v4M21 12v3" />
  </svg>`;
}

function lessonIconSvg(lesson) {
  const playStep = lesson.steps?.find((s) => s.kind === 'play');
  if (!playStep) return '';
  if (playStep.initialCommands) return fixIconSvg();
  if (playStep.groupRepeats) return groupIconSvg();
  if (playStep.items?.length) return shapeSvg('item');
  if (playStep.keys?.length) return keyIconSvg();
  return arrowIconSvg();
}

// data-lesson-idを持つボタンはアイコン(aria-hidden)＋data-titleのタイトル文字列を持つ
// （既存シナリオlesson-picker.mjsはdata-title側のtextContentで完全一致を見る。Issue #107）。
// スタンプはボタン外のsiblingとして重ねる（既存シナリオa5-unit-stamp.mjsのクラス名互換）。
async function createLessonStop(lessonId, cleared, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'relative inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.lessonId = lessonId;
  btn.className = `lesson-pick-btn btn-tactile flex items-center justify-center gap-1.5 px-4 text-lg text-white ${
    cleared ? 'bg-emerald-500' : 'bg-sky-500'
  }`;

  let title = lessonId;
  try {
    const lesson = await loadLesson(lessonId);
    title = lesson.title;
    const icon = lessonIconSvg(lesson);
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'inline-block w-4 h-4 shrink-0';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.innerHTML = icon;
      btn.appendChild(iconSpan);
    }
  } catch {
    // アイコンは省略し、タイトルはlessonIdへフォールバックする
  }
  const titleSpan = document.createElement('span');
  titleSpan.dataset.title = '';
  titleSpan.textContent = title;
  btn.appendChild(titleSpan);

  btn.addEventListener('click', () => onPick(lessonId));
  wrap.appendChild(btn);

  if (cleared) {
    const stamp = document.createElement('span');
    stamp.className = 'lesson-stamp absolute -top-2 -right-2 w-6 h-6';
    stamp.setAttribute('aria-label', 'たっせい');
    stamp.innerHTML = starBadgeSvg();
    wrap.appendChild(stamp);
  }

  return wrap;
}

async function createUnitIsland(unit, lessonStatus, onPick) {
  const island = document.createElement('div');
  island.className = 'relative rounded-3xl p-4 mb-4 overflow-hidden wood-panel';
  island.dataset.unitId = unit.unitId;
  island.innerHTML = islandSvg();

  const header = document.createElement('div');
  header.className = 'flex items-center justify-center gap-2 mb-3';
  const typeIcon = UNIT_TYPE_ICON[unit.unitId];
  if (typeIcon) {
    const icon = document.createElement('span');
    icon.className = 'unit-type-icon w-6 h-6';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = typeIcon();
    header.appendChild(icon);
  }
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
  stage.dataset.screen = 'picker';

  const heading = document.createElement('p');
  heading.className = 'text-2xl font-bold text-center py-4';
  heading.textContent = 'れっすんをえらぼう';
  stage.appendChild(heading);

  const { lessons: lessonStatus } = summarize(getEvents(), Date.now());

  // 初回タップ以降は全レッスンボタンをdisabledにし、連打によるstartLessonの多重呼び出しを防ぐ
  // （Issue #107）。
  let picked = false;
  const guardedPick = (lessonId) => {
    if (picked) return;
    picked = true;
    stage.querySelectorAll('[data-lesson-id]').forEach((btn) => {
      btn.disabled = true;
    });
    onPick(lessonId);
  };

  for (const unit of units) {
    stage.appendChild(await createUnitIsland(unit, lessonStatus, guardedPick));
  }
}
