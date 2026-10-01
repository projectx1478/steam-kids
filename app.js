import { S, initState, applySlot, ensureActiveSlot } from './js/state.js';
import { loadSlots, createSlot } from './js/storage.js';
import { displayName } from './js/slot-utils.js';
import { renderSlotSelect, renderNameEntry } from './js/ui-slots.js';
import { renderStory } from './js/ui-story.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps, refreshHeader } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';
import { renderUnitMap } from './js/ui-picker.js';
import { renderTitle } from './js/ui-title.js';
import { ensureDailyGate } from './js/ui-parental-gate.js';
import { IS_DEV } from './js/dev-mode.js';

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
    const { units } = await res.json();
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
    if (!IS_DEV) push();
  } catch {
    showError();
  }
}

async function loadUnits() {
  try {
    const res = await fetch('./lessons/index.json');
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    return (await res.json()).units;
  } catch {
    return null;
  }
}

// ?lesson=<id>が無い場合の入口。単元マップ（しま）から選んで始める画面（Issue #31, #58）。
async function renderPicker() {
  const stage = document.getElementById('stage');

  const units = await loadUnits();
  if (!units) {
    stage.innerHTML = '';
    showError();
    return;
  }

  await renderUnitMap(stage, units, startLesson);
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
      renderPicker();
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

function showTitle() {
  renderTitle(document.getElementById('stage'), {
    canContinue: loadSlots().occupied.some(Boolean),
    onNew: () => showSlotSelect('new'),
    onContinue: () => showSlotSelect('continue'),
  });
}

// ?lesson=直リンクを含む全起動経路で、その日初回のみ保護者の合言葉を求める（Issue #217）。
await ensureDailyGate();

const params = new URLSearchParams(location.search);
const lessonId = params.get('lesson');
if (lessonId) {
  ensureActiveSlot();
  await startLesson(lessonId);
} else if (params.get('view') === 'map') {
  ensureActiveSlot();
  await renderPicker();
} else {
  // ?lesson=・?view=mapのどちらも無い起動時のみタイトル画面を挟む（Issue #107）。
  showTitle();
}

registerServiceWorker();
