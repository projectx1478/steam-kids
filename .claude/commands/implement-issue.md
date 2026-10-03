---
description: 承認済みの設計に沿って、実装からPR作成・CI確認までを行う（マージはしない）
argument-hint: <Issue番号>
---

Issue #$ARGUMENTS を実装する。あなた（メインセッション）は調整役で、git・gh の操作と進行を担当する。コードの変更は `impl-coder`、照合は `impl-checker` に任せる。

## 規則
- 1 Issue = 1 PR = 1セッション。
- `git` は `--no-pager` を付ける。`git add` は**必ずパスを指定する**（`.` は使わない）。PowerShell で動く書き方にする。
- 触らないもの：`.claude/`、`PROJECT.md`、`CLAUDE.md`、`AGENTS.md`、凍結fixture（cmd-01・donguri-01）、`config.mjs`、`review/`。PROJECT.md の文言変更を伴う Issue（#254 など）は、差分を見せるところまでで、悠さんが承認する。
- E2E はローカルで実行しない（CIのみ）。
- マージはしない。マージ判定は悠さんの責務。
- 問題が起きたら、モデルを黙って切り替えたり、設計を変えたりせず、止まって報告する。

## 手順

### 0. 事前確認
1. `git --no-pager status`：作業ツリーに未コミットの変更がある場合は、内容を報告する。`review/` 以下と `docs/*-review.md` の未追跡は想定内。それ以外があれば止まる。
2. `git --no-pager fetch` のうえ、`main` が最新であることを確認する。
3. `review/design/<N>/approved.md` が存在し、先頭に `承認:` の行があること。無ければ止まって「`/design-issue <N>` が先」と報告する。
4. `gh issue view <N> --json number,title,body,labels` で本文を取得し、依存先がすべてクローズ済みであることを確認する。
5. `git --no-pager log -5 --oneline` でコミットメッセージの書き方を確認する。

### 1. ブランチ
`git switch -c feature/issue-<N>-<短い英語のslug>`（`main` から）。

### 2. 実装
`impl-coder` を呼び、`approved.md` と `issue.md` に従って変更させる。検証3種（`check:static`・`test:unit`・`validate:lessons`）の結果の報告を受ける。通らない場合、coder に直させるのは1回まで。それでも通らなければ止まる。

### 3. 照合
`impl-checker` を呼ぶ。`review/design/<N>/check.md` の先頭が「逸脱あり」なら、coder に1回だけ直させ、再度照合する。それでも逸脱が残れば止まって報告する。

### 4. コミットの準備
1. `git --no-pager status -uall` で、変更が設計どおりのファイルだけであること、`.claude/`・`review/`・画像・観察メモが含まれないことを確認する。
2. 変更ファイルを、1つずつパスを指定して `git add` する。
3. コミットする。メッセージは手順0-5で確認した書き方に合わせ、Issue番号を入れる。
4. `git log -1 --format="%an <%ae>"` を実行する。**noreply 形式（`...@users.noreply.github.com`）でなければ push せず、止まって報告する**。

### 5. push と PR
1. `git push -u origin <ブランチ>`。
2. `gh pr create` で PR を作る。本文は次のとおり。
   - `Closes #<N>`
   - 変更の要点
   - 検証結果（check:static・test:unit・validate:lessons、照合の結果）
   - 悠さんが確認すること（`summary.md` の「実機で確認すること」。操作感・音・子どもの反応）
   - 設計議論の要約（決定事項のみ。原文・観察メモ・保護者の記述は含めない）
3. `gh pr checks <PR番号>` でCIを確認する。実行中なら、完了まで数回確認する。

### 6. 報告して停止
PR のURL、CIの結果、悠さんが読むべき差分（`.claude/` 配下があれば必ず）、実機で確認すること、設計と違った点を報告して、停止する。
