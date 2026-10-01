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
