# 並行作業の運用（着手宣言・重複確認）

PROJECT.md「並行作業と版数」の詳細。`node tools/parallel-check.mjs`の仕様と運用。

## ロックの階層
- Issueラベル`agent:<tool>`＝ツール単位のロック（正本。AGENTS.md「並行作業の衝突回避」）。
- Issueコメントの`着手:`／`解除:`＝同じツールの中の、環境（local・cloud・メンバー名）とブランチの単位の補助。

## 書式（コメントの行頭一致）
- 着手：`着手: env=<local|cloud|メンバー名> branch=<ブランチ名>`
- 解除：`解除: env=<…> branch=<…> <理由>`（未完了で離れるとき。WIP pushと同時）
- 手元とクラウドは同じアカウントで投稿するため、投稿者ではなくenvとbranchの両方で照合する。

## 手順
1. 着手時：`node tools/parallel-check.mjs <N> --claim env=<…> branch=<…>`。終了コード2＝他の環境が着手中。止まって報告。
2. PR作成前：`node tools/parallel-check.mjs <N>`。3＝オープンPRと変更ファイルが重なる。行が離れた追記なら理由を報告に書いて続行してよい。
3. CIの`parallel-warn`も重なりを警告する（失敗にしない）。

## 承認済み設計
承認済みの設計はIssueの別コメント（先頭行`承認済み設計`）に載せる。複数あるときは最新のコメントが正本。議論の原文は貼らない。
