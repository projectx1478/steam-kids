import { S, currentStep } from './state.js';
import { appendEvent, loadEvents } from './storage.js';

export function logEvent(type, payload = {}) {
  const step = currentStep();
  appendEvent({
    eventId: crypto.randomUUID(),
    learnerId: S.learnerId,
    lessonId: S.lesson.lessonId,
    stepId: step ? step.stepId : null,
    type,
    ts: Date.now(),
    payload,
  });
}

export function getEvents() {
  return loadEvents();
}
