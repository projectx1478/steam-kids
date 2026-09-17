# SESSION.md

最終更新：2026-09-17（リポジトリ立ち上げ。P0未着手）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

なし（設計ドキュメント一式を配置済み。次はIssue #1のP0実装）

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- リポジトリ立ち上げ。project-templateから「Use this template」で生成し、PROJECT.md・README.md・
  SESSION.md・docs/5ファイルを確定。broadcast配布元専用ファイル（`.github/sync-files.txt`、
  `.github/sync-targets.json`、`.github/workflows/sync-template-broadcast.yml`）を削除

# 引き継ぎ事項

## 次にやること

Issue #1（P0: grid-runtime でレッスン1「すすむ」を動かす）をSonnetの新規セッションで実装する。
レッスン1の確定値・受け入れ条件はIssue本文と `docs/learning-spec.md` に記載済み。
着手前に PROJECT.md →  `docs/learning-spec.md` → Issue #1 の順に読む。

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

- #1 P0: grid-runtime でレッスン1「すすむ」を動かす
- #2 P1〜P5 と未決事項のトラッキング（P0の実機結果を見てから詳細化する）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #1 のP0実装。`origin/main` 起点でブランチを切る
