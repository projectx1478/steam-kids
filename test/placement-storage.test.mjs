// 置き方の下書き（Issue #745）：保存・読込、stepId/type 不一致・30日超・2KB超の破棄、合計100KB超の古い順削除。ブラウザ不要。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class StorageStub {
  getItem(k) {
    return Object.hasOwn(this, k) ? this[k] : null;
  }
  setItem(k, v) {
    this[k] = String(v);
  }
  removeItem(k) {
    delete this[k];
  }
}
const ls = new StorageStub();
globalThis.localStorage = ls;
const clear = () => Object.keys(ls).forEach((k) => delete ls[k]);
const placeKeys = () => Object.keys(ls).filter((k) => k.includes('place.'));

const { readPlacement, writePlacement, clearPlacement, setActiveSlot } = await import('../js/storage.js');

beforeEach(() => {
  clear();
  setActiveSlot(0);
});

test('write → read で同じ data が返る', () => {
  writePlacement('teko-01', 's2', 'seesaw', { poses: [3], robotsList: [1] });
  assert.deepEqual(readPlacement('teko-01', 's2', 'seesaw'), { poses: [3], robotsList: [1] });
});

test('stepId 違い・type 違いは null', () => {
  writePlacement('teko-01', 's2', 'seesaw', { poses: [3] });
  assert.equal(readPlacement('teko-01', 's3', 'seesaw'), null);
  assert.equal(readPlacement('teko-01', 's2', 'egg'), null);
});

test('31日前の ts は null、未来の ts も null', () => {
  const day = 24 * 60 * 60 * 1000;
  writePlacement('a', 's', 'egg', { plates: [1] }, Date.now() - 31 * day);
  assert.equal(readPlacement('a', 's', 'egg'), null);
  writePlacement('a', 's', 'egg', { plates: [1] }, Date.now() + day);
  assert.equal(readPlacement('a', 's', 'egg'), null);
  writePlacement('a', 's', 'egg', { plates: [1] }, Date.now() - 29 * day);
  assert.deepEqual(readPlacement('a', 's', 'egg'), { plates: [1] });
});

test('2049バイトの data は保存されず null', () => {
  writePlacement('a', 's', 'sortorder', { slots: ['x'.repeat(2049)] });
  assert.equal(placeKeys().length, 0);
  assert.equal(readPlacement('a', 's', 'sortorder'), null);
});

test('clearPlacement で消える', () => {
  writePlacement('a', 's', 'egg', { plates: [1] });
  clearPlacement('a');
  assert.equal(readPlacement('a', 's', 'egg'), null);
});

test('スロット別：別スロットでは読めない', () => {
  writePlacement('a', 's', 'egg', { plates: [1] });
  setActiveSlot(1);
  assert.equal(readPlacement('a', 's', 'egg'), null);
});

test('place. の合計が 102400 を超えたら最も古い ts のキーから消える', () => {
  const body = { v: 'x'.repeat(1900) };
  const t0 = Date.now() - 1000 * 1000;
  // 約2KB × 60本 ≒ 120KB。古い順に消えて合計が上限以下になる。
  for (let i = 0; i < 60; i += 1) writePlacement(`l${i}`, 's', 'egg', body, t0 + i * 1000);
  const total = placeKeys().reduce((a, k) => a + new TextEncoder().encode(ls.getItem(k)).length, 0);
  assert.ok(total <= 102400, `total=${total}`);
  assert.equal(readPlacement('l0', 's', 'egg'), null, '最古は消える');
  assert.deepEqual(readPlacement('l59', 's', 'egg'), body, '最新は残る');
});
