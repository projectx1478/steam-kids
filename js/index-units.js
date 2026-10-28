// lessons/index.json から単元の配列を取り出す純関数（Issue #374）。node と browser の両方から import できる。
// tracks があれば各 track の units を順に連結。無ければ index.units。併用時は tracks 優先。どちらも無ければ []。
export function unitsOf(index) {
  if (Array.isArray(index?.tracks)) {
    return index.tracks.flatMap((t) => (Array.isArray(t?.units) ? t.units : []));
  }
  return Array.isArray(index?.units) ? index.units : [];
}

// 大項目の配列 [{trackId, title, units}] を返す純関数（Issue #375）。tracks があればその順。
// 旧形（units 直下）は1本の 'all' に包む。どちらも無ければ []。例外は投げない。
export function tracksOf(index) {
  if (Array.isArray(index?.tracks)) {
    return index.tracks.map((t) => ({
      trackId: t?.trackId,
      title: typeof t?.title === 'string' ? t.title : '',
      units: Array.isArray(t?.units) ? t.units : [],
    }));
  }
  if (Array.isArray(index?.units)) return [{ trackId: 'all', title: '', units: index.units }];
  return [];
}

// lessonId が属する大項目の単元配列を返す純関数（Issue #616）。lessonIds と practiceIds のみ引く（devOnlyIds は見ない）。
// 該当なし・壊れた index は null。例外は投げない。
export function trackOfLesson(index, lessonId) {
  if (typeof lessonId !== 'string' || lessonId === '') return null;
  for (const t of tracksOf(index)) {
    const hit = t.units.some((u) => (
      (Array.isArray(u?.lessonIds) && u.lessonIds.includes(lessonId))
      || (Array.isArray(u?.practiceIds) && u.practiceIds.includes(lessonId))
    ));
    if (hit) return t.units;
  }
  return null;
}
