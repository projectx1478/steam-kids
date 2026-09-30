# PROJECT.md

## プロジェクト概要

**steam-kids** — 小学生向けインタラクティブSTEAM学習アプリ。

説明を読ませず、**手を動かして考え、返ってくる結果から学ぶ**ことで概念を獲得させる。教材をJSONで
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

すべての教材に共通する作法（Brilliant.orgをモデルに独自調整。Issue #154）。
**次の3原則を満たし、2つの操作モデルのいずれかに属さない教材は作らない。**

1. **手を動かして考える** — 説明文を先に読ませない。選択肢UIは使わず（Issue #104）、操作・配置そのものを考えの表明とする
2. **結果が画面と音で返る** — 正誤・点数で評価しない（完了スタンプは可。Issue #58）。成功はロボットの喜び・演出・効果音、失敗はやさしい反応で示す
3. **つまずきが次の手がかりになる** — 正解の道・答えは見せない。止まった命令・ぶつかったマス・塗り残しなど事実の手がかりだけを盤面に示す（短い事実の文は添えてよい）。「もういちど」「1手もどる」はノーリスクで即時に行える

| 操作モデル | 流れ | 向く教材 |
| --- | --- | --- |
| 計画型 | 命令を組む（予想）→実行（一括／1コマ）→ズレを見る | プログラミング、手順、てこ |
| 直接操作型 | 1手動かす→盤面が即変化→行き詰まりから考え直す | 一筆書き、迷路、色ぬり、つなぐ |

直接操作型は「1手もどる」「さいしょから」を常時置き、行き詰まり時は未達成部分をやさしく点滅させる（答えは見せない）。
実装時のDO/DON'T判定表は `docs/ui-rules.md`「学習体験の判定表」。

UI規則（受け入れ条件。すべて判定可能な数値条件）は `docs/ui-rules.md`。子ども画面のUIを変更するとき読む。

教材型5種の一覧と `grid-runtime` の詳細仕様、初回単元の内容は `docs/learning-spec.md`。
MVP実装対象は `grid-runtime`。予想ステップ（`kind: "predict"`）は将来の教材型向けに語彙のみ残し、
現行レッスンでは使わない（Issue #104）。

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

### 授業展開に向けた制約・ロードマップ

1レッスン5分固定、URLで単元へ直接入れる（ログイン機構なし）、実行時に外部APIを呼ばない等。制約とP0〜P5のロードマップは `docs/roadmap.md`。

### ファイル構成

`index.html`・`dashboard.html`・`app.js`・`js/`（ES Modules）・`lessons/`・`tools/`・`docs/`・`workers/`等。ファイル別の役割は `docs/file-structure.md`。

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

コード変更後、手元で実行するのは軽量チェック（`check:static`・`test:unit`・`validate:lessons`・ビルド）のみ。E2Eは手元で実行せず（`tools/verify-all.mjs`のガードで止まる）GitHub Actionsで実行する。軽量チェックはPRごとにCI（`.github/workflows/checks.yml`）でも自動実行する。

| 種別 | コマンド |
| --- | --- |
| 静的チェック | `npm run check:static` |
| テスト | `npm run test:unit` |
| Lint | なし |
| 型チェック | なし |
| ビルド | `npx tailwindcss@3.4.17 -i tailwind.src.css -o style.css --minify` |
| E2E/実機確認 | 手元では実行しない。実装中＝`gh workflow run e2e-run.yml --ref <ブランチ> -f scenarios="<名前…>"`、PR＝E2E PR（本文の`E2E:`行）、全件＝夜間 |
| レッスンJSON検証 | `npm run validate:lessons` |

E2Eの実行方法・報告形式は `docs/testing-guidelines.md` に従う。

影響範囲確認：レッスンJSONやDOM契約（`data-action`等）を変更するときは、`grep -lE '<lessonId|data-action名>' .claude/verify/scenarios/*`で影響シナリオを列挙する。`.claude/verify/config.mjs`の凍結fixture（cmd-01・donguri-01）の対象かも確認する。

### ギミックの追加手順・検証規則

追加手順・シナリオ命名・`solution`必須等は `docs/gimmicks.md`「追加手順・検証規則」。

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

- PR作成の報告には「次は`/clear`してから」を添える（1 Issue = 1セッション。文脈を持ち越さないと1呼び出しあたりの消費が3〜4倍になる。#123で計測）

### モデル分担

設計・Issue起票・調査は Opus、実装は Sonnet。詳細は CLAUDE.md「モデル選択ルール」。

### OpenCode

`opencode.json` に `provider`・`model`・APIキーを書かない（詳細: project-template PROJECT.md）。

## 6. ロードマップ

P0（実機で到達）→P1（JSON外出し）→P2（ログ・ダッシュボード）→P3（同期）→P4（生成フロー）→P5（3本完走）。詳細は `docs/roadmap.md`。**P0を実機で試すまで、以降を作り込まない。**

## 7. 関連ドキュメント（docs/）

- `docs/ui-rules.md` — 子ども画面のUI規則（受け入れ条件）。子ども画面のUIを変更するとき読む
- `docs/gimmicks.md` — 盤面ギミック（items等）の仕様。ギミックの追加・変更時に読む
- `docs/learning-spec.md` — 教材型5種・`grid-runtime`仕様・初回単元。教材実装・レッスン追加時に読む
- `docs/lesson-schema.md` — レッスンJSON・イベント・学習者プロファイルのスキーマ。教材・イベント追加時に読む
- `docs/authoring-rules.md` — 教材の文言・表現の禁止事項と使用可能な文字。レッスン文言を書く・生成する時に読む
- `docs/dashboard.md` — ダッシュボードの表示内容と詰まりアラートの判定条件。P2着手時に読む
- `docs/design-sync.md` — 同期方式、バックエンド選定（未決）、秘密情報の扱い。P3着手時に読む
- `docs/caching.md` — Service Workerの方式・版数管理。Issue #28着手時に読む
- `docs/file-structure.md` — ファイル別の役割一覧。ファイルの新設・移動時に読む
- `docs/roadmap.md` — 授業展開の制約とP0〜P5ロードマップ。フェーズ計画・授業展開を検討する時に読む
- `docs/testing-guidelines.md` — 検証の運用（E2EはGitHub Actionsのみ・手元ガード・夜間失敗の対応）。検証するとき読む

## 8. 未決事項

- ダッシュボードの認証方法（校内配布時の教師向け保護。話が出た時点で決める）
