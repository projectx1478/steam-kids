import { loadProfile, saveProfile } from './storage.js';

function loadOrCreateProfile() {
  const existing = loadProfile();
  if (existing) return existing;
  const profile = { learnerId: crypto.randomUUID(), label: null, createdAt: Date.now() };
  saveProfile(profile);
  return profile;
}

const profile = loadOrCreateProfile();

export const S = {
  lesson: null,
  stepIndex: 0,
  learnerId: profile.learnerId,
  // よみレベル（0=ねんちょう〜6）。端末内(profile)のみで保持し同期しない（Issue #59）。
  readingLevel: profile.readingLevel ?? 0,
  furigana: true,
  // 単元情報（{title, lessonIds}）。app.jsのstartLessonがlessons/index.jsonから設定する。
  // 取得失敗時はnullのまま（ヘッダーはレッスン名のみ表示。Issue #91）。
  unit: null,
};

export function initState(lesson) {
  S.lesson = lesson;
  S.stepIndex = 0;
  S.unit = null;
}

export function currentStep() {
  return S.lesson.steps[S.stepIndex];
}
