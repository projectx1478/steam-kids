// lessons/index.json から単元の配列を取り出す純関数（Issue #374）。node と browser の両方から import できる。
// tracks があれば各 track の units を順に連結。無ければ index.units。併用時は tracks 優先。どちらも無ければ []。
export function unitsOf(index) {
  if (Array.isArray(index?.tracks)) {
    return index.tracks.flatMap((t) => (Array.isArray(t?.units) ? t.units : []));
  }
  return Array.isArray(index?.units) ? index.units : [];
}
