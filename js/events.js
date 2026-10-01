import { S, currentStep } from './state.js';
import { appendEvent, loadEvents } from './storage.js';
import { IS_DEV } from './dev-mode.js';

export function logEvent(type, payload = {}) {
  if (IS_DEV) return;
  const step = currentStep();
  appendEvent({
    eventId: crypto.randomUUID(),
    learnerId: S.learnerId,
    lessonId: S.lesson.lessonId,
    stepId: step ? step.stepId : null,
    type,
    ts: Date.now(),
    // れんしゅう（seedPick確定後）は全イベントにseedを付ける。lessonIdは固定のまま（Issue #69）。
    payload: S.seed == null ? payload : { ...payload, seed: S.seed },
  });
}

export function getEvents() {
  return loadEvents();
}
