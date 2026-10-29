// #618 段1: 配置の編集の純関数（layout-state.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDevOnly, moveLesson, moveLessonToUnit, canSetDevOnly, canMoveLesson, canMoveLessonToUnit,
  addUnit, removeUnit, renameUnit, addTrack, removeTrack, renameTrack, checkNewId, canRemoveUnit, canRemoveTrack, layoutProblems } from '../tools/editor/layout-state.js';

const base = () => ({
  tracks: [{ trackId: 't', title: 'T', units: [
    { unitId: 'a', title: 'A', lessonIds: ['a1', 'a2'], devOnlyIds: ['a3'] },
    { unitId: 'b', title: 'B', lessonIds: ['b1'] },
  ] }],
});

test('setDevOnly: 公開から開発者だけへ、戻すと devOnlyIds が空ならキーを消す', () => {
  const a = setDevOnly(base(), 'a2', true);
  assert.deepEqual(a.tracks[0].units[0].lessonIds, ['a1']);
  assert.deepEqual(a.tracks[0].units[0].devOnlyIds, ['a3', 'a2']);
  const c = setDevOnly(setDevOnly(base(), 'a2', true), 'a2', false);
  assert.deepEqual(c.tracks[0].units[0].lessonIds, ['a1', 'a2']);
  const d = setDevOnly(base(), 'a3', false);
  assert.equal('devOnlyIds' in d.tracks[0].units[0], false);
  assert.deepEqual(d.tracks[0].units[0].lessonIds, ['a1', 'a2', 'a3']);
});

test('setDevOnly: 公開が空になる切替は無効（#618-6A）。元の index は変えない', () => {
  const i = base();
  assert.equal(canSetDevOnly(i, 'b1', true), false);
  assert.equal(setDevOnly(i, 'b1', true), i);
  assert.deepEqual(i, base());
});

test('moveLesson: 入れ替え・端は無効', () => {
  const i = base();
  assert.deepEqual(moveLesson(i, 'a2', -1).tracks[0].units[0].lessonIds, ['a2', 'a1']);
  assert.equal(canMoveLesson(i, 'a1', -1), false);
  assert.equal(moveLesson(i, 'a1', -1), i);
  assert.equal(canMoveLesson(i, 'a2', 1), false);
  assert.equal(moveLesson(i, 'zzz', 1), i);
});

test('moveLessonToUnit: 同じ種類の並びの末尾へ。公開が空になる移動・同じ単元・存在しない単元は無効', () => {
  const i = base();
  const m = moveLessonToUnit(i, 'a1', 'b');
  assert.deepEqual(m.tracks[0].units[0].lessonIds, ['a2']);
  assert.deepEqual(m.tracks[0].units[1].lessonIds, ['b1', 'a1']);
  const dev = moveLessonToUnit(i, 'a3', 'b');
  assert.equal('devOnlyIds' in dev.tracks[0].units[0], false);
  assert.deepEqual(dev.tracks[0].units[1].devOnlyIds, ['a3']);
  assert.equal(canMoveLessonToUnit(i, 'b1', 'a'), false);
  assert.equal(moveLessonToUnit(i, 'a1', 'a'), i);
  assert.equal(moveLessonToUnit(i, 'a1', 'nope'), i);
});

test('addUnit: 末尾に lessonIds 空で足す。ID 重複・形の誤り・題名空は無効', () => {
  const i = base();
  const a = addUnit(i, 't', 'c', ' C ');
  assert.deepEqual(a.tracks[0].units[2], { unitId: 'c', title: 'C', lessonIds: [] });
  assert.equal(addUnit(i, 't', 'a', 'X'), i);
  assert.equal(addUnit(i, 't', 'Bad Id', 'X'), i);
  assert.equal(addUnit(i, 't', 'c', '  '), i);
  assert.equal(addUnit(i, 'nope', 'c', 'X'), i);
  assert.ok(checkNewId(i, 'unit', 'a') !== '');
  assert.equal(checkNewId(i, 'unit', 'c'), '');
  assert.deepEqual(i, base());
});

test('removeUnit: レッスンの入った単元は削除できない。空の単元は消せる', () => {
  const i = base();
  assert.equal(canRemoveUnit(i, 'a'), false);
  assert.equal(removeUnit(i, 'a'), i);
  const a = addUnit(i, 't', 'c', 'C');
  assert.deepEqual(removeUnit(a, 'c'), i);
});

test('renameUnit・renameTrack: 空の題名は無効', () => {
  const i = base();
  assert.equal(renameUnit(i, 'a', ''), i);
  assert.equal(renameTrack(i, 't', ' '), i);
  assert.equal(renameUnit(i, 'a', 'Z').tracks[0].units[0].title, 'Z');
  assert.equal(renameTrack(i, 't', 'Z').tracks[0].title, 'Z');
});

test('addTrack・removeTrack: 単元の入った大項目は削除できない。空なら消せる', () => {
  const i = base();
  const a = addTrack(i, 'u', 'U');
  assert.deepEqual(a.tracks[1], { trackId: 'u', title: 'U', units: [] });
  assert.equal(addTrack(i, 't', 'X'), i);
  assert.equal(canRemoveTrack(i, 't'), false);
  assert.deepEqual(removeTrack(a, 'u'), i);
});

test('layoutProblems: 空の単元・空の大項目を知らせる。レッスンを移すと消える', () => {
  const i = base();
  assert.deepEqual(layoutProblems(i), []);
  const a = addUnit(i, 't', 'c', 'C');
  assert.equal(layoutProblems(a).length, 1);
  assert.deepEqual(layoutProblems(moveLessonToUnit(a, 'a1', 'c')), []);
  assert.equal(layoutProblems(addTrack(i, 'u', 'U')).length, 1);
});
