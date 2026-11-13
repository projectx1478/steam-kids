---
description: Issueを設計の型で書き直し、承認待ちにする（コードは変更しない）
argument-hint: <Issue番号>
---

Issue #$ARGUMENTS を設計する。

1. `docs/agents/dev-flow.md`の「状態」「設計」を読み、その手順で行う。規則の正本はその文書で、ここには書かない
2. 見出しは`.github/ISSUE_TEMPLATE/design.md`に従う
3. Issueに`variants`ラベルがあるときだけ、同文書「オプション」の3案比較を行う

Claude Codeでの対応：

- 上位ティアのモデルで、plan modeで行う。コードは変更しない
- 判断が必要な点はAskUserQuestionで聞く（推奨を先頭に置く）
- Issue本文の書き換えはGitHub MCPで行う

本文を更新し、`needs-decision`または承認依頼の状態にしたら止まる。実装は別セッションの`/implement $ARGUMENTS`で行う。
