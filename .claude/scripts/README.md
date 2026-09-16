# .claude/scripts

Claudeが定型的なGit/GitHub操作を実行するためのラッパースクリプト置き場。
「毎回コマンドを組み立てさせず、決まった手順は呼び出すだけにする」ことで、
往復ターン数とトークン消費を削減する目的で作成する。

## スクリプト一覧

- `rebuild-branch.sh <branch>`: 指定ブランチをmain最新から再構築し、pushまで行う
  （PRマージ済み確認自体はMCPツールで別途行うこと）
- `broadcast-sync.sh <owner/repo>`: `.github/sync-files.txt`の同期対象ファイルを配布先リポジトリへコピーし、
  差分があればPR作成・自動マージまで行う（`DRY_RUN=1`でclone〜差分表示のみに留められる）。GitHub Actions
  （`sync-template-broadcast.yml`）から呼ばれるほか、単発の再同期・修復にも使う
- `new-repo-setup.sh <owner/repo> [target-dir]`: 新規リポジトリを`sync-targets.json`へ追加し、
  `target-dir`指定時は本リポジトリのPROJECT.md雛形をコピーする（既存ファイルは上書きしない）。
  実行後はCLAUDE.mdのGitHub運用ルールに従いAIが続けてブランチ作成→コミット→push→PR作成まで行う
  （スクリプト自体はファイル操作のみに留め、Git操作はAI側の定型フローとして毎回実行する）。
  新規リポジトリ自体の作成（`create_repository`はGitHub Appの権限不足により403で失敗するため
  GitHub Web UIで手動作成）・PROJECT.md内容の確定（要件定義そのものなのでユーザー確認必須）は対象外

## トークン設定

- `CLAUDE_MD_SYNC_TOKEN`はfine-grained PAT。Repository accessは「All repositories」に設定済み（確認日: 2026-08-22）。
  新規配布先リポジトリを`sync-targets.json`に追加する際、トークン側の追加設定は不要
