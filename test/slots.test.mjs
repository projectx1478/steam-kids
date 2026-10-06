// セーブスロット（Issue #218）：名前整形・表示用関数・移行判定・スロット分離。ブラウザ不要。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 実物と同じくキーを自身のプロパティとして持つ（Object.keys(localStorage)で列挙できる）スタブ。
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
const { normalizeName, displayName, clearCount, lastPlayed } = await import('../js/slot-utils.js');

beforeEach(() => {
  store.clear();
  storage.setActiveSlot(0);
});

const ev = (lessonId, type, ts) => ({ eventId: `${lessonId}-${type}-${ts}`, learnerId: 'l', lessonId, stepId: null, type, ts, payload: {} });

test('normalizeName: 前後空白除去・10文字・空はnull', () => {
  assert.equal(normalizeName('  たろう  '), 'たろう');
  assert.equal(normalizeName('あいうえおかきくけこさ'), 'あいうえおかきくけこ');
  assert.equal(normalizeName('😀'.repeat(11)), '😀'.repeat(10));
  assert.equal(normalizeName('   '), null);
  assert.equal(normalizeName(''), null);
  assert.equal(normalizeName(undefined), null);
});

test('displayName: 空はプレイヤーN', () => {
  assert.equal(displayName(null, 0), 'プレイヤー1');
  assert.equal(displayName(null, 2), 'プレイヤー3');
  assert.equal(displayName('はな', 1), 'はな');
});

test('clearCount・lastPlayed', () => {
  const units = [{ unitId: 'u', lessonIds: ['a', 'b'], practiceIds: ['p'] }];
  const events = [ev('a', 'clear', new Date(2026, 8, 5, 12).getTime()), ev('p', 'clear', 1)];
  assert.equal(clearCount(events, units), 1, 'れんしゅうは数えない');
  assert.equal(lastPlayed(events), '9/5');
  assert.equal(lastPlayed([]), null);
});

test('loadSlots: 旧データ無し・自動生成のみのprofileは空き', () => {
  assert.deepEqual(storage.loadSlots().occupied, [false, false, false]);
  store.clear();
  store.set('steamkids.profile', JSON.stringify({ learnerId: 'auto', label: null }));
  assert.deepEqual(storage.loadSlots().occupied, [false, false, false]);
});

test('loadSlots: events／label／sync有効のどれかで旧データ有り（スロットA）', () => {
  const profile = (label) => JSON.stringify({ learnerId: 'old', label });
  store.set('steamkids.profile', profile(null));
  store.set('steamkids.events', JSON.stringify([ev('a', 'clear', 1)]));
  assert.equal(storage.loadSlots().occupied[0], true);
  store.clear();
  store.set('steamkids.profile', profile('たろう'));
  assert.equal(storage.loadSlots().occupied[0], true);
  store.clear();
  store.set('steamkids.profile', profile(null));
  store.set('steamkids.sync', JSON.stringify({ enabled: true }));
  assert.equal(storage.loadSlots().occupied[0], true);
});

test('createSlot: 自動生成profileのlearnerIdを引き継ぎ、使用中にする', () => {
  store.set('steamkids.profile', JSON.stringify({ learnerId: 'auto', label: null }));
  const profile = storage.createSlot(0, 'たろう');
  assert.equal(profile.learnerId, 'auto');
  assert.equal(storage.loadSlots().occupied[0], true);
  assert.equal(storage.createSlot(1, 'はな').learnerId !== 'auto', true);
  assert.ok(store.has('steamkids.s2.profile'));
});

test('スロット間でevents・sync・tutorialDoneが混ざらない', () => {
  storage.createSlot(0, 'A');
  storage.createSlot(1, 'B');
  storage.setActiveSlot(0);
  storage.appendEvent(ev('a', 'clear', 1));
  storage.markTutorialDoneStored('t1');
  storage.setActiveSlot(1);
  assert.equal(storage.loadEvents().length, 0);
  assert.equal(storage.isTutorialDoneStored('t1'), false);
  storage.saveSyncState({ enabled: true, syncSecret: 's' });
  storage.setActiveSlot(0);
  assert.equal(storage.loadSyncState().enabled, false);
  assert.ok(store.has('steamkids.events'));
  assert.ok(store.has('steamkids.s2.sync'));
});

test('resume: write→read→clear、スロット分離', () => {
  assert.equal(storage.readResume('L1'), null);
  storage.writeResume('L1', 'p2', 123);
  assert.deepEqual(storage.readResume('L1'), { stepId: 'p2', ts: 123 });
  assert.ok(store.has('steamkids.resume.L1'));
  assert.equal(storage.readResume('L2'), null);
  storage.setActiveSlot(2);
  assert.equal(storage.readResume('L1'), null);
  storage.writeResume('L1', 'p3', 5);
  assert.ok(store.has('steamkids.s3.resume.L1'));
  storage.clearResume('L1');
  assert.equal(storage.readResume('L1'), null);
  storage.setActiveSlot(0);
  assert.equal(storage.readResume('L1').stepId, 'p2');
  storage.clearResume('L1');
  assert.equal(storage.readResume('L1'), null);
});

test('resume: 壊れた値・型違いは null 扱い', () => {
  const k = 'steamkids.resume.L1';
  for (const raw of ['{broken', 'null', '"p2"', '[]', '{}', '{"stepId":1,"ts":1}', '{"stepId":"p2"}', '{"stepId":"p2","ts":"1"}']) {
    store.set(k, raw);
    assert.equal(storage.readResume('L1'), null, raw);
  }
});

test('resetSlot: resume も消え、他スロットの resume は残る', () => {
  storage.createSlot(0, 'A');
  storage.createSlot(1, 'B');
  storage.setActiveSlot(0);
  storage.writeResume('L1', 'p2', 1);
  storage.writeResume('L2', 'p3', 2);
  storage.setActiveSlot(1);
  storage.writeResume('L1', 'p2', 3);
  storage.resetSlot(0);
  storage.setActiveSlot(0);
  assert.equal(storage.readResume('L1'), null);
  assert.equal(storage.readResume('L2'), null);
  storage.setActiveSlot(1);
  assert.equal(storage.readResume('L1').ts, 3);
});

test('resetSlot: 対象スロットのみ初期化し、他スロットに触れない', () => {
  storage.createSlot(0, 'A');
  const b = storage.createSlot(1, 'B');
  storage.setActiveSlot(0);
  storage.appendEvent(ev('a', 'clear', 1));
  storage.markTutorialDoneStored('t1');
  storage.setActiveSlot(1);
  storage.appendEvent(ev('a', 'clear', 2));
  const reset = storage.resetSlot(0);
  assert.notEqual(reset.learnerId, undefined);
  storage.setActiveSlot(0);
  assert.equal(storage.loadEvents().length, 0);
  assert.equal(storage.isTutorialDoneStored('t1'), false);
  assert.equal(storage.loadProfile().label, null);
  storage.setActiveSlot(1);
  assert.equal(storage.loadEvents().length, 1);
  assert.equal(storage.loadProfile().learnerId, b.learnerId);
});
