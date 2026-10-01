import { loadProfile, loadSlots, saveSlots, createSlot, setActiveSlot } from './storage.js';

export const S = {
  lesson: null,
  stepIndex: 0,
  // learnerId・readingLevel・furiganaはapplySlot()が入れる（起動時はapp.js・ui-dashboard.jsがensureActiveSlot()を呼ぶ。Issue #218）。
  learnerId: null,
  // よみレベル（0=ねんちょう〜6）。端末内(profile)のみで保持し同期しない（Issue #59）。
  readingLevel: 0,
  // ふりがなON/OFF。dashboardの設定画面でのみ切り替える（端末内のみ・同期しない。Issue #93）。
  furigana: true,
  // 単元情報（{title, lessonIds}）。app.jsのstartLessonがlessons/index.jsonから設定する。
  // 取得失敗時はnullのまま（ヘッダーはレッスン名のみ表示。Issue #91）。
  unit: null,
  // introの「れんしゅう する」から明示的にtutorialへ入る時だけtrue（自動スキップを1回だけ回避。Issue #93）。
  forceTutorial: false,
  // playの操作画面の下書き（stepId→commands）。確認ダイアログを全廃した代わりの誤タップ対策で、
  // ←で戻って再びそのplayへ進んだ時に命令列を復元する。レッスン内のみ・メモリのみで保持し、
  // クリア時またはレッスンを開始し直すと消える（Issue #95）。
  drafts: {},
  // 「れんしゅう」のたねコード（'0417'形式。Issue #69）。seedPickで確定するまでnull。設定中は
  // 全イベントのpayload.seedに付く（js/events.js）。seedDraftは次のseedPick表示時の初期コード。
  seed: null,
  seedDraft: null,
};

// スロットiをアクティブにしてSへ反映する。persist=trueで次回起動時もこのスロットから始める。
export function applySlot(slot, { persist = true } = {}) {
  setActiveSlot(slot, { persist });
  const profile = loadProfile();
  S.learnerId = profile?.learnerId ?? null;
  S.readingLevel = profile?.readingLevel ?? 0;
  S.furigana = profile?.furigana ?? true;
}

// 使用中スロットが1つも無い起動（直リンク・ダッシュボード・旧データ無しの初回）では、従来の自動生成と
// 同じくスロットAを名前無しで作る。使用中スロットがあればそれをアクティブにする。
export function ensureActiveSlot() {
  const slots = loadSlots();
  if (!slots.occupied[slots.active]) {
    const first = slots.occupied.indexOf(true);
    if (first >= 0) {
      saveSlots({ ...slots, active: first });
      slots.active = first;
    } else {
      createSlot(0, null);
      slots.active = 0;
      saveSlots({ ...loadSlots(), active: 0 });
    }
  }
  // 使用中のはずのprofileが壊れて読めない場合は作り直す（learnerId無しでイベントを記録しない）。
  setActiveSlot(slots.active);
  if (!loadProfile()) createSlot(slots.active, null);
  applySlot(slots.active, { persist: false });
}

export function initState(lesson) {
  S.lesson = lesson;
  S.stepIndex = 0;
  S.unit = null;
  S.forceTutorial = false;
  S.drafts = {};
  S.seed = null;
  S.seedDraft = null;
}

export function currentStep() {
  return S.lesson.steps[S.stepIndex];
}
