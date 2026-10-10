// js/index-units.js（index.json の tracks/units 読み取り）のテスト（Issue #374）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitsOf } from '../js/index-units.js';

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
