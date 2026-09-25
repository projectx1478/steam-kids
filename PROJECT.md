# PROJECT.md

## プロジェクト概要

**steam-kids** — 小学生向けインタラクティブSTEAM学習アプリ。

説明を読ませず、**操作して予想し、結果とのズレを見る**ことで概念を獲得させる。教材をJSONで
量産できる基盤を作り、学習履歴を保護者・教師が確認して教材改善に使える状態を目指す。
家庭利用（年長・1名）から開始し、授業・校内配布へ展開することを前提に設計する。

公開URL: https://projectx1478.github.io/steam-kids/

### 非目標（やらないこと）

- 実行時のLLM呼び出し（生成は開発時のみ。子どもが使う場面でAPIを呼ばない）
- 学習者のログイン、メールアドレス、パスワード認証（保護者ゲートの合言葉は対象外）
- 氏名・学校名・学年の同期データへの保存
- 正誤採点、点数表示、ランキング（完了スタンプは可。数値比較・順位は出さない。Issue #58）
- ネイティブアプリ化（Webのみ）

## 1. 要件定義

### 対象と環境

| 項目 | 内容 |
| --- | --- |
| 第一ユーザー | 年長（来年小学1年）。ひらがな・かんたんな漢字を自分で読める |
| 将来ユーザー | 小学生全般、授業での一斉利用 |
| 端末 | Amazon Fire タブレット、iPad、GIGA端末、PCブラウザ |
| 画面 | タブレット横向きを基準。縦でも破綻しないこと |
| 回線 | オフラインで学習継続可能。オンライン時のみ同期 |

### 学習体験の固定仕様

すべての教材型に共通する作法。**この3段構えを省いた教材を作らない。**

1. **予想** — 操作の前に結果を予想させる（タップ選択）
2. **実行** — 実際に動かす
3. **ズレを見る** — 予想と結果の差分を示す

UI規則（受け入れ条件。すべて判定可能な数値条件とする）:

- 1レッスン = 4〜7ステップ、所要5分
- 1画面の文章は20字以内
- アニメーションは1手あたり0.6秒。実行中は該当箇所をハイライト
- 失敗表示を出さない。未達成時は「もういちど」のみ
- 操作はタップのみ。ドラッグ&ドロップを使わない
- タップ領域は48px四方以上
- 文字はひらがな主体。漢字は`{漢字|よみ}`のルビ記法で書き、文部科学省「学年別漢字配当表」
  （`js/kanji-grades.js`）内の漢字に限る。表示は端末内の「よみレベル」設定に応じて
  漢字/ひらがなを自動で出し分け、ふりがなトグルで`<ruby>`表示を切り替える（Issue #59）
- 音声読み上げはMVP対象外。文言はレッスンデータ側の文字列として持ち、DOMに直書きしない

教材型5種の一覧と `grid-runtime` の詳細仕様、初回単元の内容は `docs/learning-spec.md`。
MVP実装対象は `grid-runtime` と、全型共通の予想ステップのみ。

## 2. 技術設計

### 全体アーキテクチャ

```
単元テーマ
  ↓  Claude Code（開発時のみ）
レッスンJSON  →  スキーマ検証  →  リポジトリに蓄積
  ↓
学習エンジン（固定・静的サイト）
  ↓
イベントログ（localStorage）→ 同期 → ダッシュボード
```

学習エンジンのコードは固定。**教材追加はJSONの追加のみで完結すること。**

### フロントエンド

- **フレームワーク**: バニラ JavaScript（ES Modules）。JSのビルドステップは導入しない
- **UI状態管理**: S オブジェクトパターン（単一オブジェクト、直接変更）
- **スタイリング**: Tailwind CSS。**開発時のみCLIでビルドし、生成物 `style.css` をコミットする**
  - 実行時にCDNから取得しない（オフライン要件）
  - `style.css` は自動生成物。直接編集せず `tailwind.src.css` を編集して再ビルドする
  - Tailwindはバージョンを固定指定する（`package-lock.json` はGit除外のため）
- **ホスティング**: GitHub Pages（public リポジトリ・無料枠）
- 画像素材を使わず、すべて自作SVGで描画する（権利・容量・配布の自由度）
- **Service Worker**でオフライン対応・更新反映を行う（方式は `docs/caching.md`）

### 教材データ

- リポジトリ内の `lessons/*.json`
- スキーマ・検証ルールは `docs/lesson-schema.md`
- P0のみJSモジュールにハードコードする。JSONと同一形状で持ち、P1で
  `lessons/cmd-01-susumu.json` へそのまま移す

### 同期・バックエンド・機密情報管理

同期方式・バックエンド（Cloudflare Workers + D1）・秘密情報の扱いは `docs/design-sync.md`。

### 保護者ゲート（ダッシュボード保護）

`dashboard.html` は合言葉ゲートで保護する（Issue #37）。解錠は端末内PBKDF2照合のみでオフライン可。
詳細は `docs/design-sync.md`。

### プライバシー要件

全フェーズで守る恒久的制約。

- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない
- 学習者の識別はランダムUUID（`learnerId`）のみ
- 呼び名（`label`）・よみレベル（`readingLevel`）は **localStorage のみ**。同期先へ送信しない
- 子ども画面から外部へのリンクを置かない
- 広告・解析タグを入れない
- 外部共有は**単元単位の匿名集計のみ**。個人単位のデータを出さない

### 授業展開に向けた制約

- 1レッスン5分固定。50分授業に4〜6本入る単位
- URLで単元へ直接入れること（ログイン機構を作らない。共用端末を想定）
- 実行時に外部APIを呼ばない
- 教科書の図版・記述に寄せない
- イベント拡張は `classId` 追加のみで対応（`docs/lesson-schema.md`）

### ファイル構成

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
  ui-grid.js # SVGグリッド描画とハイライト
  ui-commands.js # 命令パレット・命令列・個別削除・全消し
  ui-step.js # ステップ切替、ふりがなトグル
  sfx.js # 効果音（Web Audio API合成・単一API play(name)、BGMなし）
  events.js # logEvent() / getEvents()（storage.js経由で永続化）
  storage.js # localStorage読み書き（イベント・学習者プロファイル）
  analytics.js # 学習ログ集計・詰まりアラート判定（純粋関数）
  guardian.js # 保護者ゲートの合言葉管理
  ui-gate.js # dashboard.htmlのゲート描画
  ui-dashboard.js # dashboard.htmlの描画（summarize結果の描画のみ）
  register-sw.js # SW登録・更新時の自動リロード
lessons/ # レッスンJSON（P1〜）
tools/ # レッスンJSON検証ツール
docs/ # 詳細ドキュメント（7章の索引を参照）
workers/steam-kids-sync/ # 同期API（Cloudflare Workers + D1、P3〜）
.claude/ # Claude Codeのフック・検証ハーネス・スクリプト
.devcontainer/ # Codespaces/OpenCode Web用コンテナ設定
```

ES Modules（`<script type="module">` / `import`/`export`）でファイル間を接続する。

## 3. 開発ルール

### Git ワークフロー

- **Main ブランチ**: 本番環境。直接 push 禁止
- **Feature ブランチ**: Claude Codeセッションは`claude/xxx`。人が作業する場合は`feature/XXX`または`fix/XXX`
- **Commit**: 論理的に小さな単位（Small Commit）
- **Pull Request**: 機能単位で作成

本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
`.claude/` 配下の同期対象ファイルは **project-template 側で編集する**。本リポジトリで編集しても
テンプレート同期PRで上書きされる。プロジェクト固有の規則は本ファイルと `docs/` に置く。

### 検証コマンド

コード変更後に必ず実行する。

| 種別 | コマンド |
| --- | --- |
| テスト | なし |
| Lint | なし |
| 型チェック | なし |
| ビルド | `npx tailwindcss@3.4.17 -i tailwind.src.css -o style.css --minify` |
| E2E/実機確認 | `node .claude/verify/run.mjs` |
| レッスンJSON検証 | `npm run validate:lessons` |

### コーディング規則

- **ファイル名**: 小文字統一
- **変数命名**: camelCase
- **クラス**: PascalCase
- **定数**: UPPER_SNAKE_CASE
- **コメント**: 最小限（WHY が非自明な場合のみ）
- **ファイルサイズ**: コードは1ファイル目安1000行以内、超えたら機能単位で分割
- ドキュメントは字数基準（CLAUDE.md参照）

### 他プロジェクトからのコード再利用

project-template の PROJECT.md の4条件を満たす場合のみコピー可。出典コメント
（コミットハッシュ）を冒頭に必須記載し、以後は独立資産として扱う。

## 4. Issue 管理

### ラベル分類

- `feature`: 新機能
- `bug`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント

Issueには理由ではなく**判定可能な数値条件**を書く（0.6秒、20字以内、絶対方向4種など）。
1 Issue = 1 PR = 1セッション。完了条件は画面上で確認できる形で書く。

## 5. AI 運用ルール（Claude Code）

- **AIの責務**: コード実装・修正、仕様整理時の質問対応、技術判断の提案
- **人間の責務**: 仕様確定、コードレビュー、Merge判定、実機での子どもの反応確認（AI代理不可）

### モデル分担

設計・Issue起票・調査は Opus、実装は Sonnet。詳細は CLAUDE.md「モデル選択ルール」。

### OpenCode

`opencode.json` に `provider`・`model`・APIキーを書かない（詳細: project-template PROJECT.md）。

## 6. ロードマップ

| Phase | 内容 | 完了条件 |
| --- | --- | --- |
| P0 | grid-runtime をレッスン1ハードコードで動かす | 実機で子どもがゴールまで到達できる |
| P1 | レッスンJSON外出し、スキーマと検証スクリプト | レッスン1が `lessons/cmd-01-susumu.json` から読み込まれ、検証が通る |
| P2 | イベントログ + localStorage + ダッシュボード（単一端末） | 詰まりアラートが表示される |
| P3 | 同期バックエンド決定、匿名認証、同期、リンクコード | 別端末でコード入力後、履歴が統合表示される |
| P4 | Claude Code による教材生成フロー整備 | 単元名から検証済みJSONが生成される |
| P5 | レッスン2・3の追加 | 単元として3本完走できる |

**P0を実機で試すまで、以降を作り込まない。反応が想定と違えば設計から見直す。**

## 7. 関連ドキュメント（docs/）

- `docs/learning-spec.md` — 教材型5種・`grid-runtime`仕様・初回単元。教材実装・レッスン追加時に読む
- `docs/lesson-schema.md` — レッスンJSON・イベント・学習者プロファイルのスキーマ。教材・イベント追加時に読む
- `docs/authoring-rules.md` — 教材の文言・表現の禁止事項と使用可能な文字。レッスン文言を書く・生成する時に読む
- `docs/dashboard.md` — ダッシュボードの表示内容と詰まりアラートの判定条件。P2着手時に読む
- `docs/design-sync.md` — 同期方式、バックエンド選定（未決）、秘密情報の扱い。P3着手時に読む
- `docs/caching.md` — Service Workerの方式・版数管理。Issue #28着手時に読む

## 8. 未決事項

- ダッシュボードの認証方法（校内配布時の教師向け保護。話が出た時点で決める）
