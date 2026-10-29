// #618 段1: 配置の編集の純関数（layout-state.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDevOnly, moveLesson, moveLessonToUnit, canSetDevOnly, canMoveLesson, canMoveLessonToUnit } from '../tools/editor/layout-state.js';

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
