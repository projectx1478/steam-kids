// js/unlock.js（段階解放の純関数）とvalidate-lessonsの新ルール（Issue #216）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lessonOrder, isUnlocked, isPracticeUnlocked, firstPendingId } from '../js/unlock.js';

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
