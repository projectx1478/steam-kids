// 配置（lessons/index.json）の編集の純関数（#618 段1）。index は書き換えず、新しい index を返す。
// 無効な操作（先頭の ↑・公開が空になる切替など）は同じ index（参照が同じ）を返す。
const KINDS = ['lessonIds', 'practiceIds', 'devOnlyIds'];

// lessonId がどの単元のどの並びにあるか。無ければ null。
export function locate(index, lessonId) {
  for (const [ti, t] of index.tracks.entries()) {
    for (const [ui, u] of t.units.entries()) {
      for (const kind of KINDS) {
        const at = (u[kind] || []).indexOf(lessonId);
        if (at >= 0) return { ti, ui, kind, at };
      }
    }
  }
  return null;
}

// 単元 (ti, ui) を fn で差し替えた新しい index
function withUnit(index, ti, ui, fn) {
  return { ...index, tracks: index.tracks.map((t, i) => (i !== ti ? t : { ...t, units: t.units.map((u, j) => (j !== ui ? u : fn(u))) })) };
}

// 空になった devOnlyIds・practiceIds は、元の形に合わせてキーごと消す
function tidy(unit) {
  const u = { ...unit };
  for (const k of ['practiceIds', 'devOnlyIds']) if (Array.isArray(u[k]) && u[k].length === 0) delete u[k];
  return u;
}

// 公開（lessonIds）と開発者だけ（devOnlyIds）の切替。on=true で devOnly へ。公開が空になる切替は無効（#618-6A）。
export function canSetDevOnly(index, lessonId, on) {
  const p = locate(index, lessonId);
  if (!p) return false;
  if (on) return p.kind === 'lessonIds' && index.tracks[p.ti].units[p.ui].lessonIds.length > 1;
  return p.kind === 'devOnlyIds';
}

export function setDevOnly(index, lessonId, on) {
  if (!canSetDevOnly(index, lessonId, on)) return index;
  const p = locate(index, lessonId);
  const [from, to] = on ? ['lessonIds', 'devOnlyIds'] : ['devOnlyIds', 'lessonIds'];
  return withUnit(index, p.ti, p.ui, (u) => tidy({ ...u, [from]: u[from].filter((x) => x !== lessonId), [to]: [...(u[to] || []), lessonId] }));
}

// 同じ並びの中で delta（-1 で上、+1 で下）だけ動かす。端を越える動きは無効。
export function canMoveLesson(index, lessonId, delta) {
  const p = locate(index, lessonId);
  if (!p) return false;
  const to = p.at + delta;
  return (delta === -1 || delta === 1) && to >= 0 && to < index.tracks[p.ti].units[p.ui][p.kind].length;
}

export function moveLesson(index, lessonId, delta) {
  if (!canMoveLesson(index, lessonId, delta)) return index;
  const p = locate(index, lessonId);
  return withUnit(index, p.ti, p.ui, (u) => {
    const list = [...u[p.kind]];
    [list[p.at], list[p.at + delta]] = [list[p.at + delta], list[p.at]];
    return { ...u, [p.kind]: list };
  });
}

// 別の単元へ移す（同じ種類の並びの末尾へ）。元の単元の公開が空になる移動・同じ単元への移動は無効。
export function canMoveLessonToUnit(index, lessonId, toUnitId) {
  const p = locate(index, lessonId);
  if (!p) return false;
  const src = index.tracks[p.ti].units[p.ui];
  if (src.unitId === toUnitId) return false;
  if (p.kind === 'lessonIds' && src.lessonIds.length <= 1) return false;
  return index.tracks.some((t) => t.units.some((u) => u.unitId === toUnitId));
}

export function moveLessonToUnit(index, lessonId, toUnitId) {
  if (!canMoveLessonToUnit(index, lessonId, toUnitId)) return index;
  const p = locate(index, lessonId);
  const removed = withUnit(index, p.ti, p.ui, (u) => tidy({ ...u, [p.kind]: u[p.kind].filter((x) => x !== lessonId) }));
  const dest = { ti: -1, ui: -1 };
  removed.tracks.forEach((t, ti) => t.units.forEach((u, ui) => { if (u.unitId === toUnitId) { dest.ti = ti; dest.ui = ui; } }));
  return withUnit(removed, dest.ti, dest.ui, (u) => ({ ...u, [p.kind]: [...(u[p.kind] || []), lessonId] }));
}

// ---- 段2：単元・大項目の追加／削除／題名（#618） ----
const ID_RE = /^[a-z][a-z0-9-]*$/;
const idsOf = (u) => KINDS.flatMap((k) => u[k] || []);

// 追加する ID の検査。問題が無ければ ''、あれば作者向けの文言。
export function checkNewId(index, kind, id) {
  const label = kind === 'track' ? '大項目' : '単元';
  if (typeof id !== 'string' || !ID_RE.test(id)) return `${label}のIDは、英小文字で始まる英小文字・数字・ハイフンだけで書いてください`;
  const used = kind === 'track' ? index.tracks.map((t) => t.trackId) : index.tracks.flatMap((t) => t.units.map((u) => u.unitId));
  if (used.includes(id)) return `${label}のID「${id}」はすでにあります`;
  return '';
}

const okTitle = (title) => typeof title === 'string' && title.trim() !== '';

function withTrack(index, ti, fn) {
  return { ...index, tracks: index.tracks.map((t, i) => (i !== ti ? t : fn(t))) };
}

function trackAt(index, trackId) {
  return index.tracks.findIndex((t) => t.trackId === trackId);
}

// 新しい単元は lessonIds が空。レッスンを1つ移すまで保存できない（#618-6A、layoutProblems）。
export function canAddUnit(index, trackId, unitId, title) {
  return trackAt(index, trackId) >= 0 && okTitle(title) && checkNewId(index, 'unit', unitId) === '';
}

export function addUnit(index, trackId, unitId, title) {
  if (!canAddUnit(index, trackId, unitId, title)) return index;
  return withTrack(index, trackAt(index, trackId), (t) => ({ ...t, units: [...t.units, { unitId, title: title.trim(), lessonIds: [] }] }));
}

// レッスンの入った単元は削除できない（掲載漏れを防ぐ）
export function canRemoveUnit(index, unitId) {
  const u = index.tracks.flatMap((t) => t.units).find((x) => x.unitId === unitId);
  return !!u && idsOf(u).length === 0;
}

export function removeUnit(index, unitId) {
  if (!canRemoveUnit(index, unitId)) return index;
  return { ...index, tracks: index.tracks.map((t) => ({ ...t, units: t.units.filter((u) => u.unitId !== unitId) })) };
}

export function renameUnit(index, unitId, title) {
  if (!okTitle(title)) return index;
  return { ...index, tracks: index.tracks.map((t) => ({ ...t, units: t.units.map((u) => (u.unitId === unitId ? { ...u, title } : u)) })) };
}

// 新しい大項目は units が空。単元を1つ足すまで保存できない（layoutProblems）。
export function canAddTrack(index, trackId, title) {
  return okTitle(title) && checkNewId(index, 'track', trackId) === '';
}

export function addTrack(index, trackId, title) {
  if (!canAddTrack(index, trackId, title)) return index;
  return { ...index, tracks: [...index.tracks, { trackId, title: title.trim(), units: [] }] };
}

// 単元の入った大項目は削除できない
export function canRemoveTrack(index, trackId) {
  const t = index.tracks.find((x) => x.trackId === trackId);
  return !!t && t.units.length === 0 && index.tracks.length > 1;
}

export function removeTrack(index, trackId) {
  if (!canRemoveTrack(index, trackId)) return index;
  return { ...index, tracks: index.tracks.filter((t) => t.trackId !== trackId) };
}

export function renameTrack(index, trackId, title) {
  if (!okTitle(title)) return index;
  return withTrack(index, trackAt(index, trackId), (t) => ({ ...t, title }));
}

// 保存できない状態の説明（空の単元・空の大項目）。サーバー側の検査と同じ内容を、保存前に画面で見せる。
export function layoutProblems(index) {
  const out = [];
  for (const t of index.tracks) {
    if (t.units.length === 0) out.push(`大項目「${t.title}」に単元がありません。単元を追加してください`);
    for (const u of t.units) if (!Array.isArray(u.lessonIds) || u.lessonIds.length === 0) out.push(`単元「${u.title}」に公開レッスンがありません。レッスンを1つ移してください`);
  }
  return out;
}

export const isLayoutDirty =(saved, current) => JSON.stringify(saved) !== JSON.stringify(current);
