import { S, initState } from './js/state.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps, refreshHeader } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';
import { renderUnitMap } from './js/ui-picker.js';
import { renderTitle } from './js/ui-title.js';

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
    push();
  } catch {
    showError();
  }
}

// ?lesson=<id>が無い場合の入口。単元マップ（しま）から選んで始める画面（Issue #31, #58）。
async function renderPicker() {
  const stage = document.getElementById('stage');

  let units;
  try {
    const res = await fetch('./lessons/index.json');
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    ({ units } = await res.json());
  } catch {
    stage.innerHTML = '';
    showError();
    return;
  }

  await renderUnitMap(stage, units, startLesson);
}

const params = new URLSearchParams(location.search);
const lessonId = params.get('lesson');
if (lessonId) {
  await startLesson(lessonId);
} else if (params.get('view') === 'map') {
  await renderPicker();
} else {
  // ?lesson=・?view=mapのどちらも無い起動時のみタイトル画面を挟む（Issue #107）。
  renderTitle(document.getElementById('stage'), renderPicker);
}

registerServiceWorker();
