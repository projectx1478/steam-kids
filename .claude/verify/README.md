# .claude/verify

AI代理実機確認のためのハーネス。CLAUDE.md「検証方針」に従い、機能の動作・状態遷移・
エラー処理・データ整合性・レイアウト崩れの有無をAIが実機（Playwright + Chromium）で確認する。
検証時のみ読む（毎セッション冒頭には読まない）。

## 実行コマンド

```
node .claude/verify/run.mjs             # scenarios/*.mjs を全実行（既定: 失敗のみ出力）
node .claude/verify/run.mjs foo bar     # scenarios/foo.mjs, scenarios/bar.mjs のみ
node .claude/verify/run.mjs --mobile    # ビューポート375x667（既定は1280x800）
node .claude/verify/run.mjs --verbose   # シナリオ見出し・PASS行も出力
node .claude/verify/run.mjs --shot      # shot()で実際にPNGを撮影する（既定はno-op）
```

失敗があれば exit 1。既定では `FAIL <説明>` とAI失敗のみ出力し、末尾に
`SUMMARY: PASS <N> scenarios / <M> checks`（失敗時は`FAIL ... (<K> failed)`）を出す。
シナリオ見出し・PASS行・SHOT行は`--verbose`/`--shot`を付けた時のみ出力される
（トークン消費を抑えるため既定OFF）。

## シナリオ書式

`scenarios/<name>.mjs` に1シナリオ1ファイル。ヘルパは4つに限定（`page`はPlaywrightの`Page`そのもの）。

```js
export const name = 'かんたんな説明';
export default async function run({ page, check, shot, fixture }) {
  await page.route('**/api/**', (r) => r.fulfill({ json: fixture('gemini-ok') }));
  await page.goto('/index.html');
  await check('タイトルが表示される', async () => (await page.textContent('h1')) === '…');
  await check('カウンタが3になる', async () => page.textContent('.count'), '3');
  await shot('初期表示');
}
```

- `check(説明, fn)`: `fn`が`true`を返せばPASS（真偽値形式）
- `check(説明, fn, expected)`: `fn`の返り値を`expected`と厳密等価で比較（値の期待/実際比較形式）。
  不一致時に`FAIL <説明> | expected: "…" | actual: "…"`を出力する。`expected`がオブジェクト/配列なら
  `JSON.stringify`で比較する
- どちらの形式も判定成立まで最大2秒（100ms間隔）ポーリングする。非同期UIの表示待ちに
  `page.waitForTimeout`を書く必要はない（`fn`は副作用なしの読み取り専用にすること。再実行されるため）
- `shot(label)`: `--shot`指定時のみ`.verify/<name>-<label>.png`に保存（ユーザー確認用。
  AIは既定で画像として読まない。既定では呼び出してもno-op）
- `fixture(name)`: `.claude/verify/fixtures/<name>.json`をJSONとして返す
- サーバはリポジトリルートを配信するため、`page.goto`は`/`始まりの相対パスでよい

### 自動失敗条件（シナリオに書かなくてよい）

`console.error`・未捕捉例外（`pageerror`）・HTTP 4xx/5xxレスポンスを1件でも検知すると、
そのシナリオの`check`が全てPASSでも自動的に失敗になる。

## フィクスチャ

`.claude/verify/fixtures/*.json` にテストデータを置き、`fixture(name)`で読む。
外部API依存は`page.route`で固定レスポンスに差し替え、実際のネットワーク呼び出しを行わない。

## レイアウト崩れの確認（DOM判定）

スクリーンショットを画像として読ませるのではなく、`boundingBox()`でDOM上の数値として判定する。

```js
const box = await page.locator('.card').boundingBox();
await check('カードがviewport幅に収まる', async () => box.x + box.width <= 1280);
```

要素同士の重なりは、2つの`boundingBox()`の矩形が交差するかで判定する。

## シナリオの粒度・命名

- 1シナリオ＝1つのユーザーフロー（画面遷移1つ、フォーム送信1つ、等）
- ファイル名は`kebab-case`で機能を表す名前にする（例: `login-success.mjs`, `form-validation-error.mjs`）
- ユーザー担当（人でなければ判定できない項目）はシナリオ化せず、実行結果の報告でスクリーンショットとともに確認を依頼する

## 拡張フック（`.claude/verify/config.mjs`）

`run.mjs`はテンプレートからの配布対象（上書きされる）だが、`config.mjs`は配布対象外なので
リポジトリ固有の事情を書ける。無ければ`run.mjs`は従来通り動く。3つのキーを任意で上書きできる。

```js
// .claude/verify/config.mjs
import { execSync } from 'node:child_process';

export default {
  // 配信ルート（ROOTからの相対パス）。ビルドステップがあり、ビルド後のディレクトリを
  // 配信する必要がある場合のみ指定する（既定はリポジトリルート）
  distDir: 'dist',

  // シナリオ実行前に一度だけ呼ばれる。ビルドコマンドの実行等に使う
  async beforeAll({ root, verbose }) {
    execSync('npm run build', { cwd: root, stdio: verbose ? 'inherit' : 'ignore' });
  },

  // シナリオごとのpage生成直後、scenario.run()の前に呼ばれる。
  // 個別シナリオでの差し替え漏れを防ぐための既定route固定に使う
  // （外部フォント等のオフライン安定化、ログイン確認前に必ず呼ばれるAPIの既定値、等）
  async setupRoutes(page) {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
  },
};
```

ビルドステップを持たないバニラJS構成では`config.mjs`は不要（作らない）。
