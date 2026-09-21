# SESSION.md

最終更新：2026-09-21（#30実装・PR #50作成。マージ待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**PR #50（Issue #30 教材生成フロー整備）マージ待ち。** 設計案を提示・承認を得て実装済み。
検証は本文参照。ユーザーによるマージ後、#31（レッスン3「なおす」追加）へ進む。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3、#22・#29・#37・#38・#45完了・Worker自動デプロイ導入まで完了済み
  （詳細はgit/PR履歴とIssue #3）
- **#48マージ・クローズ**（2026-09-21）。PR #49。`play.groupRepeats`で同方向連続タップを
  まとめる挙動を追加
- **#30実装・PR #50作成**（2026-09-21）。`.claude/skills/lesson-author/`・
  `app.js`の`?lesson=`・`validate-lessons.mjs`の否定語/groupRepeats到達可能性チェックを追加。
  検証実例として`lessons/cmd-02-mijikaku.json`（レッスン2「みじかくする」）を生成し無改変で
  検証通過。検証はPR #50本文参照

# 引き継ぎ事項

PR #50がマージ・クローズされたらIssue #30をクローズし、#31（レッスン3「なおす」追加）へ進む。
レッスン2「みじかくする」は#30の検証実例としてそのまま本採用済み（`lessons/cmd-02-mijikaku.json`）
なので、#31はレッスン3のみを`lesson-author`スキル経由で追加すればよい。

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

- #3 P1〜P5 と未決事項のトラッキング（P3完了済み。P4→#30・P5→#31を起票済み）
- #31 P5 レッスン3「なおす」の追加（レッスン2は#30で本採用済み）。`lesson-author`スキル経由
- #43 検証シナリオp3-link.mjsの実行環境依存クラッシュ（原因未特定。他シナリオへの影響は無い）

# 未コミットの変更

なし（PR #50はpush済み）

# 次回最初に行うこと

PR #50のマージ状況を確認する。マージ済みならIssue #30をクローズし、#31（レッスン3「なおす」）に
`lesson-author`スキルで着手する。未マージならレビュー状況を確認する。
