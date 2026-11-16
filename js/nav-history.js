// レッスンの履歴とURL（Issue #739）。popstateAction は純関数でテストから import する。
// LOAD_ID：このページの読み込みごとに変わる値。リロード前に積んだ履歴を見分ける。
export const LOAD_ID = String(performance.timeOrigin);

export function mapSearchFor(lessonId) {
  return `?view=map&from=${encodeURIComponent(lessonId)}`;
}

export function lessonSearchFor(lessonId) {
  return `?lesson=${encodeURIComponent(lessonId)}`;
}

// 戻る・進むで来た履歴をどう扱うか。
// 'reload'：今の画面と別のURL（マップ⇔レッスン）→ そのURLで読み直す
// 'map'：同じレッスンの、リロード前に積んだステップの履歴 → 単元マップへ
// 'ignore'：同じ読み込みのステップの履歴（ui-step の popstate が扱う）など
export function popstateAction({ search, renderedSearch, hasStepIndex, stateLoadId, loadId }) {
  if (search !== renderedSearch) return 'reload';
  if (hasStepIndex && stateLoadId !== loadId) return 'map';
  return 'ignore';
}
