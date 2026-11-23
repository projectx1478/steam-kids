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

// タイトル「つづきから」で開くレッスン（Issue #740）。ts が最大の event の lessonId が未クリアで order にあればそれ、
// そうでなければ firstPendingId。全クリアなら null。
export function continueLessonId(events, order, clearedIds) {
  let last = null;
  for (const e of events) {
    if (last === null || e.ts > last.ts) last = e;
  }
  const id = last?.lessonId;
  if (id != null && order.includes(id) && !clearedIds.has(id)) return id;
  return firstPendingId(order, clearedIds);
}

// 「おわる」後のタイトルで手がかりを出すレッスン（Issue #282）。出さないときは null。
export function newHintLesson(order, clearedIds, lastShownId) {
  if (clearedIds.size === 0) return null;
  const next = firstPendingId(order, clearedIds);
  return next === null || next === lastShownId ? null : next;
}

// 単元内の段階解放（Issue #812）。各単元の lessonIds 先頭は最初から開き、2本目以降は単元内の前の1本のクリアで開く。
// れんしゅう（practiceIds）・devOnlyIds は対象外（false）。単元をまたぐ依存は無い。
export function isUnitLessonOpen(unit, clearedIds, id) {
  const ids = Array.isArray(unit?.lessonIds) ? unit.lessonIds : [];
  const i = ids.indexOf(id);
  if (i < 0) return false;
  return i === 0 || clearedIds.has(ids[i - 1]);
}

// 錠を押したときに光らせるレッスン（Issue #742）。requiredIds の最初の未クリアを返し、それが錠なら
// その前の最前線（firstPendingId）を返す。requiredIds が全クリアなら null。
// isOpen（Issue #812）：id が開いているかの判定。省略時は全単元を通した順（isUnlocked）。
export function hintLessonId(order, clearedIds, requiredIds, isOpen = (id) => isUnlocked(order, clearedIds, id)) {
  const target = requiredIds.find((id) => !clearedIds.has(id));
  if (target === undefined) return null;
  return isOpen(target) ? target : firstPendingId(order, clearedIds);
}
