import { S, initState, applySlot, ensureActiveSlot } from './js/state.js';
import { loadSlots, createSlot, getActiveSlot, readLastHint, writeLastHint } from './js/storage.js';
import { getEvents } from './js/events.js';
import { summarize } from './js/analytics.js';
import { lessonOrder, newHintLesson } from './js/unlock.js';
import { displayName } from './js/slot-utils.js';
import { renderSlotSelect, renderNameEntry } from './js/ui-slots.js';
import { renderStory } from './js/ui-story.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps, refreshHeader } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';
import { renderUnitMap } from './js/ui-picker.js';
import { unitsOf, tracksOf } from './js/index-units.js';
import { renderTrackSelect, playableTrackCount } from './js/ui-tracks.js';
import { renderTitle } from './js/ui-title.js';
import { ensureDailyGate } from './js/ui-parental-gate.js';
import { IS_DEV } from './js/dev-mode.js';
import { initMenu } from './js/ui-menu.js';
import { isTrial, composeTrialLesson, readTrialStage, TRIAL_MISSING_MESSAGE } from './js/trial-lesson.js';

function showError() {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = 'よみこみ できませんでした';
  document.getElementById('stage').appendChild(p);
}

// ヘッダーの単元名表示用。取得失敗時はnullのままレッスン名のみ表示し、レッスン自体は止めない（Issue #91）。
async function loadUnitInfo(lessonId) {
  try {
    const res = await fetch('./lessons/index.json');
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    const units = unitsOf(await res.json());
    const unit = units.find((u) => u.lessonIds.includes(lessonId));
    return unit ? { title: unit.title, lessonIds: unit.lessonIds } : null;
  } catch {
    return null;
  }
}

async function startLesson(lessonId) {
  try {
    const lesson = await loadLesson(lessonId);
    initState(lesson);
    initSteps();
    // 単元情報の取得はinitSteps()を遅らせない（visibilitychange等のリスナー登録が
    // 遅れるとabandon記録のタイミングがずれるため）。取得できたらヘッダーだけ更新する。
    loadUnitInfo(lessonId).then((unit) => {
      S.unit = unit;
      refreshHeader();
    });
    // 練習のギミック解放判定用の単元一覧も同様に遅らせない（Issue #266）。
    loadUnits().then((units) => {
      S.units = units;
    });
    if (!IS_DEV) push();
  } catch {
    showError();
  }
}

async function loadIndex() {
  try {
    const res = await fetch('./lessons/index.json');
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function loadUnits() {
  const index = await loadIndex();
  return index ? unitsOf(index) : null;
}

// ?lesson=<id>が無い場合の入口。単元マップ（しま）から選んで始める画面（Issue #31, #58）。
// 大項目が2つ以上遊べる時は、下ボタンを「もどる」にして大項目選択へ戻す（Issue #375）。dev=1 は従来どおり。
async function renderPicker() {
  const stage = document.getElementById('stage');

  const index = await loadIndex();
  if (!index) {
    stage.innerHTML = '';
    showError();
    return;
  }

  const onBack = !IS_DEV && playableTrackCount(tracksOf(index)) >= 2
    ? () => { location.href = './index.html?view=tracks'; }
    : undefined;
  await renderUnitMap(stage, unitsOf(index), startLesson, onBack);
}

// 大項目選択（Issue #375）。遊べる大項目が1つ以下・dev=1 は従来どおり単元マップへ。
async function showTrackSelect() {
  const stage = document.getElementById('stage');
  const index = await loadIndex();
  if (!index) {
    stage.innerHTML = '';
    showError();
    return;
  }
  const tracks = tracksOf(index);
  if (IS_DEV || playableTrackCount(tracks) < 2) {
    await renderPicker();
    return;
  }
  const { lessons: lessonStatus } = summarize(getEvents(), Date.now());
  await renderTrackSelect(stage, tracks, {
    lessonStatus,
    onPick: (track) => renderUnitMap(stage, track.units, startLesson, () => showTrackSelect()),
    onBack: showTitle,
  });
}

// タイトル→スロット選択→（名前入力→導入ストーリー→先頭レッスン｜単元マップ）（Issue #218）。
async function showSlotSelect(mode) {
  const stage = document.getElementById('stage');
  const units = await loadUnits();
  if (!units) {
    stage.innerHTML = '';
    showError();
    return;
  }
  renderSlotSelect(stage, {
    mode,
    units,
    onBack: showTitle,
    onContinue: (slot) => {
      applySlot(slot);
      showTrackSelect();
    },
    onNew: (slot) => {
      renderNameEntry(stage, (name) => {
        const profile = createSlot(slot, name);
        applySlot(slot);
        renderStory(stage, displayName(profile.label, slot), () => startLesson(units[0].lessonIds[0]));
      });
    },
  });
}

// 「おわる」の後の翌日の手がかり（Issue #282）。有効スロットに使用中のデータがあり、次に遊べる
// レッスンが前回見せたものと違うときだけ、そのレッスンIDを返す。ensureActiveSlot()は呼ばない
// （空きスロットが作られてcanContinueが真になるため）。失敗しても例外は投げずnullを返す。
async function findTitleHint(occupied) {
  try {
    if (!occupied[getActiveSlot()]) return null;
    const units = await loadUnits();
    if (!units) return null;
    const { lessons: lessonStatus } = summarize(getEvents(), Date.now());
    const order = lessonOrder(units);
    const clearedIds = new Set(order.filter((id) => lessonStatus[id]?.status === 'cleared'));
    return newHintLesson(order, clearedIds, readLastHint());
  } catch {
    return null;
  }
}

async function showTitle() {
  const { occupied } = loadSlots();
  const hintId = await findTitleHint(occupied);
  renderTitle(document.getElementById('stage'), {
    canContinue: occupied.some(Boolean),
    onNew: () => showSlotSelect('new'),
    onContinue: () => showSlotSelect('continue'),
    hint: hintId !== null,
  });
  if (hintId !== null) {
    try {
      writeLastHint(hintId);
    } catch {
      // 保存に失敗してもタイトルは出す。
    }
  }
}

initMenu();

// ?lesson=直リンクを含む全起動経路で、その日初回のみ保護者の合言葉を求める（Issue #217）。
await ensureDailyGate();

// エディタの試し遊び（Issue #403）。dev=1&trial=1 のときだけ。記録するスロットは作らない。
function startTrial() {
  try {
    initState(composeTrialLesson(readTrialStage(sessionStorage)));
  } catch {
    const p = document.createElement('p');
    p.className = 'text-2xl text-center py-8';
    p.textContent = TRIAL_MISSING_MESSAGE;
    document.getElementById('stage').appendChild(p);
    return;
  }
  initSteps();
}

const params = new URLSearchParams(location.search);
const lessonId = params.get('lesson');
if (isTrial()) {
  startTrial();
} else if (lessonId) {
  ensureActiveSlot();
  await startLesson(lessonId);
} else if (params.get('view') === 'map') {
  ensureActiveSlot();
  await renderPicker();
} else if (params.get('view') === 'tracks') {
  ensureActiveSlot();
  await showTrackSelect();
} else {
  // ?lesson=・?view=mapのどちらも無い起動時のみタイトル画面を挟む（Issue #107）。
  await showTitle();
}

registerServiceWorker();
