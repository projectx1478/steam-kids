# SESSION.md

最終更新：2026-09-18（#20実装しPR #23作成。ユーザーの`wrangler deploy`待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

PR #23（#20 同期API実装）がユーザーの `wrangler deploy` 実行待ち。デプロイ後、
AIが完了条件のcurl確認（register→push→pull→issue→redeem）と
`docs/design-sync.md` へのエンドポイントURL反映を行いマージ可能にする

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- P0・P1完了（詳細はPR #4・#7・#11・#12本文参照）。P1でステップ数規則を4〜7へ緩和、
  漢字チェックは「漢字ゼロ」機械判定とする判断はIssue #3本文に記録済み
- 検証中に発見したstyle.cssのビルド差分をIssue #10として起票し実装・PR #13 をmainへマージ済み。
  「バナーコメントを削除し再ビルド結果を正とする」方針。以後 `npx tailwindcss@3.4.17 ...
  --minify` 実行後 `git diff style.css` が空になることを確認
- **P2完了**（2026-09-18）。Issue #3 から#14（イベント永続化・学習者プロファイル、PR #17）／
  #15（集計と詰まりアラート判定の純粋関数`summarize()`、PR #18）／#16（ダッシュボード画面
  `/dashboard.html`、PR #19）に分割して実装し、すべてmainへマージ済み。`/dashboard.html`で
  詰まりアラート該当ステップが理由付きで強調表示され、PROJECT.md 6章のP2完了条件を満たす。
  確定した仕様判断（上限5000件で古い順に破棄、導線はURL直打ちのみ、呼び名入力はダッシュボード側、
  アラート判定の細部）と実装中の副産物2件（Tailwindのcontentスキャンが`hidden`等の識別子を
  拾う件、モバイル幅での横スクロール修正）はIssue #3のコメントに記録済み

# 引き継ぎ事項

## 次にやること

PR #23 で `workers/steam-kids-sync/` の `wrangler deploy` をユーザーに実行してもらう。
D1（`steam-kids-sync`, database_id: `6efb84b6-8aff-42cf-b4c5-07c8a1a978b7`）は作成・
スキーマ適用済み。デプロイ後のURLをもらったら、AIが#20の完了条件（curl 9項目）を確認し、
`docs/design-sync.md` の「エンドポイントURL」記載とPR #23を更新してマージ依頼する。

その後 #21→#22 の順で実装する（依存があるため並行しない）。設計はOpusセッションで確定済み、
**実装はSonnetで行う**。Issue本文に完了条件が数値で書いてあるため、新規セッションは
SESSION.mdと該当Issueのみ読めばよい。

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

## 未着手Issue

- #3 P1〜P5 と未決事項のトラッキング（P2まで完了。未決事項1＝同期バックエンドは決定済み）
- #20 P3-1 サーバー（実装済み・PR #23。`wrangler deploy`待ち）
- #21 P3-2 クライアント同期層（オプトイン・push/pull・マージ）
- #22 P3-3 リンクコードUIと履歴統合表示

# 未コミットの変更

なし

# 次回最初に行うこと

PR #23 の状態（`wrangler deploy` 実行済みか）を確認する。実行済みならcurlで完了条件を確認する。
