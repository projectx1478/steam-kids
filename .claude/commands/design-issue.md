---
description: Issueの設計を、役割別エージェントの2ラウンド議論で行う（実装はしない）
argument-hint: <Issue番号> [役をカンマ区切り: learner,screen,impl,guardian,sound,difficulty]
---

Issue #$ARGUMENTS の設計を、役割別エージェントの議論で行う。あなた（メインセッション）は調整役で、自分では設計案を書かず、論点の整理と統合だけを行う。読み込みや探索はサブエージェントに任せる。

## 規則
- `git` は `--no-pager` を付ける。PowerShell で動く書き方にする。
- 設計の議論はここまで。**コードは変更しない**。ブランチも切らない。
- 決めるのは悠さん。割れた点は割れたまま出す。
- 議論の原文（`review/design/` 以下）はIssueに貼らない。コメントに残すのは要約だけ。観察メモ・保護者の記述は含めない。リポジトリは公開である。

## 手順

### 0. 事前確認
1. `git check-ignore review/design/` が該当を返すこと。返さなければ、`.gitignore` に `review/design/` が無いので、止まって報告する。
2. `gh issue view <N> --json number,title,body,labels,comments` で本文を取得し、`review/design/<N>/issue.md` に保存する。
3. Issue本文の「依存」が未完了（オープン）なら、止まって報告する。
4. 保存先 `review/design/<N>/round1/` と `round2/` を作る。既存の `review/principles/` と `review/lesson-ideas/` には書かない。

### 1. 役の決定
- 引数で役が指定されていれば、それを使う。
- 無ければ、次の初期値を使い、選んだ役と理由を1行ずつ示す。表に無い Issue は、Issueが「子どもの画面・操作」「文言・報酬・戻り導線」「新しい見た目・配置」「音」「盤面・最短手数・validate」「コード」のどれに触れるかで選ぶ。議論は2役から。1役だけの Issue は議論せず、止まって報告する。

| Issue | 役 |
|---|---|
| 257 | learner, screen, impl |
| 263 | learner, guardian, screen, impl |
| 267 | learner, guardian, screen |
| 268 | sound, learner, impl |
| 269 | learner, guardian, impl |
| 248, 249, 250, 264, 266, 149, 262 | difficulty, impl, learner |
| 265, 251 | difficulty, impl |
| 252, 64, 65 | difficulty, impl, learner, screen |
| 242 | impl, learner, guardian |

- 役 `<role>` は `.claude/agents/design-<role>.md` に対応する。**ファイルが存在しない役は、別の役で代用せず、止まって報告する**。

### 2. 論点の整理
Issue本文を読み、設計で決めるべき論点を3〜5個に絞って `review/design/<N>/points.md` に書く。各論点に、見る役を付ける。Issueの「対象外」に書かれたことは論点にしない。

### 3. ラウンド1（独立）
選んだ役のサブエージェントを**並列で**呼ぶ。各役への指示は次のとおり。
- 読むもの：`review/design/<N>/issue.md`、`points.md`、`PROJECT.md`、関連コード。
- 書くもの：`review/design/<N>/round1/<role>.md`。
- 他の役の意見は読ませない。
全員のファイルができたことを確認する。できていない役があれば、その役だけ再実行する（1回まで）。

### 4. ラウンド2（反論）
1. `round1/*.md` を読み、役の間で意見が割れた論点、または条件が食い違った論点だけを抜き出して `review/design/<N>/round2-points.md` に書く。
2. 割れた論点が無ければ、ラウンド2は行わず、そのことを報告に書く。
3. あれば、その論点に関わる役だけを並列で呼び、他の役の `round1/*.md` を読ませて `round2/<role>.md` を書かせる。

### 5. 統合
`review/design/<N>/summary.md` に、次の見出しで書く。
1. 合意した点
2. 割れた点（各役の立場を並べる。あなたは選ばない）
3. 悠さんの承認が要る点
4. 設計案（影響範囲と検証計画。検証計画は「AI担当／ユーザー担当／省略」の三分）
5. 未検証の記述（研究・他ゲームへの言及、静止画からの想像）
6. 悠さんが実機で確認すること（操作感・音・子どもの反応）

チャットには、2・3・6の要点と `summary.md` のパスを出して、**停止**する。悠さんが `summary.md` を読み、割れた点を決める。

### 6. 承認後（悠さんの返事を受けたら）
1. 返事に書かれた決定を、`review/design/<N>/approved.md` にまとめる。先頭行は `承認: 悠 <日付>` にする。**この行は、悠さんが決定を明示した返事を受けたときだけ書く**。内容は、確定した設計案、割れた点の決定、実装時に守ること、検証計画。
2. Issueに要約コメントを投稿する（`gh issue comment`）。内容は、決定事項と検証計画だけ。議論の原文は貼らない。
3. 「`/clear` のあと `/implement-issue <N>` で実装に進める」と報告して、停止する。
