// lessons/index.json の検証（validateIndex）と漢字学年の情報表示。tools/lib/validate/ からの分割（Issue #448）。
import { unitsOf } from '../../../js/index-units.js';
import { textKanjiMaxGrade } from '../../../js/text-render.js';
import { UNIT_GIMMICKS } from './common.mjs';

// index.jsonはレッスン選択画面（単元マップ）用の一覧ファイル。参照するlessonIdが実在し、
// unitIdがレッスン本体のunitIdと一致していることを確認する（Issue #58）。
export function validateIndex(data,lessonById, fileIds = new Set()) {
  const errors = [];
  const add = (rule, detail) => errors.push(`index.json: ${rule}: ${detail}`);

  // 形の検査（Issue #374）。1件でも不合格なら平坦化以降の検査はせずに返す。
  if (!('tracks' in data) && !('units' in data)) {
    add('必須キー', 'tracks も units も無い');
    return errors;
  }
  if ('tracks' in data && 'units' in data) {
    add('tracksとunitsの併用', 'tracks と units（直下）を両方持っている');
    return errors;
  }
  if ('tracks' in data) {
    if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
      add('tracksの型', 'tracks が配列でない、または空配列');
      return errors;
    }
    const seenTrackIds = new Set();
    for (const [i, track] of data.tracks.entries()) {
      if (track === null || typeof track !== 'object' || Array.isArray(track)) {
        add('tracksの型', `tracks[${i}] がオブジェクトでない`);
        continue;
      }
      for (const key of ['trackId', 'title', 'units']) {
        if (!(key in track)) add('必須キー', `tracks[${i}] に ${key} がない`);
      }
      for (const key of ['trackId', 'title']) {
        if (key in track && (typeof track[key] !== 'string' || track[key] === '')) {
          add('tracksの型', `tracks[${i}].${key} が空文字か文字列でない`);
        }
      }
      if (typeof track.trackId === 'string' && track.trackId !== '') {
        if (seenTrackIds.has(track.trackId)) add('trackIdの重複', `trackId="${track.trackId}" が重複している`);
        seenTrackIds.add(track.trackId);
      }
      if ('units' in track) {
        if (!Array.isArray(track.units)) add('tracksの型', `tracks[${i}].units が配列でない`);
        else if (track.units.length === 0) add('unitsが空', `trackId="${track.trackId}" の units が空配列`);
      }
    }
    if (errors.length > 0) return errors;
  } else if (!Array.isArray(data.units)) {
    add('必須キー', 'units が配列でない');
    return errors;
  }

  const seenLessonIds = new Set();
  for (const unit of unitsOf(data)) {
    for (const key of ['unitId', 'title', 'lessonIds']) {
      if (!(key in unit)) add('必須キー', `unitId="${unit.unitId}" に ${key} がない`);
    }
    // gimmicks＝その単元をクリアすると解放されるギミックの種類（Issue #266）。省略時は空。
    if ('gimmicks' in unit) {
      if (!Array.isArray(unit.gimmicks)) {
        add('gimmicks', `unitId="${unit.unitId}" の gimmicks が配列でない`);
      } else {
        for (const g of unit.gimmicks) {
          if (!UNIT_GIMMICKS.includes(g)) {
            add('gimmicks', `unitId="${unit.unitId}" の gimmicks に未知の値 ${JSON.stringify(g)}（許可: ${UNIT_GIMMICKS.join('・')}）`);
          }
        }
      }
    }
    if (!Array.isArray(unit.lessonIds)) continue;

    // practiceIds＝れんしゅう（スタンプ・旗の対象外。Issue #69）。実在とunitIdの一致だけ確認する。
    // devOnlyIds＝開発者画面だけに出す教材（Issue #216）。同じく実在とunitIdの一致を確認する。
    for (const lessonId of [...unit.lessonIds, ...(unit.practiceIds ?? []), ...(unit.devOnlyIds ?? [])]) {
      if (seenLessonIds.has(lessonId)) {
        add('重複', `lessonId="${lessonId}" が複数のunitから参照されている`);
      }
      seenLessonIds.add(lessonId);

      const lesson = lessonById.get(lessonId);
      if (!lesson) {
        add('参照先の不在', `unitId="${unit.unitId}" が参照する lessonId="${lessonId}" のレッスンJSONが無い`);
      } else if (lesson.unitId !== unit.unitId) {
        add(
          'unitIdの不一致',
          `lessonId="${lessonId}" のunitId="${lesson.unitId}" がindex.json側のunitId="${unit.unitId}"と不一致`
        );
      }
    }
  }

  // longTrialIds＝長尺試作の一覧（Issue #319）。文字列配列・重複なし・lessons/<id>.json が実在すること。
  // 省略時は空。seedPickとの併用はvalidateLessonで見る。
  if ('longTrialIds' in data) {
    const ids = data.longTrialIds;
    if (!Array.isArray(ids)) {
      add('longTrialIds', 'longTrialIds が配列でない');
    } else {
      const seen = new Set();
      for (const id of ids) {
        if (typeof id !== 'string') {
          add('longTrialIds', `要素 ${JSON.stringify(id)} が文字列でない`);
          continue;
        }
        if (seen.has(id)) add('longTrialIds', `"${id}" が重複している`);
        seen.add(id);
        if (!fileIds.has(id)) add('longTrialIds', `"${id}" の lessons/${id}.json が無い`);
      }
    }
  }

  // どの一覧にも載らないレッスンは開発者画面からも辿れないため、掲載漏れをエラーにする（Issue #216）。
  for (const lessonId of lessonById.keys()) {
    if (!seenLessonIds.has(lessonId)) {
      add('掲載漏れ', `lessonId="${lessonId}" がlessonIds・practiceIds・devOnlyIdsのどれにも載っていない`);
    }
  }

  return errors;
}

// レッスン中で使われている漢字の最大配当学年（無ければnull）。失敗にはしない情報表示用（Issue #59）。
function lessonKanjiMaxGrade(data) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  let max = null;
  for (const step of steps) {
    if (typeof step.text !== 'string') continue;
    const g = textKanjiMaxGrade(step.text);
    if (g !== null) max = max === null ? g : Math.max(max, g);
  }
  return max;
}

export { lessonKanjiMaxGrade };
