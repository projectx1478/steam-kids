import { S, initState } from './js/state.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';
import { initSoundToggle } from './js/sfx.js';
import { renderUnitMap } from './js/ui-picker.js';

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
    S.unit = await loadUnitInfo(lessonId);
    initSteps();
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

initSoundToggle(document.getElementById('sound-toggle'));

const lessonId = new URLSearchParams(location.search).get('lesson');
if (lessonId) {
  await startLesson(lessonId);
} else {
  await renderPicker();
}

registerServiceWorker();
