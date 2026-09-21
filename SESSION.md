# SESSION.md

最終更新：2026-09-21（#31実装・PR #51作成。マージ待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**PR #51（Issue #31 レッスン3「なおす」・選択画面）マージ待ち。** 設計案を提示・承認を得て
実装済み。検証は本文参照。ユーザーによるマージ後、Issue #3（P1〜P5トラッキング）の更新へ。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3、#22・#29・#37・#38・#45完了・Worker自動デプロイ導入まで完了済み
  （詳細はgit/PR履歴とIssue #3）
- **#48マージ・クローズ**（2026-09-21）。PR #49。`play.groupRepeats`
- **#30マージ・クローズ**（2026-09-21）。PR #50。`lesson-author`スキル・レッスン2
- **#31実装・PR #51作成**（2026-09-21）。`play.initialCommands`・レッスン3「なおす」・
  レッスン選択画面（`lessons/index.json`）を追加。検証はPR #51本文参照

# 引き継ぎ事項

PR #51がマージ・クローズされたらIssue #31をクローズする。単元「めいれいでうごかす」の
レッスン1〜3が揃い、P0〜P5がすべて完了する見込み。Issue #3（P1〜P5トラッキング表）の
更新を確認する。

保護者ゲートは二層（閲覧解錠＝ローカルPBKDF2照合でオフライン可／サーバー側にHMAC短命
トークンを追加・実装済み）。ローカル層は devtools・localStorage 編集で迂回可能なことを許容済み。
パスコードのリセットボタンは作らない（迂回口になるため）。解錠状態はモジュールスコープ変数の
みで保持（sessionStorage等は使わない）。詳細は`docs/design-sync.md`「保護者ゲート」。

`GET /sync`の1000件上限（`ts`昇順）は未解消の既知の制約（Issue #35に記載）。現状の利用規模では
非現実的だが、必要になれば別Issue化する。

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く。`.claude/skills/`は配布対象外なので
  本リポジトリに直置きしてよい（`.github/sync-files.txt`確認済み）
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
  （`.github/workflows/deploy-worker.yml`はプロジェクト固有のデプロイCIで対象外。#44参照）
- `style.css` は Tailwind の生成物。直接編集禁止（`tailwind.src.css` を編集して再ビルド）
- 実行時に外部APIを呼ばない。CDNからのアセット取得も行わない（オフライン要件）
- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない
- Tailwindのcontentスキャンはコード中の識別子も拾う。ユーティリティ名と一致する語（例:
  `hidden`）を書くと無関係なクラスが再ビルド時に生成される。実害はないが、再ビルド後の
  `style.css`差分が「意図した変更」か確認してからコミットする
- `lessons/index.json`はレッスン選択画面の一覧ファイル（レッスン本体ではない）。
  `validate-lessons.mjs`はファイル名で除外している。レッスン追加時はレッスンJSON本体＋
  この1行を更新する

## 環境

- GitHub Pages は Settings → Pages で `main` / root を配信
- AIはリポジトリ作成・削除ができない（GitHub App に Administration 権限なし）。ユーザーがWeb UIで行う
- AIのサンドボックスからは `*.workers.dev` 等の任意外部ドメインへcurl等で直接到達できない
  （プロキシがpolicy denialで403を返す）。D1へはCloudflare MCP経由でアクセス可能。
  デプロイ済みWorkerへのAPI疎通確認が必要な場合はCodespaces等ユーザー側の実ネットワーク環境で
  実行してもらい、出力を貼ってもらう
- Cloudflareの `account_id` は `e869e1d895a7144f62de9105d5374a4a`
  （`workers/steam-kids-sync/wrangler.toml` に記載済み）

## 未着手Issue

- #3 P1〜P5 と未決事項のトラッキング。#31マージで表の更新が必要
- #43 検証シナリオp3-link.mjsの実行環境依存クラッシュ（原因未特定。他シナリオへの影響は無い）

# 未コミットの変更

なし（PR #51はpush済み）

# 次回最初に行うこと

PR #51のマージ状況を確認する。マージ済みならIssue #31をクローズし、Issue #3の
P1〜P5トラッキング表を更新する。未マージならレビュー状況を確認する。
