# 配信キャッシュ・Service Worker

Issue #28着手時に読む。Service Workerの方式・分岐規則・版数の上げ方・落とし穴。

## 経緯

本リポジトリには当初Service Workerが無く、`index.html`はバージョン無しの固定パスで
`app.js`/`style.css`を参照していた。GitHub Pagesの`Cache-Control: max-age=600`と相まって、
マージしても実機が新版へ変わらない事故が発生した（Issue #28）。同時にPROJECT.md「オフラインで
学習継続可能」の要件も未達だった。Service Workerの導入で両方を閉じる。

kids-player（出典コミット`74adf54`）の`service-worker.js`から移植した。

## 方式

**ネットワーク優先**。cache-firstは採らない（不良版が子どものタブレットに残留すると、
ネットがあっても復旧できなくなるため）。オンラインなら常に最新を取りに行き、失敗時のみ
キャッシュへフォールバックする。

## fetchハンドラの分岐規則

| 条件 | 挙動 |
| --- | --- |
| GET以外(POST等) | 即return（`respondWith`を呼ばない）。Cache APIはGET以外のRequestを受け付けず`TypeError`になるため |
| クロスオリジン(同期API) | 即return（`respondWith`を呼ばない）。SWから再発行せずブラウザに任せる。古い同期結果を誤って返さないため |
| `lessons/*.json` | ネットワーク優先、失敗時のみキャッシュへフォールバック |
| 同一オリジンのアプリシェル | ネットワーク優先。`fetch(request, { cache: "no-cache" })` |
| オフライン・未キャッシュ | `caches.match()`の結果を`cached \|\| Response.error()`で返す（`undefined`を`respondWith`に渡さない） |

`cache: "no-cache"`はGitHub Pages固有の対策。SW内の`fetch`は既定でHTTPキャッシュを経由するため、
指定しないとGitHub Pagesの`max-age=600`がSWを介しても残る。`no-cache`はETagによる再検証を強制し、
変更が無ければ304で帯域も無駄にしない（kids-playerはVercel配信のためこの指定が無い）。

## 版数管理

`service-worker.js`の`CACHE_NAME`と`js/config.js`の`APP_VERSION`を同値にする。SWは`import`できず
二重管理になるため、一致は`.claude/verify/scenarios/app-version.mjs`で機械チェックする。
`APP_VERSION`はダッシュボードのフッタに表示され、実機でどの版が動いているかを判別できる。

キャッシュの内容を変える変更（`APP_SHELL`に含まれるファイルの追加・削除、分岐規則の変更）を
行うPRでは、両方の値を同時に上げること。

## 更新の反映

`install`で`skipWaiting()`、`activate`で旧キャッシュ削除＋`clients.claim()`。クライアント側
（`js/register-sw.js`、`app.js`と`js/ui-dashboard.js`の両エントリから呼ぶ）は`controllerchange`
イベントで`location.reload()`する（再入防止フラグ付き）。

**この仕組み自体は既存端末には即座には効かない。** 古い`index.html`がブラウザのHTTPキャッシュで
期限切れ（最大10分）になるか、手動でハードリロードされるまでSWは載らない。効くのは次の更新から。

## 検証時の注意

- **SWを実登録して検証しない。** SW内の`fetch`はPlaywrightの`page.route()`を貫通して実ネットワーク
  へ出てしまい、検証環境では到達不可のため誤ってFAILする。`service-worker.js`のソースを取得し、
  `new Function('self', 'fetch', 'caches', code)`で疑似環境に読み込んでfetchハンドラを直接叩き、
  ルーティング判定のみを検証する（`.claude/verify/scenarios/sw-routing.mjs`）
- `.claude/verify/run.mjs`は`browser.newContext({ serviceWorkers: 'block' })`でSW登録自体を
  ブロックしている。`controllerchange`による自動`location.reload()`が、他シナリオの`page.reload()`
  と競合してframeをdetachさせるため（Issue #28で`p2-dashboard.mjs`が実際に失敗した）
