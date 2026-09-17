import { S, currentStep } from './state.js';

// P0はメモリ配列に積むのみ。永続化はP2。
const events = [];

export function logEvent(type, payload = {}) {
  const step = currentStep();
  events.push({
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
  return events;
}
