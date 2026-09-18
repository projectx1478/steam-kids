# SESSION.md

最終更新：2026-09-18（#22実装完了、PR #26がマージ待ち。P3完了条件を満たす最後のPR）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**PR #26 がマージ待ち。** #22（P3-3 リンクコードUIと複数端末の履歴統合表示）を実装済み。
マージされればP3（同期バックエンド決定、匿名認証、同期、リンクコード）が完了する。

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- P0〜P2完了（詳細はPR #4・#7・#11・#12・#13・#17・#18・#19、判断根拠はIssue #3参照）
- **#20完了**（2026-09-18）。同期API（Cloudflare Workers + D1）を実装しデプロイ済み。
  エンドポイント `https://steam-kids-sync.projectx1478.workers.dev`。実装はPR #23、
  デプロイ後の反映漏れはPR #24（いずれもマージ済み）
- **#21完了**（2026-09-18）。クライアント同期層（`js/config.js`・`js/merge.js`・`js/sync.js`）。
  実装はPR #25（マージ済み）
- **#22実装完了**（2026-09-18）。`js/ui-sync.js`新規、`dashboard.html`に同期セクション追加。
  検証シナリオ`p3-link`（別ブラウザコンテキストを別端末に見立てた統合表示確認）を追加し、
  既存含め全17シナリオ114チェックが通常表示・`--mobile`双方でPASS。実装はPR #26（マージ待ち）

# 引き継ぎ事項

**まずPR #26をマージする**（`git diff --name-only origin/main...HEAD` は
`SESSION.md`単独ではないため通常のPRレビュー・マージが必要）。

マージ後はP3完了。次はIssue #3のP4・P5着手を検討する（Issue #3本文で優先度を確認してから着手）。
実機2台でのリンクコード入力しやすさ・ダッシュボードの読みやすさはユーザー確認が必要
（PR #26の「ユーザー確認依頼」参照）。

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

- #3 P1〜P5 と未決事項のトラッキング（PR #26マージでP3完了見込み。未決事項1＝同期バックエンドは決定済み）

# 未コミットの変更

なし

# 次回最初に行うこと

PR #26 がマージされたか確認する。マージ済みならmainを取り込み、P3完了をPROJECT.mdの
ロードマップ表に反映してからIssue #3でP4・P5の優先度を確認する。
