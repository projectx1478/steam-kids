// レッスンの段階解放（Issue #216）。DOMに依存しない純関数。
// clearedIds: クリア済みlessonIdのSet。

export function lessonOrder(units) {
  return units.flatMap((u) => u.lessonIds);
}

export function isUnlocked(order, clearedIds, id) {
  const i = order.indexOf(id);
  if (i < 0) return false;
  return i === 0 || clearedIds.has(order[i - 1]);
}

export function isPracticeUnlocked(unit, clearedIds) {
  return unit.lessonIds.every((id) => clearedIds.has(id));
}

export function firstPendingId(order, clearedIds) {
  return order.find((id) => !clearedIds.has(id)) ?? null;
}

// 「おわる」後のタイトルで手がかりを出すレッスン（Issue #282）。出さないときは null。
export function newHintLesson(order, clearedIds, lastShownId) {
  if (clearedIds.size === 0) return null;
  const next = firstPendingId(order, clearedIds);
  return next === null || next === lastShownId ? null : next;
}

// 錠を押したときに光らせるレッスン（Issue #742）。requiredIds の最初の未クリアを返し、それが錠なら
// その前の最前線（firstPendingId）を返す。requiredIds が全クリアなら null。
export function hintLessonId(order, clearedIds, requiredIds) {
  const target = requiredIds.find((id) => !clearedIds.has(id));
  if (target === undefined) return null;
  return isUnlocked(order, clearedIds, target) ? target : firstPendingId(order, clearedIds);
}
