// Issue #217: 日次保護者ゲートの最終認証日（ローカル日付）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, isGatePassedToday, markGatePassedToday, GATE_DATE_KEY } from '../js/gate-date.js';

function stubStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
  return map;
}

test('ローカル時刻の日付キー（JST 0〜9時でも前日にならない）', () => {
  assert.equal(localDateKey(new Date(2026, 9, 1, 8, 30)), '2026-10-01');
  assert.equal(localDateKey(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('同日はスキップ・翌日と未保存は要ゲート', () => {
  const map = stubStorage();
  const morning = new Date(2026, 9, 1, 8, 30);
  assert.equal(isGatePassedToday(morning), false);
  markGatePassedToday(morning);
  assert.equal(map.get(GATE_DATE_KEY), '2026-10-01');
  assert.equal(isGatePassedToday(new Date(2026, 9, 1, 23, 59)), true);
  assert.equal(isGatePassedToday(new Date(2026, 9, 2, 0, 0)), false);
});
