# SESSION.md

最終更新：2026-09-21（#29マージ・クローズ。デプロイ自動化PR #44作成）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**Worker自動デプロイworkflow（`.github/workflows/deploy-worker.yml`）はPR #44作成済み・マージ待ち
（2026-09-21）。** ユーザー依頼により追加。`workers/steam-kids-sync/`配下の変更がmainへマージ
されると`wrangler deploy`を自動実行する。認証は`CLOUDFLARE_API_TOKEN`（GitHub Actions
repository secret）。

**ユーザー設定待ち（マージだけでは動かない）**:
1. Cloudflareで`Workers Scripts:Edit`権限のみのAPIトークンを発行
2. リポジトリSecretsに`CLOUDFLARE_API_TOKEN`として登録

**デプロイ待ち**: #38（保護者トークン）・#29（版数ヘッダ）ともWorker側が未デプロイのまま。
上記シークレット設定後、PR #44マージ or Actionsタブの`workflow_dispatch`手動実行で
両方まとめてデプロイされる。デプロイ後は#38の実機確認（リンクコード発行）と#29の実機確認
（バナー表示/非表示）を合わせて依頼する。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3完了（PR #4〜#26、#32、#34、#36）。完了経緯・副産物はIssue #3に集約済み
- **Issue起票**（2026-09-19）。#28／#29／#30／#31。Issue #3の表も更新済み
- **#22実機確認完了・クローズ**（2026-09-20）。途中発見の#33・#35もPR #34・#36で解消済み
- **#37マージ・クローズ**（2026-09-20）。PR #40。保護者ゲート・ローカル層
- **#38マージ・クローズ**（2026-09-20）。PR #41。保護者ゲート・サーバー層
- **#29マージ・クローズ**（2026-09-20）。PR #42。X-Worker-Version

# 引き継ぎ事項

PR #44（Worker自動デプロイworkflow）のマージ待ち。マージ・シークレット設定後、#38・#29分の
Worker変更をまとめてデプロイし、#38の実機確認（リンクコード発行）と#29の実機確認
（バナー表示/非表示）を依頼する。#31 は #30 完了後に着手する。

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
- #30 P4 Claude Codeによる教材生成フロー整備（スキル化）
- #31 P5 レッスン2・3の追加（#30完了後）
- #43 検証シナリオp3-link.mjsの実行環境依存クラッシュ（原因未特定。他シナリオへの影響は無い）

# 未コミットの変更

なし

# 次回最初に行うこと

PR #44のマージ状況を確認する。マージ済みならCLOUDFLARE_API_TOKEN設定済みか確認し、
未設定ならユーザーに依頼する。設定済みなら`workflow_dispatch`でのデプロイ実行と
#38・#29の実機確認を依頼する。
