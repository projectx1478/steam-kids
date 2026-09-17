# SESSION.md

最終更新：2026-09-17（Issue #8 実装済み・PR作成待ち。次は #9 の実装をSonnetで）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

Issue #8 実装済み（ブランチ `claude/issue-8-lesson-json`）。PR作成待ち

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
- Issue #8 を実装。`js/lesson-cmd-01.js` を `lessons/cmd-01-susumu.json` へ移し、
  `js/lesson-loader.js` の `loadLesson()` で fetch する構成に変更。取得・パース失敗時は
  20字以内のフォールバック文言を表示。検証シナリオ `cmd01-lesson-json` を追加し、
  既存7本を含め全PASS（`run.mjs` / `--mobile`）を確認
- 実装中に「.claude/verify のハーネスは実HTTP 4xxとその際にChromiumが自動で出す
  console.errorを自動失敗条件にしており、実際に404を返すシナリオは書けない」ことを発見。
  Issue #8 の完了条件にあった「page.routeで404を模す」は「200応答＋不正bodyでパース失敗を
  模す」に読み替えて実装・検証した（同じcatch分岐を通るため代替として妥当と判断）。
  app.js側もconsole.errorは呼ばず、DOM表示のみで失敗を伝える設計にした
- style.css のビルド差分（バナーコメントがビルドで再現されない）を発見。Issue #8のスコープ外
  のためIssue #10として起票し、style.cssの変更は今回のコミットに含めていない

# 引き継ぎ事項

## 次にやること

PR作成→人がMerge確認後、Issue #9 を**Sonnetで**実装する（`lessons/*.json` が前提のため
#8マージ後に着手）。Issueに変更内容・検証ルール・完了条件まで記載済みのため追加の設計判断は不要。

#9 の検証スクリプトでも、実HTTP 4xxをverifyハーネスで模すとauto-fail条件に引っかかる制約は
関係しない（`tools/validate-lessons.mjs` はNode単体実行でブラウザを介さないため）。

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

- #3 P1〜P5 と未決事項のトラッキング（P1は詳細化済み。P2以降は着手時に分割する）
- #9 P1-2 レッスンJSONのスキーマ検証スクリプトを追加し、スキーマを確定する（#8マージ後に着手）
- #10 style.css のビルド差分（バナーコメントがビルドで再現されない）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #8 のPRがマージされているか確認する。マージ済みなら `origin/main` を取り込み、
Issue #9 の実装に着手する。
