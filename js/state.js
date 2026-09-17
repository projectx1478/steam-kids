import { loadProfile, saveProfile } from './storage.js';

function loadOrCreateProfile() {
  const existing = loadProfile();
  if (existing) return existing;
  const profile = { learnerId: crypto.randomUUID(), label: null, createdAt: Date.now() };
  saveProfile(profile);
  return profile;
}

export const S = {
  lesson: null,
  stepIndex: 0,
  learnerId: loadOrCreateProfile().learnerId,
  furigana: false,
};

export function initState(lesson) {
  S.lesson = lesson;
  S.stepIndex = 0;
}

export function currentStep() {
  return S.lesson.steps[S.stepIndex];
}
