import { initState } from './js/state.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps } from './js/ui-step.js';
import { push } from './js/sync.js';
import { registerServiceWorker } from './js/register-sw.js';

// ?lesson=<id> で任意のレッスンを読み込める。未指定時は既定のレッスン1。
const lessonId = new URLSearchParams(location.search).get('lesson') || 'cmd-01-susumu';

try {
  const lesson = await loadLesson(lessonId);
  initState(lesson);
  initSteps();
  push();
} catch {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = 'よみこみ できませんでした';
  document.getElementById('stage').appendChild(p);
}

registerServiceWorker();
