# Kimi Code CLI 固有ガイド

共通ルールはAGENTS.md参照。ここではKimi Code CLI固有の起動・指示ファイル・権限設定のみを記載する（未検証の項目は明記する）。

## 指示ファイルの読込順

Kimi Code CLIは起動時に以下の順でAGENTS.mdを探す（公式ドキュメント確認済み。複数ファイルが存在する場合のマージ規則は公式ドキュメントに明記が無い）。

1. `$KIMI_CODE_HOME/AGENTS.md`（既定 `~/.kimi-code/AGENTS.md`。Kimi固有のグローバル指示）
2. `~/.agents/AGENTS.md`（ツール横断の共通指示、実ホームディレクトリ配下）
3. プロジェクト直下の`AGENTS.md`（本リポジトリの正本）

プロジェクト固有の指示は本リポジトリのAGENTS.md（プロジェクト直下）に集約し、グローバル側（1・2）には環境固有の設定のみ置くこと。

## 権限設定（`~/.kimi-code/config.toml`）

Kimi Code CLIの権限ルールは`[[permission.rules]]`の配列で、`decision`（`allow`/`deny`/`ask`）と`pattern`（例: `Bash(git reset*)`）を持つ。**記載順で最初にマッチしたルールが適用される**（OpenCodeの「最後にマッチしたルールが勝つ」とは逆順なので注意）。AGENTS.md・`.claude/settings.json`・`opencode.json`のdeny方針と揃える例：

```toml
[[permission.rules]]
decision = "deny"
pattern = "Bash(git reset*)"

[[permission.rules]]
decision = "deny"
pattern = "Bash(git clean*)"

[[permission.rules]]
decision = "deny"
pattern = "Bash(git push --force*)"

[[permission.rules]]
decision = "deny"
pattern = "Bash(git push -f*)"

[[permission.rules]]
decision = "deny"
pattern = "Bash(rm -rf*)"

[[permission.rules]]
decision = "deny"
pattern = "Bash(gh pr merge*)"

[[permission.rules]]
decision = "ask"
pattern = "Bash(git push*main*)"
```

deny/askルールは必ずワイルドカードの`allow`ルール（例: `Bash`単体のルール）より前に置くこと。先勝ちのため、後ろに置くと素通りする。

## プロジェクト単位の権限設定（未検証）

`scope = "project"`を指定すると`<project-root>/.kimi-code/local.toml`にプロジェクト単位の権限設定を書ける可能性があるが、本リポジトリでは未検証（Issue #90の検証計画でユーザー担当）。検証できるまでは上記のグローバル設定（`~/.kimi-code/config.toml`）を使うこと。

## モデル指定

モデル名は各自のグローバル設定に置き、プロジェクトへハードコードしない（他ツールと同じ方針。特定モデル名を設定ファイルへ書く設計はIssue #63で撤回済み）。
