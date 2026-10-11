// js/index-units.js（index.json の tracks/units 読み取り）のテスト（Issue #374）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitsOf, tracksOf } from '../js/index-units.js';

const a = { unitId: 'a', lessonIds: ['a1'] };
const b = { unitId: 'b', lessonIds: ['b1'] };
const c = { unitId: 'c', lessonIds: ['c1'] };

test('unitsOf: 旧形は units をそのまま返す', () => {
  assert.deepEqual(unitsOf({ units: [a, b] }), [a, b]);
});

test('unitsOf: tracks 形は各 track の units を順に連結する', () => {
  assert.deepEqual(unitsOf({ tracks: [{ trackId: 't1', units: [a] }, { trackId: 't2', units: [b, c] }] }), [a, b, c]);
});

test('unitsOf: tracks と units の併用は tracks 優先', () => {
  assert.deepEqual(unitsOf({ tracks: [{ units: [a] }], units: [b] }), [a]);
});

test('unitsOf: どちらも無い・tracks が空配列なら []', () => {
  assert.deepEqual(unitsOf({}), []);
  assert.deepEqual(unitsOf({ tracks: [] }), []);
  assert.deepEqual(unitsOf({ tracks: [], units: [a] }), []);
});

test('tracksOf: tracks 形はその順で {trackId,title,units} を返す', () => {
  const idx = { tracks: [{ trackId: 't1', title: 'A', units: [a] }, { trackId: 't2', title: 'B', units: [b, c] }] };
  assert.deepEqual(tracksOf(idx), [
    { trackId: 't1', title: 'A', units: [a] },
    { trackId: 't2', title: 'B', units: [b, c] },
  ]);
});

test('tracksOf: 旧形は all 1本に包む', () => {
  assert.deepEqual(tracksOf({ units: [a, b] }), [{ trackId: 'all', title: '', units: [a, b] }]);
});

test('tracksOf: どちらも無ければ []（例外なし）', () => {
  assert.deepEqual(tracksOf({}), []);
  assert.deepEqual(tracksOf(undefined), []);
});

test('tracksOf: 空 tracks は []', () => {
  assert.deepEqual(tracksOf({ tracks: [] }), []);
  assert.deepEqual(tracksOf({ tracks: [], units: [a] }), []);
});
