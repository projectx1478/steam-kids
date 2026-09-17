# SESSION.md

最終更新：2026-09-17（Issue #10 実装済み・PR作成待ち。次はP2の個別Issue起票）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

Issue #10 実装済み（ブランチ `claude/issue-10-style-css-drift`）。PR作成待ち

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- Issue #2（P0: grid-runtime でレッスン1「すすむ」）を実装。`js/engine-grid.js`（純粋関数
  `simulate`）・`js/ui-step.js`・`js/ui-grid.js`・`js/ui-commands.js`・`js/events.js`・
  `js/lesson-cmd-01.js` を新規作成。検証シナリオ7本（`cmd01-*.mjs`）を追加し
  `node .claude/verify/run.mjs` / `--mobile` ともにPASSを確認。PR #4 をmainへマージ済み
- 実機確認（Fireタブレット/iPad相当）で年長児がゴールまで到達できることを確認。ダブルタップズーム
  （Issue #5）・ゴール到達リアクション不足（Issue #6）の2件を発見しIssue化。修正しPR #7 をmainへ
  マージ済み。修正2点をユーザーが実機で再確認し問題なしと確認。P0完了
- P1完了。Issue #3 から#8（レッスンJSON外出し）・#9（スキーマ検証スクリプト`tools/validate-lessons.mjs`）
  に分割して実装し、PR #11・#12 をmainへマージ済み。ステップ数規則を4〜7へ緩和、漢字チェックは
  「漢字ゼロ」機械判定とする判断はIssue #3本文に、実装詳細はPR #11・#12本文に記録済み
- 検証中に発見した2件をIssue化: `.claude/verify`ハーネスは実HTTP 4xx・console.errorを無条件で
  自動失敗にする制約（#8で対処済み）と style.cssのビルド差分（#10）
- Issue #10 を実装。ユーザー判断で「バナーコメントを削除し再ビルド結果を正とする」方針に決定。
  style.cssを再ビルドしてコミット。以後 `npx tailwindcss@3.4.17 ... --minify` を実行しても
  `git diff style.css` が空になることを確認

# 引き継ぎ事項

## 次にやること

Issue #10 のPRを作成し、人のMergeを待つ。マージ後はIssue #3 からP2（イベントログ+localStorage+
ダッシュボード）の個別Issue起票に進む（設計判断を伴うためOpus想定。着手前にユーザーへ確認）。

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

- #3 P1〜P5 と未決事項のトラッキング（P1完了。P2以降は着手時に分割する）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #10 のPR（ブランチ `claude/issue-10-style-css-drift`）を作成する。
