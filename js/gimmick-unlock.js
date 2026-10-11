// 単元のクリア状況から、解放済みのギミックの種類を求める純関数（Issue #266）。
// 単元の lessonIds のうち1本でも isCleared が真なら、その単元の gimmicks を入れる。
// practiceIds・devOnlyIds は数えない。units が null／空なら空 Set。
export function clearedGimmicks(units, isCleared) {
  const out = new Set();
  if (!Array.isArray(units)) return out;
  for (const unit of units) {
    if (!Array.isArray(unit?.lessonIds) || !Array.isArray(unit?.gimmicks)) continue;
    if (unit.lessonIds.some((id) => isCleared(id))) {
      for (const g of unit.gimmicks) out.add(g);
    }
  }
  return out;
}

// 導入デモを「既習」として短くしてよいか（Issue #269）。units 未読込・単元不明は false。
// commands 単元はいずれかのレッスンがクリア済みなら true。それ以外は gimmicks が1件以上あり、
// そのすべてが解放済み（clearedGimmicks）なら true。gimmicks の無い単元は false。
export function isIntroKnown(units, lessonId, isCleared) {
  if (!Array.isArray(units)) return false;
  const unit = units.find((u) => Array.isArray(u?.lessonIds) && u.lessonIds.includes(lessonId));
  if (!unit) return false;
  if (unit.unitId === 'commands') return unit.lessonIds.some((id) => isCleared(id));
  if (!Array.isArray(unit.gimmicks) || unit.gimmicks.length === 0) return false;
  const cleared = clearedGimmicks(units, isCleared);
  return unit.gimmicks.every((g) => cleared.has(g));
}
