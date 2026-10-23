// 命令列の下書き（Issue #556）：保存・読込・壊れた値・30日超・未来 ts の破棄、スロット分離。ブラウザ不要。
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
const store = {
  clear: () => Object.keys(ls).forEach((k) => delete ls[k]),
  set: (k, v) => ls.setItem(k, v),
  has: (k) => Object.hasOwn(ls, k),
};

const storage = await import('../js/storage.js');

beforeEach(() => {
  store.clear();
  storage.setActiveSlot(0);
});

const DAY = 24 * 60 * 60 * 1000;
const cmds = [{ dir: 'right', times: 2 }, { pause: true }, { box: [{ dir: 'up', times: 1 }], times: 3 }];

test('draft: write→read→clear、レッスン別・スロット分離', () => {
  assert.equal(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p2', cmds);
  const d = storage.readDraft('L1');
  assert.equal(d.stepId, 'p2');
  assert.deepEqual(d.commands, cmds);
  assert.ok(store.has('steamkids.draft.L1'));
  assert.equal(storage.readDraft('L2'), null);
  storage.setActiveSlot(2);
  assert.equal(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p3', []);
  assert.ok(store.has('steamkids.s3.draft.L1'));
  storage.clearDraft('L1');
  assert.equal(storage.readDraft('L1'), null);
  storage.setActiveSlot(0);
  assert.equal(storage.readDraft('L1').stepId, 'p2');
  storage.clearDraft('L1');
  assert.equal(storage.readDraft('L1'), null);
});

test('draft: 空の列も保存できる（ぜんぶけす）', () => {
  storage.writeDraft('L1', 'p2', []);
  assert.deepEqual(storage.readDraft('L1').commands, []);
});

test('draft: 壊れた値・型違いは null', () => {
  const k = 'steamkids.draft.L1';
  const now = Date.now();
  const bad = [
    '{broken', 'null', '"x"', '[]', '{}',
    JSON.stringify({ stepId: 1, commands: [], ts: now }),
    JSON.stringify({ stepId: 'p', commands: {}, ts: now }),
    JSON.stringify({ stepId: 'p', commands: [], ts: '1' }),
    JSON.stringify({ stepId: 'p', commands: [], ts: now, }).replace('"ts"', '"t"'),
    JSON.stringify({ stepId: 'p', commands: [{ dir: 1, times: 1 }], ts: now }),
    JSON.stringify({ stepId: 'p', commands: [{ dir: 'up', times: '1' }], ts: now }),
    JSON.stringify({ stepId: 'p', commands: [{ pause: false }], ts: now }),
    JSON.stringify({ stepId: 'p', commands: [{ box: 'x', times: 1 }], ts: now }),
    JSON.stringify({ stepId: 'p', commands: [{ box: [], times: 'a' }], ts: now }),
    JSON.stringify({ stepId: 'p', commands: [null], ts: now }),
  ];
  for (const raw of bad) {
    store.set(k, raw);
    assert.equal(storage.readDraft('L1'), null, raw);
  }
});

test('draft: 長さ超過（commands・box とも101以上）は null、100は可', () => {
  const mk = (n) => Array.from({ length: n }, () => ({ dir: 'up', times: 1 }));
  storage.writeDraft('L1', 'p', mk(100));
  assert.equal(storage.readDraft('L1').commands.length, 100);
  storage.writeDraft('L1', 'p', mk(101));
  assert.equal(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p', [{ box: mk(100), times: 2 }]);
  assert.notEqual(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p', [{ box: mk(101), times: 2 }]);
  assert.equal(storage.readDraft('L1'), null);
});

test('draft: 30日超・未来の ts は null、30日ちょうど以内は可', () => {
  const now = Date.now();
  storage.writeDraft('L1', 'p', cmds, now - 29 * DAY);
  assert.notEqual(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p', cmds, now - 31 * DAY);
  assert.equal(storage.readDraft('L1'), null);
  storage.writeDraft('L1', 'p', cmds, now + 60 * 1000);
  assert.equal(storage.readDraft('L1'), null);
});

test('resetSlot: draft も消え、他スロットの draft と resume は残る', () => {
  storage.createSlot(0, 'A');
  storage.createSlot(1, 'B');
  storage.setActiveSlot(0);
  storage.writeDraft('L1', 'p2', cmds);
  storage.writeDraft('L2', 'p3', cmds);
  storage.setActiveSlot(1);
  storage.writeDraft('L1', 'p2', cmds);
  storage.writeResume('L1', 'p2');
  storage.resetSlot(0);
  storage.setActiveSlot(0);
  assert.equal(storage.readDraft('L1'), null);
  assert.equal(storage.readDraft('L2'), null);
  storage.setActiveSlot(1);
  assert.notEqual(storage.readDraft('L1'), null);
  assert.notEqual(storage.readResume('L1'), null);
});

test('draft と resume は別キー', () => {
  storage.writeDraft('L1', 'p2', cmds);
  assert.equal(storage.readResume('L1'), null);
  storage.writeResume('L1', 'p2');
  storage.clearDraft('L1');
  assert.notEqual(storage.readResume('L1'), null);
});
