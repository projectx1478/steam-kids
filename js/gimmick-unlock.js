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
