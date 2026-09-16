# SESSION.md

最終更新：2026-09-08（Issue #81対応完了・クローズ。project-templateにオープンIssueなし）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

なし（本セッションをアーカイブし、新規セッションで次タスクに着手）

# 完了したタスク（直近のみ・詳細はgit/PR履歴参照）

- Issue #81完了・クローズ。PR #86でPROJECT.md「3. 開発ルール」配下に他プロジェクトからのコード再利用の判定基準（4条件＋出典コメント必須化）を明文化。文字数9,298字（上限12,000字以内）
- Issue #80完了・クローズ。PR #82（project-template）で`run.mjs`に拡張フック（`config.mjs`、非配布）を追加、PR #181（assessment-app-web）で失われていたローカル改変（dist配信・build実行・route固定）を復元。実機で既存8シナリオ・76チェック全PASS確認済み

# 引き継ぎ事項

## 運用ルール

- 新規タスクは`origin/main`起点でブランチを切る。PRマージ後のブランチ再構築は`bash .claude/scripts/rebuild-branch.sh <branch>`を使う。PR状態確認・マージはMCPツール（gh CLI不在、API直叩きの書き込みはプロキシ403）
- push直前はMCPでPR状態を確認。`git push`出力が`[new branch]`になったらPRマージ済みのサイン
- SESSION.md単独変更はrefspec push（`<作業ブランチ>:main`）可。直後に同名リモートブランチもpushしてstop-hook誤検知を防ぐ。stop-hook自体はリポジトリ外で編集不可、誤検知時はリトライで回避
- 5リポジトリ（chinese-shadowing等）への配布結果はGitHub Actionsジョブ成否で間接確認。直接確認は当該リポジトリを対象にした別セッションで行う
- CLAUDE.md更新は`sync-template-broadcast.yml`で自動配布・自動マージ。配布対象は`.github/sync-files.txt`で管理。PROJECT.mdは配布対象外（手動コピー）
- リモートブランチ削除はAIから不可（プロキシ403・MCPに削除ツール無し）。ユーザーがGitHub Web UIで行う。リポジトリ作成も不可（Administration権限なし、ユーザー判断で付与見送り確定）
- 自動モード分類器の一時的ブロック（chmod・git add等）は再試行で解消する既知事象
- 孤立ブランチ`origin/feature/codespaces-opencode-web`が未削除で残っている（ユーザーがWeb UIで削除）
- `.claude/settings.json`の`permissions.deny`（git reset/clean・force push・rm -rf・PRマージ）は本セッション内で即時反映を実機確認済み。一時ファイル削除は`rm <file>`（`-rf`無し）を使う

## OpenCode（実機検証済みの知見）

- `opencode web`は既定`127.0.0.1`でCodespaces経由不可。`--hostname 0.0.0.0 --port 4096`が必要（`opencode`関数で省略可、既存Codespaceは再作成が必要）
- プロバイダー設定：標準環境変数名（例`DEEPINFRA_API_KEY`）で自動検出、`provider`ブロック不要。`/models`表示は認証成否を判定しない、実チャット1回送信で確認。空キーの`provider`ブロックが自動検出を上書きする事故に注意
- 設定はグローバル→プロジェクトの順にマージ（プロジェクト優先）。`opencode.json`に`model`を書くと各自のグローバル設定を上書きするため配布対象に含めない
- `agent.*.tools.{write,edit,patch}:false`は内部で`permission.edit:"deny"`へ変換される（`opencode debug config`/`opencode debug agent`で静的確認可）。設定検証はライブ操作前にこのコマンドで代理確認
- AGENTS.mdはV1/V2どちらでも機能する唯一のinstructions経路。Claude CodeはCLAUDE.mdのみ自動読込でAGENTS.mdへのフォールバック無し（2ファイル構成が正しい設計）
- Web UIのエージェント切り替えは入力欄左下のドロップダウン or `Ctrl/Cmd + .`。Tabキーでの切り替え（`agent.cycle`）はTUI専用。エージェントセレクタはカスタムエージェント定義（`opencode.json`の`agent.plan`等）がある場合のみ表示される
- 特定モデル名を設定ファイルにハードコードする設計は原則避ける（Issue #63で撤回済みの教訓）

## 未着手Issue

- project-templateにオープンIssueなし
- #56・#59・#75・#76・#80・#81はクローズ済み。#56・#59を再開する場合は各Issueのコメント欄に知見あり
- 他リポジトリ（chinese-shadowing#195等）のIssueは当該リポジトリのセッションで追跡する（本ファイルでは追跡しない）

## 環境固有の知見

- egress proxyで外部アクセス制限あり。opencode.ai等へのWebFetchはEGRESS_BLOCKED、WebSearchは利用可
- SESSION.md単独更新はラッパースクリプト化の検討余地あり（MCPツールで続行中）
- 他リポジトリの調査は`add_repo`でセッションスコープへ追加可能。1ファイルだけ見るならcloneせず`mcp__github__get_file_contents`が安い。書き込みが要る場合は`access:"push"`で追加
- 配布物のリポジトリ固有改変は`.claude/verify/config.mjs`等の非配布ファイルへ逃がす設計が定着（Issue #80）

# 未コミットの変更

なし

# 次回最初に行うこと

project-templateにオープンIssueなし。新規タスクの指示を待つ
