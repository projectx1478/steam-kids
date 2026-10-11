// 単元をはじめて全クリアした印の保存（Issue #267）。ブラウザ不要。
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

const storage = await import('../js/storage.js');

beforeEach(() => {
  Object.keys(ls).forEach((k) => delete ls[k]);
  storage.setActiveSlot(0);
});

test('unitEndSeen: 未保存はfalse、mark後はtrue、別単元はfalse', () => {
  assert.equal(storage.isUnitEndSeenStored('u1'), false);
  storage.markUnitEndSeenStored('u1');
  assert.equal(storage.isUnitEndSeenStored('u1'), true);
  assert.equal(storage.isUnitEndSeenStored('u2'), false);
});

test('unitEndSeen: スロット単位で分離され、resetSlotで消える', () => {
  storage.markUnitEndSeenStored('u1');
  storage.setActiveSlot(1);
  assert.equal(storage.isUnitEndSeenStored('u1'), false);
  storage.setActiveSlot(0);
  storage.resetSlot(0);
  assert.equal(storage.isUnitEndSeenStored('u1'), false);
});
