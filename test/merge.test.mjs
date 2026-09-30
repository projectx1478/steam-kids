// 移行元: .claude/verify/scenarios/p3-merge.mjs（ブラウザ不要）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvents } from '../js/merge.js';

test('merge: eventIdで重複排除されts昇順に並ぶ', () => {
  const dedup = mergeEvents(
    [{ eventId: 'a', ts: 1 }, { eventId: 'b', ts: 2 }],
    [{ eventId: 'b', ts: 2 }, { eventId: 'c', ts: 3 }]
  ).map((e) => e.eventId);
  assert.deepEqual(dedup, ['a', 'b', 'c'], 'eventIdで重複排除される');

  const sorted = mergeEvents(
    [{ eventId: 'a', ts: 30 }],
    [{ eventId: 'b', ts: 10 }, { eventId: 'c', ts: 20 }]
  ).map((e) => e.eventId);
  assert.deepEqual(sorted, ['b', 'c', 'a'], 'ts昇順に並ぶ');
});

test('merge: 上限を超えたら古い順に破棄される', () => {
  const local = Array.from({ length: 5000 }, (_, i) => ({ eventId: `l${i}`, ts: i }));
  const capped = mergeEvents(local, [{ eventId: 'new', ts: 5000 }], 5000);
  assert.equal(capped.length, 5000, '5000件を超えたら古い順に破棄され件数は上限に収まる');
  assert.equal(capped[0].eventId, 'l1', '最古(l0)が破棄されている');
  assert.equal(capped[capped.length - 1].eventId, 'new', '末尾は最新のnew');
});

test('merge: 空配列・ts欠損でも例外を投げない', () => {
  assert.equal(mergeEvents([], []).length, 0, '空配列同士は空配列を返す');
  const missingTs = mergeEvents([{ eventId: 'a' }], [{ eventId: 'b', ts: 5 }]).map((e) => e.eventId);
  assert.deepEqual(missingTs, ['a', 'b'], 'ts欠損要素でも例外を投げず処理される');
});
