---
description: 小さいIssue（文書・文言・小さなUI・JSONのみ）を、サブエージェントなしで実装してPR作成まで行う（マージはしない）
argument-hint: <Issue番号>
---

Issue #$ARGUMENTS を、軽い経路で実装する。サブエージェントは呼ばず、メインセッションが直接変更する。Sonnet で動かす想定（悠さんが `/model` で選ぶ）。

## この経路を使ってよいIssue
次の**すべて**に当てはまるときだけ使う。1つでも外れれば、実装せず、止まって「`/design-issue` が先」と報告する。
- 触るファイルが少ない（目安：3つ以内。生成物の `style.css` を除く）。
- ギミックの規則、BFS、最短手数の規則（#104）、`validate-lessons.mjs` の検査、新しいレッスン・ステージ、盤面に触れない。
- 子どもの体験の中身（難易度・演出・音）を新しく決める必要がない。Issue本文に、何をどう変えるかが書いてある。
- 文書・文言・小さなUI（ボタン・導線）・JSON の追加・設定のいずれか。

## 規則
- 1 Issue = 1 PR = 1セッション。
- `git` は `--no-pager` を付ける。`git add` は**必ずパスを指定する**（`.` は使わない）。PowerShell で動く書き方にする。CLAUDE.md の規則に従う。
- 触らないもの：`.claude/`、`CLAUDE.md`、`AGENTS.md`、凍結fixture（cmd-01・donguri-01）、`config.mjs`、`review/`。`PROJECT.md` は、Issue本文が変更を求めているときだけ変える。その場合は仕様確定にあたるので、差分を見せるところまでで、悠さんが承認する。12,000字以内であることを確認して報告する。
- Issueに書かれていない変更をしない。曖昧なら止まって質問する。
- E2E はローカルで実行しない（CIのみ）。マージはしない。
- **ターン数を減らす**：`style.css`・`js/ui-*.js`・`tools/validate-lessons.mjs` などの大きいファイルは全文を読まず、`Grep` と行範囲の指定で必要な箇所だけ読む。`style.css` は読まず、差分も `git diff --stat` で見る。編集の対象は `tailwind.src.css`。

## 手順

### 0. 事前確認
1. `git --no-pager status`：未コミットの変更があれば報告する（`review/` 以下と `docs/*-review.md` の未追跡は想定内）。
2. `git --no-pager fetch` のうえ、`main` が最新であることを確認する。
3. `gh issue view <N> --json number,title,body,labels,comments` で本文を取得する。依存先がオープンなら止まる。上の「使ってよいIssue」に当てはまるか判定する。
4. `git --no-pager log -5 --oneline` でコミットメッセージの書き方を確認する。

### 1. ブランチ
`git switch -c feature/issue-<N>-<短い英語のslug>`（`main` から）。

### 2. 変更
Issue本文の作業内容と完了条件に沿って変更する。
- シナリオ（`.claude/verify/`）を書く場合：その前に、`.claude/verify/run.mjs` の `check()` の仕様と、似た既存シナリオ1本を読む。期待値は isEqual で比べるだけで、**正規表現は使えない**。セットアップは goto → evaluate の順で、`about:blank` のまま `localStorage` に書かない。
- Tailwind のクラスを足したら `npm run build:css` を回し、`style.css` を変更ファイルに含める。
- ファイルやモジュールを足したら、`service-worker.js` の `APP_SHELL` に加え、`CACHE_NAME` と `js/config.js` の `APP_VERSION` を同時に上げる。
- 子ども向けの文言は、ひらがな中心にし、失敗や損失を感じさせる表現、連続記録・点数・比較を入れない。

### 3. 検証（差分に合わせる）
スクリプト名は `package.json` で確認する。
- `js/`・HTML・`tailwind.src.css` を変えた：`check:static`・`test:unit`・`validate:lessons` の3つ。
- シナリオ・docs・Issue本文だけ：`check:static` のみ（`test:unit` は約130秒かかるので、回さない）。
失敗したら直して再実行する。同じ失敗が2回続いたら、止まって報告する。

### 4. 自己点検（照合の代わり）
コミット前に、次を確認する。
1. `git --no-pager diff --stat` と `git --no-pager status -uall` で、変更が Issue の範囲のファイルだけである。
2. 禁止ファイル、`review/`、画像、観察メモが含まれていない。
3. Tailwind のクラスを足したなら、`style.css` が stat に出ている。
4. ファイル・モジュールを足したなら、`APP_SHELL`・`CACHE_NAME`・`APP_VERSION` が揃っている。
5. 子ども向けの文言・配置が三原則と48px以上の基準に合っている。

### 5. コミット・push・PR
1. 変更ファイルを、1つずつパスを指定して `git add` する。
2. コミットする。メッセージは手順0-4で確認した書き方に合わせ、Issue番号を入れる。
3. `git log -1 --format="%an <%ae>"` を実行する。noreply 形式でなければ push せず、止まって報告する。
4. `git push -u origin <ブランチ>`。
5. `gh pr create` で PR を作る。本文：`Closes #<N>`、変更の要点、検証結果（実行したもの、省いたものの理由）、自己点検の結果、悠さんが確認すること。シナリオを足した・変えた場合は、`.github/workflows/e2e-pr.yml` で書式を確認したうえで `E2E: <シナリオ…>` の行を**必ず**入れる。
6. `gh pr checks <PR番号> --watch` で、完了まで1回の呼び出しで待つ。待ち時間の上限で切れたら、もう1回だけ同じコマンドを実行する。

### 6. CIが落ちたとき
ログを読み、①ビルド忘れ（style.css）→ `npm run build:css`、②シナリオの書き方の不備 → 直す、③それ以外 → 止まって報告、に分ける。②は止まらずに直してよいが、通算3回までとする。**期待値を緩める、`check()` を削除する、スキップする、本体コードをテストに合わせて変える修正はしない**。必要に見えたら止まって報告する。

### 7. 報告して停止
PR のURL、CIの結果（シナリオを足した場合は、新シナリオが実際に走ったか）、悠さんが読むべき差分、実機で確認すること、Issueと違った点を報告して停止する。あわせて、**実測用の記録**（修正の回数、CIの実行回数、停止の理由）を書く。費用は、悠さんが実行前後の `/usage` で比べる。
