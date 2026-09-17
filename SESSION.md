# SESSION.md

最終更新：2026-09-17（Issue #14 マージ済み。Issue #15 実装完了、PR作成待ち）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

Issue #15 実装済み（ブランチ `claude/kind-carson-lwykz8`）。PR作成・マージ後に #16 へ進む

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
- 検証中に発見したstyle.cssのビルド差分をIssue #10として起票し実装・PR #13 をmainへマージ済み。
  ユーザー判断で「バナーコメントを削除し再ビルド結果を正とする」方針に決定。以後
  `npx tailwindcss@3.4.17 ... --minify` 実行後 `git diff style.css` が空になることを確認
- Issue #3 からP2を#14（イベント永続化・学習者プロファイル・`abandon`発火）／#15（集計と詰まり
  アラート判定の純粋関数）／#16（ダッシュボード画面）へ分割し起票。確定した仕様判断（上限5000件で
  古い順に破棄、導線はURL直打ちのみ、呼び名入力はダッシュボード側、アラート判定の細部）はIssue #3
  のコメントに記録済み
- Issue #14（イベントのlocalStorage永続化・学習者プロファイル・`abandon`発火）を実装。
  `js/storage.js` を新規作成し `js/events.js`・`js/state.js`・`js/ui-step.js` を接続。
  検証シナリオ`p2-events.mjs`（9件）を追加しPASSを確認。PR #17 をmainへマージ済み

# 引き継ぎ事項

## 次にやること

Issue #15 実装済み・未push。PR作成しマージされ次第、#16（ダッシュボード画面）に着手する。
#16 は `js/analytics.js` の `summarize()` の返り値を描画するだけにする。実装はSonnetで行う
（CLAUDE.md「モデル選択ルール」）。

PR #17 で見つかった実装上の注意点（#16着手時にも踏まえる）:

- Tailwindのcontentスキャン（`./index.html` `./app.js` `./js/**/*.js`）はコード中の
  単語も拾うため、Tailwindのユーティリティ名と一致する識別子（例: `hidden`）を書くと
  無関係なクラスが再ビルド時に新規生成されることがある。実害はない（未使用CSSが増える
  だけ）が、再ビルド後の`style.css`差分は「意図した変更」であることを確認してからコミットする

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

- #3 P1〜P5 と未決事項のトラッキング（P2まで分割済み。P3以降は着手時に分割する）
- #15 P2 学習ログの集計と詰まりアラート判定（純粋関数）（実装済み・PR作成待ち）
- #16 P2 ダッシュボード画面（詰まりアラート表示）。完了でP2完了。次に着手

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #15 実装のPRを作成する。マージ後は #16 の実装に着手する
（読むのは本ファイルと #16 のみ）。
