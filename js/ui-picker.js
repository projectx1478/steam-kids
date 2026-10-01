// 単元マップ（「しま」）の描画。レッスンをクリアするとスタンプ、単元全クリアで旗が立つ（Issue #58）。
// クリア判定はanalytics.jsのcomputeLessonStatus相当（summarize）を再利用し、判定ロジックを重複させない。
import { loadLesson } from './lesson-loader.js';
import { getEvents } from './events.js';
import { summarize } from './analytics.js';
import { shapeSvg } from './ui-grid.js';
import { lessonOrder, isUnlocked, isPracticeUnlocked, firstPendingId } from './unlock.js';
import { IS_DEV } from './dev-mode.js';

// 単元ごとのボタン色とアイコン（Issue #216）。クラス名はTailwindのcontentスキャン用にリテラルで書く。
// 未知のunitIdはbg-sky-400・アイコン無し。
const UNIT_STYLE = {
  commands: { bg: 'bg-emerald-400', icon: () => flagSvg() },
  donguri: { bg: 'bg-amber-400', icon: () => shapeSvg('item') },
  ice: { bg: 'bg-sky-400', icon: () => iceIconSvg() },
  keys: { bg: 'bg-purple-400', icon: () => keyIconSvg() },
  switches: { bg: 'bg-rose-400', icon: () => switchIconSvg() },
  teko: { bg: 'bg-teal-400', icon: () => seesawIconSvg() },
};
const DEFAULT_UNIT_STYLE = { bg: 'bg-sky-400', icon: null };

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

function iceIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
  </svg>`;
}

// 南京錠。鍵ドア単元のkeyIconSvgと区別するため別の形にする（未解放ボタン用）。
function padlockSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>`;
}

function keyIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v4M21 12v3" />
  </svg>`;
}

function switchIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>`;
}

function seesawIconSvg() {
  return `<svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 9L21 15" />
    <path d="M12 12L8 21H16Z" fill="currentColor" />
  </svg>`;
}

function iconSpan(svg, cls) {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
}

// data-lesson-idを持つボタンは単元アイコン(aria-hidden)＋単元内番号＋data-titleのタイトル文字列を持つ
// （既存シナリオlesson-picker.mjsはdata-title側のtextContentで完全一致を見る。Issue #107）。
// スタンプはボタン外のsiblingとして重ねる（既存シナリオa5-unit-stamp.mjsのクラス名互換）。
// opts: { unit, number（単元内番号。れんしゅうはnull）, locked, pending（次に遊ぶ最前線）, cleared, practice }
async function createLessonStop(lessonId, opts, onPick) {
  const { unit, number, locked, pending, cleared, practice } = opts;
  const style = UNIT_STYLE[unit.unitId] ?? DEFAULT_UNIT_STYLE;
  const wrap = document.createElement('div');
  wrap.className = 'relative inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.lessonId = lessonId;
  const color = locked ? 'bg-slate-300 text-slate-600' : `${style.bg} text-slate-900`;
  btn.className = `lesson-pick-btn btn-tactile flex items-center justify-center gap-1.5 px-4 text-lg font-bold ${color}${
    pending ? ' next-pulse' : ''
  }`;
  if (locked) {
    btn.disabled = true;
    btn.dataset.locked = 'true';
  }

  if (style.icon) btn.appendChild(iconSpan(style.icon(), 'inline-block w-5 h-5 shrink-0'));
  if (number != null) {
    const num = document.createElement('span');
    num.className = 'lesson-num';
    num.textContent = String(number);
    btn.appendChild(num);
  }

  let title = lessonId;
  try {
    title = (await loadLesson(lessonId)).title;
  } catch {
    // タイトルはlessonIdへフォールバックする
  }
  const titleSpan = document.createElement('span');
  titleSpan.dataset.title = '';
  titleSpan.textContent = title;
  btn.appendChild(titleSpan);
  if (locked) btn.appendChild(iconSpan(padlockSvg(), 'inline-block w-5 h-5 shrink-0'));

  btn.addEventListener('click', () => onPick(lessonId));
  wrap.appendChild(btn);

  if (IS_DEV) {
    const idLabel = document.createElement('p');
    idLabel.className = 'dev-lesson-id text-center text-xs text-slate-600';
    idLabel.textContent = lessonId;
    wrap.appendChild(idLabel);
  }

  // れんしゅう（Issue #69）：スタンプ・旗の対象にせず、クリアした回数だけを出す（比較・順位は出さない）。
  if (practice) {
    const count = getEvents().filter((e) => e.lessonId === lessonId && e.type === 'clear').length;
    if (count > 0) {
      const badge = document.createElement('p');
      badge.className = 'practice-count text-center text-sm text-amber-700';
      badge.textContent = `${count} かい`;
      wrap.appendChild(badge);
    }
  } else if (cleared) {
    const stamp = document.createElement('span');
    stamp.className = 'lesson-stamp absolute -top-2 -right-2 w-6 h-6';
    stamp.setAttribute('aria-label', 'たっせい');
    stamp.innerHTML = starBadgeSvg();
    wrap.appendChild(stamp);
  }

  return wrap;
}

// ctx: { order, clearedIds, pendingId }。開発者画面（IS_DEV）は全解放・パルス無し・devOnlyIdsも並べる。
async function createUnitIsland(unit, lessonStatus, ctx, onPick) {
  const island = document.createElement('div');
  // shrink-0: #stage（flex-col・overflow-y-auto）内で単元が増えた時に縮められて潰れるのを防ぐ（Issue #157）
  island.className = 'relative shrink-0 rounded-3xl p-4 mb-4 overflow-hidden wood-panel';
  island.dataset.unitId = unit.unitId;
  island.innerHTML = islandSvg();

  const header = document.createElement('div');
  header.className = 'flex items-center justify-center gap-2 mb-3';
  const typeIcon = UNIT_STYLE[unit.unitId]?.icon;
  if (typeIcon) header.appendChild(iconSpan(typeIcon(), 'unit-type-icon w-6 h-6'));
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
  const { order, clearedIds, pendingId } = ctx;
  for (const [i, lessonId] of unit.lessonIds.entries()) {
    list.appendChild(
      await createLessonStop(
        lessonId,
        {
          unit,
          number: i + 1,
          locked: !IS_DEV && !isUnlocked(order, clearedIds, lessonId),
          pending: !IS_DEV && lessonId === pendingId,
          cleared: isCleared(lessonStatus, lessonId),
        },
        onPick
      )
    );
  }
  const practiceLocked = !IS_DEV && !isPracticeUnlocked(unit, clearedIds);
  for (const lessonId of unit.practiceIds ?? []) {
    list.appendChild(
      await createLessonStop(lessonId, { unit, number: null, locked: practiceLocked, practice: true }, onPick)
    );
  }
  if (IS_DEV) {
    for (const lessonId of unit.devOnlyIds ?? []) {
      list.appendChild(await createLessonStop(lessonId, { unit, number: null, locked: false }, onPick));
    }
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
  const order = lessonOrder(units);
  const clearedIds = new Set(order.filter((id) => isCleared(lessonStatus, id)));
  const ctx = { order, clearedIds, pendingId: firstPendingId(order, clearedIds) };

  if (IS_DEV) {
    const badge = document.createElement('p');
    badge.id = 'dev-badge';
    badge.className = 'fixed top-2 right-2 z-40 rounded-full bg-slate-800 text-white text-sm font-bold px-3 py-1';
    badge.textContent = 'DEV';
    stage.appendChild(badge);
  }

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
    stage.appendChild(await createUnitIsland(unit, lessonStatus, ctx, guardedPick));
  }
}
