// js/ui-tracks.js の判定の純関数のテスト（Issue #375）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrackCleared, playableTrackCount } from '../js/ui-tracks.js';

const done = { status: 'cleared' };
const track = (...lessonIdsList) => ({
  trackId: 't',
  title: 'T',
  units: lessonIdsList.map((lessonIds, i) => ({ unitId: `u${i}`, lessonIds })),
});

test('isTrackCleared: 全 unit の全レッスンをクリアなら true', () => {
  assert.equal(isTrackCleared(track(['a', 'b'], ['c']), { a: done, b: done, c: done }), true);
});

test('isTrackCleared: 1本欠ければ false', () => {
  assert.equal(isTrackCleared(track(['a', 'b'], ['c']), { a: done, b: done, c: { status: 'tried' } }), false);
  assert.equal(isTrackCleared(track(['a']), {}), false);
});

test('isTrackCleared: lessonIds が空の unit は数えない／全部空なら false', () => {
  assert.equal(isTrackCleared(track(['a'], []), { a: done }), true);
  assert.equal(isTrackCleared(track([], []), {}), false);
});

test('playableTrackCount: 2／1／0', () => {
  assert.equal(playableTrackCount([track(['a']), track(['b'])]), 2);
  assert.equal(playableTrackCount([track(['a']), track([])]), 1);
  assert.equal(playableTrackCount([track([]), { trackId: 'x', units: [] }]), 0);
  assert.equal(playableTrackCount([]), 0);
});
