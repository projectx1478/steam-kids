# SESSION.md

最終更新：2026-09-17（実機確認完了・不具合2件をIssue化しPR #7で修正、レビュー待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

なし（PR #7 作成済み。人によるレビュー・Merge待ち）

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- Issue #2（P0: grid-runtime でレッスン1「すすむ」）を実装。`js/engine-grid.js`（純粋関数
  `simulate`）・`js/ui-step.js`・`js/ui-grid.js`・`js/ui-commands.js`・`js/events.js`・
  `js/lesson-cmd-01.js` を新規作成。検証シナリオ7本（`cmd01-*.mjs`）を追加し
  `node .claude/verify/run.mjs` / `--mobile` ともにPASSを確認。PR #4 をmainへマージ済み
- 実機確認（Fireタブレット/iPad相当）で年長児がゴールまで到達できることを確認。ダブルタップズーム
  （Issue #5）・ゴール到達リアクション不足（Issue #6）の2件を発見しIssue化。修正しPR #7 作成済み

# 引き継ぎ事項

## 次にやること

PR #7（https://github.com/projectx1478/steam-kids/pull/7）のレビュー・Merge待ち。
Merge後、修正2点（ダブルタップズーム抑止・ゴール到達リアクション）を実機で再確認する。

**P0を実機で試すまでP1以降を作り込まない**（PROJECT.md「6. ロードマップ」）。
実機で子どもの反応が想定と違えば設計から見直す。

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
- `style.css` は Tailwind の生成物。直接編集禁止（`tailwind.src.css` を編集して再ビルド）
- 実行時に外部APIを呼ばない。CDNからのアセット取得も行わない（オフライン要件）
- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない

## 環境

- GitHub Pages は Settings → Pages で `main` / root を配信
- AIはリポジトリ作成・削除ができない（GitHub App に Administration 権限なし）。ユーザーがWeb UIで行う

## 未着手Issue

- #3 P1〜P5 と未決事項のトラッキング（P0の実機結果を見てから詳細化する）

# 未コミットの変更

なし

# 次回最初に行うこと

PR #7 の状態確認（マージ済みか、レビュー指摘への対応が必要か）。
マージ済みなら修正2点を実機で再確認し、問題なければIssue #3の詳細化に着手する。
