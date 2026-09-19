// Issue #28: service-worker.jsのfetchハンドラがメソッド・オリジンで正しく分岐することの確認。
// kids-player .claude/verify/scenarios/service-worker-post-passthrough.mjs と同じ方式。
//
// 実際にService Workerを登録すると、SW内で再発行されるfetch()はPlaywrightのpage/context.route()
// では捕捉できず実ネットワークに出てしまう(検証環境では到達不可のため誤ってFAILする)。
// そのためservice-worker.jsのソースを取得し、fetchイベントハンドラを疑似self/疑似caches/
// 疑似fetchに差し替えて直接呼び出すことで、ネットワークに依存せずルーティング判定のみを検証する。

export const name = 'service-worker.jsのfetchハンドラがメソッド・オリジンで正しく分岐する(Issue #28)';

export default async function run({ page, check }) {
  await page.goto('/service-worker.js');

  const result = await page.evaluate(async () => {
    const code = await (await fetch('/service-worker.js')).text();

    const listeners = {};
    const fakeSelf = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      location: self.location,
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
    const fakeCaches = {
      open: async () => fakeCache,
      match: async () => undefined,
    };

    // ネットワーク失敗かつキャッシュ未ヒットを再現するための、常に失敗するfetch
    const failingFetch = async () => { throw new TypeError('network error'); };

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
        respondWith(p) { respondWithCalled = true; respondWithPromise = p; },
      };
      fetchHandler(event);
      let respondWithValue;
      let respondWithRejected = false;
      if (respondWithPromise) {
        try { respondWithValue = await respondWithPromise; }
        catch (e) { respondWithRejected = true; }
      }
      return { respondWithCalled, respondWithValue, respondWithRejected };
    }

    const fetchHandler = makeFetchHandler(stubFetch, fakeCaches);
    const fire = (url, method) => fireWith(fetchHandler, url, method).then((r) => r.respondWithCalled);

    const origin = self.location.origin;
    const outcome = {};

    // 1. POST(同一オリジン相当のURLでもメソッドで即return、respondWithすら呼ばれない)
    fetchCalls.length = 0; cachePutCalls.length = 0;
    outcome.postRespondWithCalled = await fire(origin + '/sync', 'POST');
    outcome.postTriggeredFetch = fetchCalls.length > 0;
    outcome.postTriggeredCachePut = cachePutCalls.length > 0;

    // 2. クロスオリジンGET(同期APIを想定): SWからは再発行せず、respondWithも呼ばずに素通しする
    fetchCalls.length = 0; cachePutCalls.length = 0;
    outcome.crossOriginGetRespondWithCalled = await fire('https://steam-kids-sync.projectx1478.workers.dev/sync', 'GET');
    outcome.crossOriginGetTriggeredFetch = fetchCalls.length > 0;
    outcome.crossOriginGetTriggeredCachePut = cachePutCalls.length > 0;

    // 3. 同一オリジンGET(アプリシェル相当): fetchし、キャッシュにも書き込み、cache:'no-cache'を指定する
    fetchCalls.length = 0; cachePutCalls.length = 0;
    outcome.sameOriginGetRespondWithCalled = await fire(origin + '/app.js', 'GET');
    outcome.sameOriginGetTriggeredFetch = fetchCalls.length > 0;
    outcome.sameOriginGetTriggeredCachePut = cachePutCalls.length > 0;
    outcome.sameOriginGetUsedNoCache = fetchCalls.some((c) => c.cache === 'no-cache');

    // 4. レッスンJSON(ネットワーク優先・失敗時のみキャッシュ、cache指定は無い)
    fetchCalls.length = 0; cachePutCalls.length = 0;
    outcome.lessonGetRespondWithCalled = await fire(origin + '/lessons/cmd-01-susumu.json', 'GET');
    outcome.lessonGetTriggeredFetch = fetchCalls.length > 0;
    outcome.lessonGetTriggeredCachePut = cachePutCalls.length > 0;

    // 5. 同一オリジンGET・ネットワーク失敗・キャッシュ未ヒット: respondWithに渡る値がResponseであること
    const offlineHandler = makeFetchHandler(failingFetch, fakeCaches);
    const offlineResult = await fireWith(offlineHandler, origin + '/app.js', 'GET');
    outcome.offlineRespondWithRejected = offlineResult.respondWithRejected;
    outcome.offlineRespondWithIsResponse = offlineResult.respondWithValue instanceof Response;

    return outcome;
  });

  await check('POSTはrespondWithすら呼ばれず即座に素通しされる', () => result.postRespondWithCalled === false);
  await check('POSTではfetchもcache.putも発生しない', () => result.postTriggeredFetch === false && result.postTriggeredCachePut === false);

  await check('クロスオリジンGETはrespondWithが呼ばれず素通しされる(ブラウザに任せる)', () => result.crossOriginGetRespondWithCalled === false);
  await check('クロスオリジンGETはSWからfetchもcache.putも発生しない', () => result.crossOriginGetTriggeredFetch === false && result.crossOriginGetTriggeredCachePut === false);

  await check('同一オリジンGET(アプリシェル)はfetchされる', () => result.sameOriginGetRespondWithCalled === true && result.sameOriginGetTriggeredFetch === true);
  await check('同一オリジンGETはキャッシュに書き込まれる(オフライン対応)', () => result.sameOriginGetTriggeredCachePut === true);
  await check('アプリシェル取得はcache:"no-cache"を指定する(GitHub Pagesのmax-age=600を迂回)', () => result.sameOriginGetUsedNoCache === true);

  await check('レッスンJSONはfetchされキャッシュにも書き込まれる', () => result.lessonGetRespondWithCalled === true && result.lessonGetTriggeredFetch === true && result.lessonGetTriggeredCachePut === true);

  await check('オフライン・未キャッシュの同一オリジンGETでもrespondWithはrejectしない', () => result.offlineRespondWithRejected === false);
  await check('オフライン・未キャッシュ時はrespondWithにResponseインスタンスが渡る(undefinedにならない)', () => result.offlineRespondWithIsResponse === true);
}
