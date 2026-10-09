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
  engine-seesaw.js # predict-slider（シーソー）の純粋関数（おもさ×きょりの傾き判定。Issue #150）
  ui-seesaw.js # シーソーplay画面の描画（Issue #150）
  ui-screen.js # 操作画面の枠の共通部品（問い文の行・盤面・パネル・ボタン行。play・シーソーが使う。docs/components.md。Issue #343）
  ui-clear.js # クリア演出の共通部品（星→間→結果ダイアログ。使い方は docs/clear-component.md。Issue #342）
  ui-retry.js # やり直しの流れの共通部品（失敗のゆれ shakeBoard・ボタン切替 setRetryButton・「スタート！」showRestartCue。Issue #344）
  seed-code.js # れんしゅうの絵コード（8種×4マス）⇔シード変換・絵SVG（Issue #69）
  ui-seedpick.js # れんしゅうのたねコード入力画面（Issue #69）
  ui-grid.js # SVGグリッド描画とハイライト
  ui-board.js # 盤面の共通部品（マスの大きさ・描画・描き直しの観察）
  ui-commands.js # 命令パレット・命令列・個別削除・全消し
  ui-step.js # ステップ切替、ふりがなトグル
  ui-title.js # タイトル画面（はじめから／つづきから。起動時のみ。Issue #107・#218）
  ui-slots.js # スロット選択・上書き確認・名前入力（Issue #218）
  ui-story.js # 導入ストーリー（Issue #218）
  slot-utils.js # 名前整形・スロット表示用の純関数（Issue #218）
  unlock.js # レッスンの段階解放（純関数。Issue #216）
  dev-mode.js # 開発者画面（`dev=1`）の判定とURL引き継ぎ（Issue #216）
  sfx.js # 効果音（Web Audio API合成・単一API play(name)、BGMなし）
  events.js # logEvent() / getEvents()（storage.js経由で永続化）
  storage.js # localStorage読み書き（イベント・学習者プロファイル。スロット別キー）
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
  components.md # 共通部品の台帳（部品名・置き場・説明・禁止パターン。Issue #347）
test/ # 単体テスト（node --test）
  forbidden-registry.mjs # 禁止パターンの登録表（id・部品・検出関数・除外ファイル。Issue #349）
  forbidden-baseline.json # 禁止パターンの基準件数（patterns・allow・excluded。増減とも赤）
workers/steam-kids-sync/ # 同期API（Cloudflare Workers + D1、P3〜）
.claude/ # Claude Codeのフック・検証ハーネス・スクリプト・agents（原則見直しの4役）・commands（/principles-review）・skills
review/ # 原則見直しレビューの入力と出力（Issue #227）。principles/にcontext.md・difficulty.md・round1/。観察メモ・screens/の画像はgitignore
.devcontainer/ # Codespaces/OpenCode Web用コンテナ設定
```

ES Modules（`<script type="module">` / `import`/`export`）でファイル間を接続する。
