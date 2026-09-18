# SESSION.md

最終更新：2026-09-18（PR #23マージ済み。フォローアップPR #24がマージ待ち。アーカイブ準備）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**PR #24 がマージ待ち。** PR #23（#20本体）はデプロイ前にマージ済みだったため、その後の
3コミット（`wrangler.toml`の`account_id`修正、デプロイ済みエンドポイントURLの
`docs/design-sync.md`反映、確認用一時スクリプトの追加・削除）が未反映のまま残っていた。
これをPR #24として起票済み。**マージするまで#21に着手しない**
（mainの`docs/design-sync.md`・`wrangler.toml`がまだ実際のデプロイ内容と食い違っているため）

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- P0〜P2完了（詳細はPR #4・#7・#11・#12・#13・#17・#18・#19、判断根拠はIssue #3参照）
- **#20完了**（2026-09-18）。同期API（Cloudflare Workers + D1）を実装しデプロイ済み。
  エンドポイント `https://steam-kids-sync.projectx1478.workers.dev`。完了条件のcurl 9項目
  すべて確認、テストデータはD1から削除済み。実装はPR #23（マージ済み）、デプロイ後の
  反映漏れ（account_id・エンドポイントURL）はPR #24（マージ待ち）

# 引き継ぎ事項

**まずPR #24をマージする**（`git diff --name-only origin/main...HEAD` は
`SESSION.md`単独ではないため通常のPRレビュー・マージが必要）。

マージ確認後、mainを取り込んでから #21（P3-2 クライアント同期層）を実装する。#21→#22 の順で
依存があるため並行しない。設計はOpusセッションで確定済み、**実装はSonnetで行う**。
Issue本文に完了条件が数値で書いてあるため、新規セッションはSESSION.mdと該当Issueのみ読めばよい。

`js/config.js` の `SYNC_ENDPOINT` には `https://steam-kids-sync.projectx1478.workers.dev`
を設定する（#21）。

**教訓**：PRが実装のマージ直後（デプロイ・検証の完了前）にマージされたため、後続の修正が
別PRに分かれた。今後、外部リソースのデプロイが絡むPRは「デプロイ・検証まで完了してから
マージする」旨をPR本文で明示する。

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

- #3 P1〜P5 と未決事項のトラッキング（P2まで完了。未決事項1＝同期バックエンドは決定済み）
- #21 P3-2 クライアント同期層（オプトイン・push/pull・マージ）
- #22 P3-3 リンクコードUIと履歴統合表示

# 未コミットの変更

なし

# 次回最初に行うこと

PR #24 がマージされたか確認する。マージ済みならmainを取り込み #21 に着手する。
