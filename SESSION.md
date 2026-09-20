# SESSION.md

最終更新：2026-09-20（#38マージ・クローズ。次は#29着手）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**Issue #38（Worker側の保護者トークン）はPR #41マージ・クローズ済み（2026-09-20）。**
`guardians`テーブル・`/guardian/set`・`/guardian/auth`・`/guardian/change`を追加し、
`/link/issue`へ`X-Guardian-Token`（HMAC短命トークン）を必須化。クライアント側
（js/guardian.js・js/sync.js・js/ui-gate.js）も追従。24シナリオ/計250チェックPASS。

**次は#29（X-Worker-Version）に着手する。** #38のWorker変更が未デプロイのため、
実装時は#38分も含めて1回の`wrangler deploy`にまとめられるよう設計する。

**デプロイ待ち（ユーザー担当）**: #38反映には`wrangler deploy`が必要（Workerを先にデプロイしないと
クライアントから`/guardian/auth`が404になる）。#29の実装後にまとめてデプロイを依頼する。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3完了（PR #4〜#26、#32、#34、#36）。完了経緯・副産物はIssue #3に集約済み
- **Issue起票**（2026-09-19）。#28／#29／#30／#31。Issue #3の表も更新済み
- **#22実機確認完了・クローズ**（2026-09-20）。途中発見の#33・#35もPR #34・#36で解消済み
- **#37マージ・クローズ**（2026-09-20）。PR #40。guardian.js/ui-gate.js新規、22シナリオ/188チェックPASS
- **#38マージ・クローズ**（2026-09-20）。PR #41。guardian-worker.mjs新規、24シナリオ/250チェックPASS。
  wrangler deploy未実施（#29とまとめる予定）

# 引き継ぎ事項

#29（同期Workerとクライアントの版数ズレ検知・X-Worker-Version）に着手する。実装後、#38分の
Worker変更（guardiansテーブル・/guardian/*）も含めて1回の`wrangler deploy`をユーザーに依頼する。
デプロイ後は#38の実機確認（リンクコード発行が従来どおり動くこと）も合わせて確認してもらう。
#31 は #30 完了後に着手する。

保護者ゲートは二層（閲覧解錠＝ローカルPBKDF2照合でオフライン可／サーバー側にHMAC短命
トークンを追加・実装済み）。ローカル層は devtools・localStorage 編集で迂回可能なことを許容済み。
パスコードのリセットボタンは作らない（迂回口になるため）。解錠状態はモジュールスコープ変数の
みで保持（sessionStorage等は使わない）。詳細は`docs/design-sync.md`「保護者ゲート」。

`GET /sync`の1000件上限（`ts`昇順）は未解消の既知の制約（Issue #35に記載）。現状の利用規模では
非現実的だが、必要になれば別Issue化する。

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
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
- #29 同期Workerとクライアントの版数ズレ検知（X-Worker-Version。#38分と同一デプロイ推奨）← 今ここ
- #30 P4 Claude Codeによる教材生成フロー整備（スキル化）
- #31 P5 レッスン2・3の追加（#30完了後）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #29の本文を読み、実装方針を提示して承認を得てから着手する。
