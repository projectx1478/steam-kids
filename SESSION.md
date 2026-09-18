# SESSION.md

最終更新：2026-09-18（Issue #15 マージ済み。Issue #16 実装完了、PR作成待ち。マージでP2完了）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

Issue #16 実装済み（ブランチ `claude/kind-carson-lwykz8`）。PR作成・マージでP2完了

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- P0・P1完了（詳細はPR #4・#7・#11・#12本文参照）。P1でステップ数規則を4〜7へ緩和、
  漢字チェックは「漢字ゼロ」機械判定とする判断はIssue #3本文に記録済み
- 検証中に発見したstyle.cssのビルド差分をIssue #10として起票し実装・PR #13 をmainへマージ済み。
  「バナーコメントを削除し再ビルド結果を正とする」方針。以後 `npx tailwindcss@3.4.17 ...
  --minify` 実行後 `git diff style.css` が空になることを確認
- Issue #3 からP2を#14（イベント永続化）／#15（集計と詰まりアラート判定）／#16（ダッシュボード
  画面）へ分割し起票。確定した仕様判断（上限5000件で古い順に破棄、導線はURL直打ちのみ、呼び名
  入力はダッシュボード側、アラート判定の細部）はIssue #3のコメントに記録済み
- Issue #14（イベントのlocalStorage永続化・学習者プロファイル・`abandon`発火）を実装。
  `js/storage.js` を新規作成。検証シナリオ`p2-events.mjs`を追加。PR #17 をmainへマージ済み
- Issue #15（学習ログの集計と詰まりアラート判定・純粋関数）を実装。`js/analytics.js`の
  `summarize(events, now)`を新規作成し、`docs/dashboard.md`へ判定条件を確定。検証シナリオ
  `p2-analytics.mjs`を追加。PR #18 をmainへマージ済み

# 引き継ぎ事項

## 次にやること

Issue #16 実装済み・未push。PR作成しマージされればP2完了（PROJECT.md 6章の完了条件
「詰まりアラートが表示される」を満たす）。マージ後にやること:

1. Issue #3 のPhase表を更新し、P2完了をコメントに記録する
2. P3（同期バックエンド決定・匿名認証・同期・リンクコード）着手をどう進めるか
   ユーザーに確認する。P3は`docs/design-sync.md`の未決事項（Firebase or GitHub Contents
   API+Cloudflare Workers）の決定が前提。設計判断を伴うためOpus想定

実装上の注意点（Tailwindのcontentスキャンはコード中の識別子も拾うため、ユーティリティ名と
一致する語（例: `hidden`）を書くと無関係なクラスが再ビルド時に生成されることがある。実害はない
が、再ビルド後の`style.css`差分が「意図した変更」か確認してからコミットする）は今後も踏まえる

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
- #16 P2 ダッシュボード画面（詰まりアラート表示）（実装済み・PR作成待ち）。マージでP2完了

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #16 実装のPRを作成する。マージ後はIssue #3 を更新してP2完了を記録し、
P3着手の進め方をユーザーに確認する。
