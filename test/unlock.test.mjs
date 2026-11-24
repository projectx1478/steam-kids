// js/unlock.js（段階解放の純関数）とvalidate-lessonsの新ルール（Issue #216）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lessonOrder, isUnlocked, isUnitLessonOpen, isPracticeUnlocked, firstPendingId, newHintLesson, hintLessonId, continueLessonId } from '../js/unlock.js';

const units = [
  { unitId: 'a', lessonIds: ['a1', 'a2'], practiceIds: ['ap'] },
  { unitId: 'b', lessonIds: ['b1'] },
];
const order = lessonOrder(units);

test('lessonOrder: unitsの順にlessonIdsをつなぐ', () => {
  assert.deepEqual(order, ['a1', 'a2', 'b1']);
});

test('isUnlocked: 先頭は解放済み、他は前のクリア後', () => {
  assert.equal(isUnlocked(order, new Set(), 'a1'), true);
  assert.equal(isUnlocked(order, new Set(), 'a2'), false);
  assert.equal(isUnlocked(order, new Set(['a1']), 'a2'), true);
  assert.equal(isUnlocked(order, new Set(['a1']), 'b1'), false);
});

test('newHintLesson: 0本クリアはnull、1本クリアは次の1本', () => {
  assert.equal(newHintLesson(order, new Set(), null), null);
  assert.equal(newHintLesson(order, new Set(['a1']), null), 'a2');
});

test('newHintLesson: 前回見せたものと同じ・全クリア・orderが空はnull', () => {
  assert.equal(newHintLesson(order, new Set(['a1']), 'a2'), null);
  assert.equal(newHintLesson(order, new Set(['a1']), 'zz'), 'a2');
  assert.equal(newHintLesson(order, new Set(['a1', 'a2', 'b1']), null), null);
  assert.equal(newHintLesson([], new Set(['a1']), null), null);
});

test('isUnlocked: 単元をまたいで解放される', () => {
  assert.equal(isUnlocked(order, new Set(['a1', 'a2']), 'b1'), true);
});

test('isUnlocked: orderの入れ替えに追従する', () => {
  const swapped = lessonOrder([units[1], units[0]]);
  assert.equal(isUnlocked(swapped, new Set(), 'b1'), true);
  assert.equal(isUnlocked(swapped, new Set(), 'a1'), false);
  assert.equal(isUnlocked(swapped, new Set(['b1']), 'a1'), true);
});

test('isUnlocked: orderに無いidは未解放', () => {
  assert.equal(isUnlocked(order, new Set(['a1']), 'zzz'), false);
});

test('isPracticeUnlocked: 単元のlessonIdsを全部クリアで解放', () => {
  assert.equal(isPracticeUnlocked(units[0], new Set(['a1'])), false);
  assert.equal(isPracticeUnlocked(units[0], new Set(['a1', 'a2'])), true);
});

test('firstPendingId: 未クリアの最初。全クリアならnull', () => {
  assert.equal(firstPendingId(order, new Set()), 'a1');
  assert.equal(firstPendingId(order, new Set(['a1'])), 'a2');
  assert.equal(firstPendingId(order, new Set(['a1', 'a2', 'b1'])), null);
});

const base = JSON.parse(readFileSync('lessons/cmd-04-kurikaeshi.json', 'utf-8'));

function validate(unit, extraLessons = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vl-'));
  for (const l of [base, ...extraLessons]) writeFileSync(path.join(dir, `${l.lessonId}.json`), JSON.stringify(l));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ units: [{ unitId: 'commands', title: 'めいれい', ...unit }] }));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

test('validate-lessons: devOnlyIdsだけに載るレッスンも通る', () => {
  assert.equal(validate({ lessonIds: [], devOnlyIds: [base.lessonId] }).code, 0);
});

test('validate-lessons: devOnlyIdsの参照先不在はエラー', () => {
  const r = validate({ lessonIds: [base.lessonId], devOnlyIds: ['no-such-lesson'] });
  assert.equal(r.code, 1);
  assert.match(r.out, /参照先の不在/);
});

test('validate-lessons: どの一覧にも載らないファイルはエラー', () => {
  const extra = { ...base, lessonId: 'cmd-99-unlisted' };
  const r = validate({ lessonIds: [base.lessonId] }, [extra]);
  assert.equal(r.code, 1);
  assert.match(r.out, /掲載漏れ/);
});

test('hintLessonId: 錠の押下で光らせるレッスン（Issue #742）', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.equal(hintLessonId(order, new Set(['a']), ['b']), 'b');
  assert.equal(hintLessonId(order, new Set(), ['c']), 'a');
  assert.equal(hintLessonId(order, new Set(['a']), ['b', 'c', 'd']), 'b');
  assert.equal(hintLessonId(order, new Set(['a', 'b', 'c', 'd']), ['b']), null);
});

test('isUnitLessonOpen: 単元内の段階解放。先頭は常に開き、単元をまたがない（Issue #812）', () => {
  const u = { lessonIds: ['a1', 'a2', 'a3'], practiceIds: ['ap'] };
  assert.equal(isUnitLessonOpen(u, new Set(), 'a1'), true);
  assert.equal(isUnitLessonOpen(u, new Set(), 'a2'), false);
  assert.equal(isUnitLessonOpen(u, new Set(['a1']), 'a2'), true);
  assert.equal(isUnitLessonOpen(u, new Set(['a1']), 'a3'), false);
  assert.equal(isUnitLessonOpen(u, new Set(), 'ap'), false);
  assert.equal(isUnitLessonOpen(u, new Set(), 'zz'), false);
  assert.equal(isUnitLessonOpen({ lessonIds: [] }, new Set(), 'a1'), false);
  assert.equal(isUnitLessonOpen({}, new Set(), 'a1'), false);
  assert.equal(isUnitLessonOpen({ lessonIds: ['b1', 'b2'] }, new Set(), 'b1'), true);
});

test('hintLessonId: 第4引数 isOpen で単元内の解放を使う（Issue #812）', () => {
  const order = ['a1', 'a2', 'b1', 'b2'];
  assert.equal(hintLessonId(order, new Set(), ['b1'], (id) => ['a1', 'b1'].includes(id)), 'b1');
  assert.equal(hintLessonId(order, new Set(), ['b1']), 'a1');
});

test('continueLessonId: 直前のレッスンが未クリアならそれ（Issue #740）', () => {
  const o = ['a', 'b', 'c'];
  const ev = [{ lessonId: 'a', ts: 1 }, { lessonId: 'b', ts: 3 }, { lessonId: 'a', ts: 2 }];
  assert.equal(continueLessonId(ev, o, new Set()), 'b');
});

test('continueLessonId: 直前がクリア済み・order外・event無しは firstPending', () => {
  const o = ['a', 'b', 'c'];
  assert.equal(continueLessonId([{ lessonId: 'a', ts: 1 }], o, new Set(['a'])), 'b');
  assert.equal(continueLessonId([], o, new Set()), 'a');
  assert.equal(continueLessonId([{ lessonId: 'zzz', ts: 9 }], o, new Set(['a'])), 'b');
});

test('continueLessonId: 全クリアは null', () => {
  const o = ['a', 'b', 'c'];
  assert.equal(continueLessonId([{ lessonId: 'c', ts: 1 }], o, new Set(o)), null);
});
