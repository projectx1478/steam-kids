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
  // ふりがなON/OFF。dashboardの設定画面でのみ切り替える（端末内のみ・同期しない。Issue #93）。
  furigana: profile.furigana ?? true,
  // 単元情報（{title, lessonIds}）。app.jsのstartLessonがlessons/index.jsonから設定する。
  // 取得失敗時はnullのまま（ヘッダーはレッスン名のみ表示。Issue #91）。
  unit: null,
  // introの「れんしゅう する」から明示的にtutorialへ入る時だけtrue（自動スキップを1回だけ回避。Issue #93）。
  forceTutorial: false,
  // playの操作画面の下書き（stepId→commands）。確認ダイアログを全廃した代わりの誤タップ対策で、
  // ←で戻って再びそのplayへ進んだ時に命令列を復元する。レッスン内のみ・メモリのみで保持し、
  // クリア時またはレッスンを開始し直すと消える（Issue #95）。
  drafts: {},
};

export function initState(lesson) {
  S.lesson = lesson;
  S.stepIndex = 0;
  S.unit = null;
  S.forceTutorial = false;
  S.drafts = {};
}

export function currentStep() {
  return S.lesson.steps[S.stepIndex];
}
