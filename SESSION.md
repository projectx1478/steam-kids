# SESSION.md

最終更新：2026-09-18（PR #26マージ済み。P3完了。P4/P5は未着手・優先度要確認）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

なし。P3（同期バックエンド決定、匿名認証、同期、リンクコード）完了。
次のPhase（P4：教材生成フロー整備 / P5：レッスン2・3追加）は個別Issue未起票。
着手前にユーザーへ優先度を確認する。

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- P0〜P2完了（詳細はPR #4・#7・#11・#12・#13・#17・#18・#19、判断根拠はIssue #3参照）
- **P3完了**（2026-09-18）。#20（同期API：Cloudflare Workers + D1、デプロイ済み、PR #23・#24）
  →#21（クライアント同期層、PR #25）→#22（リンクコードUIと複数端末の履歴統合表示、PR #26）を実装。
  すべてmainへマージ済み。`/dashboard.html`でリンクコード入力後、別端末のイベントが
  同一レッスンカードへ統合表示される（P3完了条件を満たす）。Issue #3へ完了経緯・副産物を記録済み

# 引き継ぎ事項

**ユーザー確認待ち**：実機2台でのリンクコード入力しやすさ・統合表示されたダッシュボードの
読みやすさ（PR #26「ユーザー確認依頼」参照）。

次のPhase着手前にIssue #3でP4・P5どちらを優先するかユーザーに確認する。個別Issue起票は
着手時に行う（Issue #3方針どおり）。P4着手時は`docs/authoring-rules.md`、P5着手時は
`docs/learning-spec.md`を読む。

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

- #3 P1〜P5 と未決事項のトラッキング（P3完了済み。P4・P5は個別Issue未起票）

# 未コミットの変更

なし

# 次回最初に行うこと

ユーザーにP4・P5どちらを優先するか確認してから着手する。
