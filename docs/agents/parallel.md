# 並行作業の細則

AGENTS.md「並行作業の衝突回避」の細則。複数エージェントを同時に動かす・作業ツリーを分離するときに読む。

- ブランチ接頭辞はツール別：`claude/*`・`kimi/*`・`opencode/*`（例外：エディタの「公開」ボタンが人の押下で作る `editor/publish-YYYYMMDDHHMMSS`。agent担当ブランチではなく、rebuild-branch 等の対象外）
- 同一PCで同時稼働する場合は`git worktree add ../<repo>-<tool> -b <tool>/xxx origin/main`で作業ツリーを分離する（同じディレクトリで2エージェントを動かさない）
- 進行中タスクの正本は`agent:<tool>`ラベル付きのオープンIssue、完了タスクの正本はPR履歴とし、SESSION.mdには書かない。タスク単位の引継ぎはIssueコメントに書く
