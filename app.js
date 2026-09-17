import { initState } from './js/state.js';
import { loadLesson } from './js/lesson-loader.js';
import { initSteps } from './js/ui-step.js';

try {
  const lesson = await loadLesson('cmd-01-susumu');
  initState(lesson);
  initSteps();
} catch {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  p.textContent = 'よみこみ できませんでした';
  document.getElementById('stage').appendChild(p);
}
