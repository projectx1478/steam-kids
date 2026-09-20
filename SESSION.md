# SESSION.md

最終更新：2026-09-20（PR #34マージ済・Issue #33クローズ済。ユーザーのwrangler deployと実機確認待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**Issue #33（リンクコード引き換えのsecret_conflict失敗）はPR #34としてマージ済み・Issueもクローズ済み。
反映にはユーザーの`wrangler deploy`が必要で、まだ実行されていない。**

PR #32の実機確認③の修正。要点：`handleLinkRedeem`のコード消費UPDATEを検証より前に分離（失敗時の
消費を防止）、`secret_conflict`を廃止し発行元へdevices付け替え（他端末が残る旧IDのイベントは移管
しない）、クライアント側で乗り換え後に`lastPushedTs`/`lastPulledTs`を0リセットし`S.learnerId`も更新。
検証コマンド全実行・20シナリオ161チェック全PASS確認済み（詳細はPR #34本文）。

④（リンクコード入力しやすさ・ダッシュボード読みやすさ）は③が直らないと評価不能のため未確認のまま。

次：ユーザーが`wrangler deploy` → 実機でIssue #22の③④再確認 →
問題なければIssue #22をクローズして #29 → #30 → #31 の順。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3完了（PR #4〜#26）。完了経緯・副産物はIssue #3に集約済み
- **#22フォローアップ**（2026-09-18）。同期不備4点を修正、全17シナリオ121チェックPASS。PR #27マージ済
- **Issue起票**（2026-09-19）。#28／#29／#30／#31。Issue #3の表も更新済み
- **#28実装・マージ済**（2026-09-19）。PR #32。全19シナリオ134チェックPASS（既存17/121含む）
- **#33実装・マージ済**（2026-09-20）。PR #34。全20シナリオ161チェックPASS（既存19/134含む）

# 引き継ぎ事項

PR #34マージ済・Issue #33クローズ済。残りは：
1. ユーザーが`wrangler deploy`でWorkerへ反映
2. 実機2台でIssue #22の③④を再確認依頼
3. 問題なければIssue #22をクローズし #29 → #30 → #31 の順へ

#29 は反映にユーザーの手動`wrangler deploy`が必要。#31 は #30 完了後に着手する。
各Issue本文に実装内容・判定可能な数値条件・検証計画が揃っている。

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
- #22 リンクコードUIと複数端末の履歴統合表示（deploy後の③④実機確認待ち）← 今ここ
- #29 同期Workerとクライアントの版数ズレ検知（X-Worker-Version）← Issue #22クローズ後、次に着手
- #30 P4 Claude Codeによる教材生成フロー整備（スキル化）
- #31 P5 レッスン2・3の追加（#30完了後）

# 未コミットの変更

なし

# 次回最初に行うこと

ユーザーへ`wrangler deploy`の実行状況を確認し、完了していれば実機確認（Issue #22の③④）を依頼する。
