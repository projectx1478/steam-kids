# PROJECT.md

## プロジェクト概要

**steam-kids** — 小学生向けインタラクティブSTEAM学習アプリ。

説明を読ませず、**手を動かして考え、返ってくる結果から学ぶ**ことで概念を獲得させる。教材はJSONで量産でき、学習履歴は保護者・教師が教材改善に使える状態を目指す。家庭利用から授業・校内配布へ展開する前提で設計する。

公開URL: https://projectx1478.github.io/steam-kids/

### 非目標（やらないこと）

- 実行時のLLM呼び出し（生成は開発時のみ。子どもが使う場面でAPIを呼ばない）
- 学習者のログイン、メールアドレス、パスワード認証（保護者ゲートの合言葉は対象外）
- 正誤採点、点数表示、ランキング（完了スタンプは可。数値比較・順位は出さない。Issue #58）
- ネイティブアプリ化（Webのみ）

## 1. 要件定義

### 対象と環境

| 項目 | 内容 |
| --- | --- |
| 第一ユーザー | 小学校低学年（1〜3年生）以上。学年相当の漢字はふりがな付きで読める。UIは幼く見せない |
| 将来ユーザー | 小学生全般・授業の一斉利用 |
| 端末 | Amazon Fire タブレット、iPad、GIGA端末、PCブラウザ |
| 画面 | 横向き基準。縦でも破綻しない |
| 回線 | オフラインで学習継続可能。オンライン時のみ同期 |

### 学習体験の固定仕様

すべての教材に共通する作法（Brilliant.orgをモデルに独自調整。Issue #154）。
借りるもの： 短い段階を積む／操作して結果を見る／答えを言わない。
借りないもの： 予想の言語化／選択肢での予想／長い説明文。
**次の3原則を満たし、2つの操作モデル（計画型／直接操作型。`docs/learning-spec.md`）のいずれかに属さない教材は作らない。**

1. **手を動かして考える** — 読ませる説明（説明文）は先に置かない。見せる説明（見本アニメ・光る手がかり・指ガイド）は先に置いてよい。答えを選ばせて正誤を判定する択一UIは使わず（Issue #104。操作ボタン・道具の選択・◀▶での位置調整は含まない）。操作・配置そのものを考えの表明とする
2. **結果が画面と音で返る** — 正誤・点数で評価しない（完了スタンプは可。Issue #58）。成功はロボットの喜び・演出・効果音、失敗はやさしい反応で示す
3. **つまずきが次の手がかりになる** — 正解の道・答えは見せない。止まった命令・ぶつかったマス・塗り残しなど事実の手がかりだけを盤面に示す（短い事実の文は添えてよい）。「もういちど」「1手もどる」はノーリスクで即時に行える

## 2. 技術設計

### 全体アーキテクチャ・フロントエンド

バニラJSでビルドなし／`style.css`は生成物（`tailwind.src.css`を編集して再ビルド）／画像は自作SVG／Service Workerでオフライン対応。アーキテクチャ図と技術選定の詳細は`docs/file-structure.md`。
**教材追加はJSONの追加のみで完結すること。**

### 教材データ・同期

- 教材は `lessons/*.json`（スキーマ・検証ルールは `docs/lesson-schema.md`）
- 同期・バックエンド（Cloudflare Workers + D1）・秘密情報・保護者ゲート（`dashboard.html`の合言葉。端末内PBKDF2照合でオフライン可。#37）は `docs/design-sync.md`

### プライバシー要件

全フェーズで守る恒久的制約。

- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない
- 学習者の識別はランダムUUID（`learnerId`）のみ
- 呼び名（`label`）・よみレベル（`readingLevel`）は **localStorage のみ**。同期先へ送信しない
- 子ども画面から外部へのリンクを置かない
- 広告・解析タグを入れない
- 外部共有は**単元単位の匿名集計のみ**。個人単位のデータを出さない

### ファイル構成

`index.html`・`dashboard.html`・`app.js`・`js/`（ES Modules）・`lessons/`・`tools/`・`docs/`・`workers/`等。ファイル別の役割は `docs/file-structure.md`。

## 3. 開発ルール

### Git ワークフロー

ブランチ・PR運用はAGENTS.md「GitHub運用」。

### 検証コマンド

軽量チェックは手元とCIで実行し、E2EはCIのみ（`config.mjs`の`ciOnly`が手元実行を止める）。

| 種別 | コマンド | 実行場所 |
| --- | --- | --- |
| 静的チェック | `npm run check:static` | 手元＋CI |
| テスト | `npm run test:unit` | 手元＋CI |
| Lint | なし | - |
| 型チェック | なし | - |
| ビルド | `npx tailwindcss@3.4.19 -i tailwind.src.css -o style.css --minify` | 手元＋CI |
| E2E/実機確認 | `npm run verify:e2e` | CI実行（実装中＝`e2e-run`・PR＝`e2e-pr`・全件＝`e2e-nightly`） |
| レッスンJSON検証 | `npm run validate:lessons` | 手元＋CI |

夜間CI失敗ラベル：`e2e-nightly`。運用・スモークの注意は`docs/testing-guidelines.md`・`docs/testing-steam-kids.md`。

影響範囲確認：レッスンJSONやDOM契約を変える時は`.claude/verify/scenarios/`をgrepして影響シナリオを列挙し、凍結fixture（cmd-01・donguri-01）の対象かも確認する。

### ギミックの追加手順・検証規則

→ `docs/gimmicks.md`「追加手順・検証規則」。コーディング規則・ラベル分類・コード再利用は `docs/dev-rules.md`。

## 4. Issue 管理

Issueには理由ではなく**判定可能な数値条件**を書く（0.6秒、20字以内、絶対方向4種など）。
1 Issue = 1 PR = 1セッション。完了条件は画面上で確認できる形で書く。

## 5. AI 運用ルール（Claude Code）

- **人間の責務**: 仕様確定、コードレビュー、Merge判定、実機での子どもの反応確認（AI代理不可）
- PR作成の報告には「次は`/clear`してから」を添える（#123）

## 6. ロードマップ

P0〜P5のロードマップは `docs/roadmap.md`。**P0を実機で試すまで、以降を作り込まない。**

## 7. 関連ドキュメント（docs/）

- `docs/ui-rules.md` — 子ども画面のUI変更時に読む
- `docs/gimmicks.md` — ギミック追加・変更時に読む
- `docs/learning-spec.md` — 教材実装・レッスン追加時に読む
- `docs/lesson-schema.md` — 教材・イベント追加時に読む
- `docs/authoring-rules.md` — レッスン文言を書く時に読む
- `docs/dashboard.md` — ダッシュボード変更時に読む
- `docs/design-sync.md` — 同期・ゲート変更時に読む
- `docs/caching.md` — SW・キャッシュ変更時に読む
- `docs/file-structure.md` — ファイルの新設・移動時に読む
- `docs/dev-rules.md` — コーディング規則・ラベル分類・コード再利用
- `docs/roadmap.md` — フェーズ計画を検討する時に読む
- `docs/testing-guidelines.md` — 検証時に読む
- `docs/testing-steam-kids.md` — スモークを変える時に読む
- `docs/principles-review.md` — 入口・難度・終わり方を変える時に読む
- `docs/foundation-review.md` — 根幹に関わる変更を検討する時に読む
- `docs/components.md` — 共通部品を使う・足す時に読む
- `docs/tools.md` — 盤面エディタ・analyze-board・verify:fast の使い方、盤面は開発者がエディタで作る方針

## 8. 未決事項

- ダッシュボードの認証方法（校内配布時の教師向け保護。話が出た時点で決める）
