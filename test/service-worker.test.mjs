// 移行元: .claude/verify/scenarios/sw-routing.mjs（ブラウザ不要）。実行: npm run test:unit
// Issue #28: service-worker.jsのfetchハンドラがメソッド・オリジンで正しく分岐することの確認。
// service-worker.jsのソースを疑似self/疑似caches/疑似fetchで読み込み、fetchイベントハンドラを直接呼んで
// ネットワークに依存せずルーティング判定のみを検証する（docs/caching.md参照）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const origin = 'http://localhost';

const fakeSelf = {
  addEventListener: () => {},
  location: new URL(`${origin}/service-worker.js`),
  skipWaiting: () => {},
  clients: { claim: () => {} },
};

const fetchCalls = [];
const stubFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  fetchCalls.push({ url, cache: init?.cache });
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// 実際のCache APIと同じくGET以外のRequestではputがrejectする疑似実装
const cachePutCalls = [];
const fakeCache = {
  put: async (req) => {
    if (req.method !== 'GET') {
      throw new TypeError(`Failed to execute 'put' on 'Cache': Request method '${req.method}' is unsupported`);
    }
    cachePutCalls.push({ url: req.url, method: req.method });
  },
};
const fakeCaches = { open: async () => fakeCache, match: async () => undefined };

// ネットワーク失敗かつキャッシュ未ヒットを再現するための、常に失敗するfetch
const failingFetch = async () => {
  throw new TypeError('network error');
};

function makeFetchHandler(fetchImpl, cachesImpl) {
  const localListeners = {};
  const localSelf = { ...fakeSelf, addEventListener: (type, fn) => { localListeners[type] = fn; } };
  new Function('self', 'fetch', 'caches', code)(localSelf, fetchImpl, cachesImpl);
  return localListeners.fetch;
}

async function fireWith(fetchHandler, url, method) {
  let respondWithPromise = null;
  let respondWithCalled = false;
  const event = {
    request: new Request(url, { method }),
    respondWith(p) {
      respondWithCalled = true;
      respondWithPromise = p;
    },
  };
  fetchHandler(event);
  let respondWithValue;
  let respondWithRejected = false;
  if (respondWithPromise) {
    try {
      respondWithValue = await respondWithPromise;
    } catch {
      respondWithRejected = true;
    }
  }
  return { respondWithCalled, respondWithValue, respondWithRejected };
}

const fetchHandler = makeFetchHandler(stubFetch, fakeCaches);
async function fire(url, method) {
  fetchCalls.length = 0;
  cachePutCalls.length = 0;
  const r = await fireWith(fetchHandler, url, method);
  return { respondWithCalled: r.respondWithCalled, fetched: fetchCalls.length > 0, cachePut: cachePutCalls.length > 0 };
}

test('service-worker: POSTは即座に素通しされfetchもcache.putも発生しない', async () => {
  const r = await fire(`${origin}/sync`, 'POST');
  assert.equal(r.respondWithCalled, false, 'POSTはrespondWithすら呼ばれず即座に素通しされる');
  assert.equal(r.fetched === false && r.cachePut === false, true, 'POSTではfetchもcache.putも発生しない');
});

test('service-worker: クロスオリジンGETは素通しされる', async () => {
  const r = await fire('https://steam-kids-sync.projectx1478.workers.dev/sync', 'GET');
  assert.equal(r.respondWithCalled, false, 'クロスオリジンGETはrespondWithが呼ばれず素通しされる(ブラウザに任せる)');
  assert.equal(r.fetched === false && r.cachePut === false, true, 'クロスオリジンGETはSWからfetchもcache.putも発生しない');
});

test('service-worker: 同一オリジンGET(アプリシェル)はfetch・キャッシュ書き込み・no-cache指定', async () => {
  const r = await fire(`${origin}/app.js`, 'GET');
  assert.equal(r.respondWithCalled === true && r.fetched === true, true, '同一オリジンGET(アプリシェル)はfetchされる');
  assert.equal(r.cachePut, true, '同一オリジンGETはキャッシュに書き込まれる(オフライン対応)');
  assert.equal(fetchCalls.some((c) => c.cache === 'no-cache'), true, 'アプリシェル取得はcache:"no-cache"を指定する(GitHub Pagesのmax-age=600を迂回)');
});

test('service-worker: レッスンJSONはfetchされキャッシュにも書き込まれる', async () => {
  const r = await fire(`${origin}/lessons/cmd-01-susumu.json`, 'GET');
  assert.equal(r.respondWithCalled === true && r.fetched === true && r.cachePut === true, true, 'レッスンJSONはfetchされキャッシュにも書き込まれる');
});

test('service-worker: オフライン・未キャッシュでもResponseを返しrejectしない', async () => {
  const offlineHandler = makeFetchHandler(failingFetch, fakeCaches);
  const r = await fireWith(offlineHandler, `${origin}/app.js`, 'GET');
  assert.equal(r.respondWithRejected, false, 'オフライン・未キャッシュの同一オリジンGETでもrespondWithはrejectしない');
  assert.equal(r.respondWithValue instanceof Response, true, 'オフライン・未キャッシュ時はrespondWithにResponseインスタンスが渡る(undefinedにならない)');
});
