import { initState } from './js/state.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';
import { initSoundToggle } from './js/sfx.js';

function showError() {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = 'よみこみ できませんでした';
  document.getElementById('stage').appendChild(p);
}

async function startLesson(lessonId) {
  try {
    const lesson = await loadLesson(lessonId);
    initState(lesson);
    initSteps();
    push();
  } catch {
    showError();
  }
}

// ?lesson=<id>が無い場合の入口。3本から選んで始める画面（Issue #31）。
async function renderPicker() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';

  let lessonIds;
  try {
    const res = await fetch('./lessons/index.json');
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    ({ lessonIds } = await res.json());
  } catch {
    showError();
    return;
  }

  const heading = document.createElement('p');
  heading.className = 'text-2xl text-center py-4';
  heading.textContent = 'れっすんをえらぼう';
  stage.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'flex flex-col gap-3';
  stage.appendChild(list);

  for (const lessonId of lessonIds) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.lessonId = lessonId;
    btn.className = 'lesson-pick-btn min-h-[48px] px-4 rounded-xl bg-sky-500 text-white text-lg';
    try {
      btn.textContent = (await loadLesson(lessonId)).title;
    } catch {
      btn.textContent = lessonId;
    }
    btn.addEventListener('click', () => startLesson(lessonId));
    list.appendChild(btn);
  }
}

initSoundToggle(document.getElementById('sound-toggle'));

const lessonId = new URLSearchParams(location.search).get('lesson');
if (lessonId) {
  await startLesson(lessonId);
} else {
  await renderPicker();
}

registerServiceWorker();
