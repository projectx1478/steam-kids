---
description: readyのIssueを実装し、下書きPRまで作る（マージはしない）。nextで依存順に自動選択
argument-hint: <Issue番号> | next [件数（最大2）]
---

引数：$ARGUMENTS

1. `docs/agents/dev-flow.md`の「状態」「実装」「トークン節約」を読み、その手順で行う。規則の正本はその文書で、ここには書かない
2. 引数が番号ならそのIssueを実装する。`next`なら同文書「続けて進める」に従ってIssueを選ぶ（件数は最大2。3以上が指定されたら2にして、その旨を伝える）
3. 事前確認（`ready`あり・依存先クローズ済み・`agent:*`なし）が1つでも欠ければ、実装せず報告して止まる

Claude Codeでの対応：

- 実装ティアのモデルで実行する。設計済みなので計画の再提示は不要
- Issueに`check:separate`があれば`flow-checker`、`review:upper`があれば`flow-reviewer`のサブエージェントを、下書きPRの作成後に呼ぶ。ラベルが無ければ呼ばない
- PRを作ったら`subscribe_pr_activity`等でCIの結果を確認する（ポーリングしない）

打ち切り条件に当たったら、`needs-decision`を付けてIssueにコメントし、止まる。マージはしない。
