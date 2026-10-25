// 出典: projectx1478/kids-player の service-worker.js（コミット 74adf54）。
// ネットワーク優先方式・GET以外の素通し・クロスオリジンGETの素通し・オフライン未ヒット時の
// フォールバック（Issue #70・#110 の修正を含む設計）をそのまま移植（Issue #28）。
//
// steam-kids固有の追加: GitHub Pages配信（Cache-Control: max-age=600）のため、
// アプリシェル取得に cache: "no-cache" を指定しHTTPキャッシュを迂回する（kids-playerはVercel
// 配信のためこの指定が無い）。CACHE_NAMEはjs/config.jsのAPP_VERSIONと同値にする（docs/caching.md）。
const CACHE_NAME = "steam-kids-cache-v93";
const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./style.css",
  "./fonts/mplusrounded1c-800.woff2",
  "./app.js",
  "./js/analytics.js",
  "./js/bgm.js",
  "./js/config.js",
  "./js/index-units.js",
  "./js/gimmick-unlock.js",
  "./js/engine-grid.js",
  "./js/engine-generate.js",
  "./js/engine-seesaw.js",
  "./js/events.js",
  "./js/gimmicks/cushion.js",
  "./js/gimmicks/ice.js",
  "./js/gimmicks/index.js",
  "./js/gimmicks/items.js",
  "./js/gimmicks/keys.js",
  "./js/gimmicks/paint.js",
  "./js/gimmicks/periodic.js",
  "./js/gimmicks/switches.js",
  "./js/gimmicks/water.js",
  "./js/gimmicks/warps.js",
  "./js/gate-date.js",
  "./js/guardian.js",
  "./js/kanji-grades.js",
  "./js/lesson-loader.js",
  "./js/merge.js",
  "./js/register-sw.js",
  "./js/seed-code.js",
  "./js/sfx.js",
  "./js/slot-utils.js",
  "./js/state.js",
  "./js/storage.js",
  "./js/sync.js",
  "./js/text-render.js",
  "./js/ui-commands.js",
  "./js/ui-dashboard.js",
  "./js/ui-demo.js",
  "./js/ui-gate.js",
  "./js/ui-menu.js",
  "./js/ui-dialog.js",
  "./js/ui-zoom.js",
  "./js/ui-grid.js",
  "./js/ui-board.js",
  "./js/ui-guide.js",
  "./js/ui-hand.js",
  "./js/ui-parental-gate.js",
  "./js/ui-picker.js",
  "./js/ui-tracks.js",
  "./js/unlock.js",
  "./js/dev-mode.js",
  "./js/ui-play.js",
  "./js/ui-predict.js",
  "./js/ui-reaction.js",
  "./js/trial-lesson.js",
  "./js/ui-clear.js",
  "./js/ui-retry.js",
  "./js/ui-screen.js",
  "./js/ui-bird.js",
  "./js/bird-phrases.js",
  "./js/ui-seedpick.js",
  "./js/ui-seesaw.js",
  "./js/ui-step.js",
  "./js/ui-summary.js",
  "./js/ui-slots.js",
  "./js/ui-story.js",
  "./js/ui-sync.js",
  "./js/ui-title.js",
  "./js/ui-toast.js",
  "./js/ui-tutorial.js",
  "./js/undo-clear.js",
  "./js/vendor/confetti.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Cache APIはGET以外を受け付けないため素通しする(同期APIへのPOST等)
  if (event.request.method !== "GET") return;

  const url = event.request.url;

  // 同期API(Cloudflare Worker)等のクロスオリジンリソースはキャッシュ対象外(network-only)。
  // キャッシュするとオフライン時に古い同期結果を誤って返してしまうため素通しする。
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  // レッスンJSONは常に最新を取りに行く(オフライン時のみキャッシュにフォールバック)
  if (url.includes("/lessons/")) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // BGM音源（audio/）はAPP_SHELLに入れず、初回再生時に遅延保存（docs/caching.md。Issue #378 段2）。
  // 容量を抑え・installを壊さないため。キャッシュ優先（配布物の音源は同名更新のため再検証しない）。
  if (url.includes("/audio/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
          }
          return response;
        });
      })
    );
    return;
  }

  // 同一オリジンのアプリシェルもネットワーク優先。cache:"no-cache"でHTTPキャッシュを迂回し
  // GitHub Pagesのmax-age=600に関わらず常にETag再検証させる(オンラインなら常に最新版を取得)。
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
