# SESSION.md

最終更新：2026-09-17（Issue #8 マージ済み。Issue #9 実装済み・PR作成待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

Issue #9 実装済み（ブランチ `claude/issue-9-validate-lessons`）。PR作成待ち

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- Issue #2（P0: grid-runtime でレッスン1「すすむ」）を実装。`js/engine-grid.js`（純粋関数
  `simulate`）・`js/ui-step.js`・`js/ui-grid.js`・`js/ui-commands.js`・`js/events.js`・
  `js/lesson-cmd-01.js` を新規作成。検証シナリオ7本（`cmd01-*.mjs`）を追加し
  `node .claude/verify/run.mjs` / `--mobile` ともにPASSを確認。PR #4 をmainへマージ済み
- 実機確認（Fireタブレット/iPad相当）で年長児がゴールまで到達できることを確認。ダブルタップズーム
  （Issue #5）・ゴール到達リアクション不足（Issue #6）の2件を発見しIssue化。修正しPR #7 をmainへ
  マージ済み。修正2点をユーザーが実機で再確認し問題なしと確認。P0完了
- Issue #3 からP1を2本に分割して起票（#8 レッスンJSON外出し／#9 スキーマ検証スクリプト）。
  ステップ数規則を4〜7へ緩める判断と、漢字チェックを「漢字ゼロ」機械判定とする判断を
  Issue #3 本文に記録済み
- Issue #8 を実装しPR #11 をmainへマージ済み。`lessons/cmd-01-susumu.json` + `js/lesson-loader.js`
  の fetch 構成に変更。実装判断・検証結果の詳細はPR #11本文に記録
  （`.claude/verify` ハーネスは実HTTP 4xx・console.errorを無条件で自動失敗にするため、
  404テストは「200応答＋不正bodyでパース失敗」で代替）
- 検証中に style.css のビルド差分（バナーコメントがビルドで再現されない）を発見。
  Issue #8のスコープ外のためIssue #10として起票（未着手）
- Issue #9 を実装。`tools/validate-lessons.mjs` で `lessons/*.json` を15ルール検証（必須キー・
  ステップ数4〜7・文字数20字・漢字ゼロ・到達可能性BFS等）。到達可能性・予想整合の判定は
  `js/engine-grid.js` の `simulate` を再利用。15ルール全てを単独違反させて検出を確認済み
  （手順はスクラッチに記録、コミットには含めない）。`docs/lesson-schema.md`・`PROJECT.md` を
  実装に合わせて更新。`package.json` に `type: module` を追加（Node警告解消）

# 引き継ぎ事項

## 次にやること

Issue #9 のPRを作成し、人のMergeを待つ。P1（#8・#9）完了後は Issue #3 のP2詳細化に進む
（着手前にユーザーへ担当モデル確認。CLAUDE.md「モデル選択ルール」で設計・Issue起票はOpus想定）。

Issue #10（style.cssビルド差分）は未着手。設計判断のためOpus想定だが影響軽微。

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

- #3 P1〜P5 と未決事項のトラッキング（P1は完了見込み。P2以降は着手時に分割する）
- #10 style.css のビルド差分（バナーコメントがビルドで再現されない）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #9 のPR（ブランチ `claude/issue-9-validate-lessons`）を作成する。
