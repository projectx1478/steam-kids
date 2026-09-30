// 移行元: .claude/verify/scenarios/p3-sync.mjs（ブラウザ不要）。実行: npm run test:unit
// P3: sync push/pull（固定レスポンス）。localStorageとfetchを疑似実装に差し替えて js/sync.js を直接呼ぶ。
// state.jsがimport時にlocalStorageを読むため、疑似実装を設置してから動的importする。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => void storage.set(k, String(v)),
  removeItem: (k) => void storage.delete(k),
};

// 各ステップで差し替える固定レスポンス。handlerは(method, url, body)を受けてJSONを返す。
let handler = () => ({});
globalThis.fetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  if (!String(url).startsWith(`${ENDPOINT}/sync`)) throw new Error(`想定外のURL: ${url}`);
  const body = init.body ? JSON.parse(init.body) : null;
  return new Response(JSON.stringify(handler(method, String(url), body)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const { push, pull } = await import('../js/sync.js');

const setSyncState = (s) => localStorage.setItem('steamkids.sync', JSON.stringify(s));
const getSyncState = () => JSON.parse(localStorage.getItem('steamkids.sync'));
const setEvents = (e) => localStorage.setItem('steamkids.events', JSON.stringify(e));
const getEvents = () => JSON.parse(localStorage.getItem('steamkids.events') || '[]');
const evt = (eventId, type, ts, stepId = 's1') => ({ eventId, learnerId: 'l1', lessonId: 'cmd-01-susumu', stepId, type, ts, payload: {} });

test('sync: pushはlastPushedTs以降(>=)のイベントのみ送りlastPushedTsが進む', async () => {
  let pushedBody = null;
  handler = (method, _url, body) => {
    if (method === 'POST') {
      pushedBody = body;
      return { acceptedCount: body.events.length };
    }
    return { events: [] };
  };
  setSyncState({ enabled: true, syncSecret: 'a'.repeat(32), lastPushedTs: 100, lastError: null });
  setEvents([evt('e1', 'run', 50), evt('e2', 'run', 100), evt('e3', 'run', 150)]);

  await push();

  assert.equal(pushedBody.events.length, 2, 'lastPushedTs以降(>=)のイベントのみ送信される');
  const state = getSyncState();
  assert.equal(state.lastPushedTs, 150, 'push後にlastPushedTsが最大tsまで進む');
  assert.equal(state.lastError, null, 'push成功でlastErrorがnullになる');
});

test('sync: pullは常にsince=0で呼びlocalStorageへマージする(Issue #35)', async () => {
  let pulledSince = null;
  handler = (method, url) => {
    if (method === 'GET') {
      pulledSince = new URL(url).searchParams.get('since');
      return { events: [evt('r1', 'clear', 300, 's2')] };
    }
    return { acceptedCount: 0 };
  };

  await pull();

  assert.equal(pulledSince, '0', 'pullは常にsince=0で呼ぶ(差分取得をしない)');
  assert.equal(getEvents().some((e) => e.eventId === 'r1'), true, 'pull結果がlocalStorageへマージされる');
  assert.equal(getSyncState().lastError, null, 'pull成功でlastErrorがnullになる');

  // pullが0件でもエラーにならない
  handler = (method) => (method === 'GET' ? { events: [] } : { acceptedCount: 0 });
  await pull();
  assert.equal(getSyncState().lastError, null, '0件pullでもlastErrorはnullのまま');
});

test('sync: 同期が無効な端末はfetchしない', async () => {
  setSyncState({ enabled: false, syncSecret: null, lastPushedTs: 0, lastError: null });
  let fetchCalled = false;
  handler = () => {
    fetchCalled = true;
    return { events: [] };
  };

  await push();
  await pull();

  assert.equal(fetchCalled, false, '同期未有効ではfetchが発生しない');
});
