# ファイル構成

リポジトリのファイル構成。ファイルを新設・移動・削除したときに更新する。

```
index.html
dashboard.html # 保護者・教師向けダッシュボード
service-worker.js # オフライン対応・更新反映（docs/caching.md）
style.css # Tailwind生成物（コミット対象・直接編集禁止）
tailwind.src.css # Tailwindソース
tailwind.config.js
package.json # devDependency: tailwindcss / scripts.build:css
app.js # エントリーポイント（初期化のみ）
js/
  state.js # 状態管理（Sオブジェクト）
  lesson-cmd-01.js # P0のレッスンデータ（レッスンJSONと同形状）
  engine-grid.js # grid-runtimeの純粋関数（命令列→経路・到達判定）
  engine-generate.js # シードからgrid-runtime盤面を生成する純粋関数（PRNG・制約判定・予備盤面。Issue #68）
  seed-code.js # れんしゅうの絵コード（8種×4マス）⇔シード変換・絵SVG（Issue #69）
  ui-seedpick.js # れんしゅうのたねコード入力画面（Issue #69）
  ui-grid.js # SVGグリッド描画とハイライト
  ui-commands.js # 命令パレット・命令列・個別削除・全消し
  ui-step.js # ステップ切替、ふりがなトグル
  ui-title.js # タイトル画面（起動時のみ。Issue #107）
  sfx.js # 効果音（Web Audio API合成・単一API play(name)、BGMなし）
  events.js # logEvent() / getEvents()（storage.js経由で永続化）
  storage.js # localStorage読み書き（イベント・学習者プロファイル）
  analytics.js # 学習ログ集計・詰まりアラート判定（純粋関数）
  guardian.js # 保護者ゲートの合言葉管理
  gate-date.js # 日次ゲートの最終認証日（ローカル日付。Issue #217）
  ui-parental-gate.js # 子ども画面の日次保護者ゲート・openParentalGate（Issue #217）
  ui-gate.js # dashboard.htmlのゲート描画
  ui-dashboard.js # dashboard.htmlの描画（summarize結果の描画のみ）
  register-sw.js # SW登録・更新時の自動リロード
lessons/ # レッスンJSON（P1〜）
tools/ # レッスンJSON検証ツール
docs/ # 詳細ドキュメント（PROJECT.md 7章の索引を参照）
workers/steam-kids-sync/ # 同期API（Cloudflare Workers + D1、P3〜）
.claude/ # Claude Codeのフック・検証ハーネス・スクリプト
.devcontainer/ # Codespaces/OpenCode Web用コンテナ設定
```

ES Modules（`<script type="module">` / `import`/`export`）でファイル間を接続する。
