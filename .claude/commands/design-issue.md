---
description: Issueの設計を、役割別エージェントの2ラウンド議論で行う（実装はしない）。複数Issueを1回にまとめられる
argument-hint: <Issue番号を空白区切りで1つ以上> [--roles learner,screen,impl,guardian,sound,difficulty]
---

次のIssueの設計を、役割別エージェントの議論で行う：$ARGUMENTS

あなた（メインセッション）は調整役で、自分では設計案を書かず、論点の整理と統合だけを行う。読み込みや探索はサブエージェントに任せる。

## 規則
- `git` は `--no-pager` を付ける。PowerShell で動く書き方にする。
- 設計の議論はここまで。**コードは変更しない**。ブランチも切らない。
- 決めるのは悠さん。割れた点は割れたまま出す。
- 議論の原文（`review/design/` 以下）はIssueに貼らない。コメントに残すのは要約だけ。観察メモ・保護者の記述は含めない。リポジトリは公開である。
- 費用を抑える：メインは大きいファイル（`style.css`、`js/ui-*.js`、`tools/validate-lessons.mjs` など）を自分で読まない。ラウンド2は意見が割れた論点だけ。

## 用語
- Issue番号が1つなら、`<G>` はその番号。複数なら、番号を `-` でつないだもの（例：`248-249-250-265-149`）。保存先は `review/design/<G>/`。
- 複数のIssueを1回で扱うときは、共通の論点（盤面の独立、規則の緩和の整合、レッスンの置き場所など）を先に議論し、そのあとIssueごとの論点に分ける。

## 手順

### 0. 事前確認
1. `git check-ignore review/design/` が該当を返すこと。返さなければ、`.gitignore` に `review/design/` が無いので、止まって報告する。
2. 各Issueについて `gh issue view <N> --json number,title,body,labels,comments` で本文を取得し、`review/design/<G>/issue.md` に、Issueごとの節に分けて保存する。
3. 依存先が未完了でも、**設計の段階では止めない**。依存と実装順は、`summary.md` と `approved.md` に書く（実装するときに `/implement-issue` が確認する）。ただし、依存先が存在しない・番号が違うと思われるときは、止まって報告する。
4. `review/design/<G>/round1/` と `round2/` を作る。既存の `review/principles/` と `review/lesson-ideas/` には書かない。

### 1. 役の決定
- `--roles` があれば、それを使う。
- 無ければ、次の初期値を使い、選んだ役と理由を1行ずつ示す。表に無いIssueは、「子どもの画面・操作」「文言・報酬・戻り導線」「新しい見た目・配置」「音」「盤面・最短手数・validate」「コード」のどれに触れるかで選ぶ。議論は2役から。1役だけなら議論せず、止まって報告する。
- 複数Issueのときは、各Issueの初期値の和集合にせず、**グループ全体で最小の役の組**を提案する（各役が全Issueを読むため、役が増えると費用がかさむ）。

| Issue | 役 |
|---|---|
| 248, 249, 250, 265, 149（スイッチ群） | difficulty, impl, learner |
| 64, 251（ワープ） | difficulty, impl, screen, learner |
| 252 | difficulty, impl, learner, screen |
| 65 | difficulty, impl, learner, screen |
| 264 | difficulty, impl |
| 266, 262 | difficulty, impl, learner |
| 257 | learner, screen, impl |
| 263 | learner, guardian, screen, impl |
| 267 | learner, guardian, screen |
| 268 | sound, learner, impl |
| 269 | learner, guardian, impl |
| 242 | impl, learner, guardian |

- 役 `<role>` は `.claude/agents/design-<role>.md` に対応する。**ファイルが存在しない役は、別の役で代用せず、止まって報告する**。

### 2. 論点の整理
Issue本文を読み、設計で決めるべき論点を整理して `review/design/<G>/points.md` に書く。
- 1 Issue：3〜5個。
- 複数 Issue：共通の論点を先に（最大3個）、そのあとIssueごとに最大3個。
- 各論点に、見る役と、どのIssueの論点かを付ける。Issueの「対象外」に書かれたことは論点にしない。

### 3. ラウンド1（独立）
選んだ役のサブエージェントを**並列で**呼ぶ。各役への指示は次のとおり。
- 読むもの：`review/design/<G>/issue.md`、`points.md`、`PROJECT.md`、関連コード。
- 書くもの：`review/design/<G>/round1/<role>.md`。
- 他の役の意見は読ませない。
- 文字数の上限：1 Issueなら1200字、複数 Issueなら2000字（**この指示が各役の定義の上限より優先する**）。
全員のファイルができたことを確認する。できていない役があれば、その役だけ再実行する（1回まで）。

### 4. ラウンド2（反論）
1. `round1/*.md` を読み、役の間で意見が割れた論点、または条件が食い違った論点だけを抜き出して `review/design/<G>/round2-points.md` に書く。
2. 割れた論点が無ければ、ラウンド2は行わず、そのことを報告に書く。
3. あれば、その論点に関わる役だけを並列で呼び、他の役の `round1/*.md` を読ませて `round2/<role>.md` を書かせる（600字以内）。

### 5. 統合
`review/design/<G>/summary.md` に、次の見出しで書く。
1. 合意した点
2. 割れた点（各役の立場を並べる。あなたは選ばない）
3. 悠さんの承認が要る点
4. 設計案（共通の設計、続いてIssueごとの設計。影響範囲と検証計画つき。検証計画は「AI担当／ユーザー担当／省略」の三分）。Issueごとに、次の2項目を**必須**で含める（無い設計案は完成としない）。
   - **段の分け方**：`/implement-issue` が段ごとに新しい coder を起動する単位。段ごとに、触るファイルと関数名、変えない挙動、完了条件（`npm run verify:fast` の pass ＋その段固有の確認）を書く。**行番号は書かない**（関数名・見出しで示す）。
   - **検証コスト**：盤面・ギミックを伴う Issue は、設計案の盤面を JSON（play ステージ1つ分。`maxCommands` を含む）にして `review/design/<G>/boards/` に置き、`node tools/analyze-board.mjs --board <ファイル>` で測った最短手数・訪問状態数・別解数・所要時間を書く（調整役が実行する。出力は数行）。既存ギミックの検査条件（必須性検査・最短手数の探索など）を流用する場合は、新ギミックの向きでも成り立つか（探索の枝刈りが要らないか、検査が逆向きに効かないか）を書く。盤面を伴わない Issue は「対象外」と理由を書く。
5. 実装順と依存（複数Issueのとき必須。`/implement-issue` を回す順番と、その理由）
6. 未検証の記述（研究・他ゲームへの言及、静止画からの想像、実行していない最短手数の数値）
7. 悠さんが実機で確認すること（操作感・音・子どもの反応）

チャットには、2・3・5・7の要点と `summary.md` のパスを出して、**停止**する。悠さんが `summary.md` を読み、割れた点を決める。

### 6. 承認後（悠さんの返事を受けたら）
1. 返事に書かれた決定を、**Issueごとに** `review/design/<N>/approved.md` にまとめる。複数Issueのときは、共通の決定と、そのIssueの設計を、どのファイルにも含める（`/implement-issue` は `review/design/<N>/approved.md` だけを読むため）。先頭行は `承認: 悠 <日付>` にする。**この行は、悠さんが決定を明示した返事を受けたときだけ書く**。内容は、確定した設計案、**段の分け方**、**検証コスト**（どちらも summary.md の「設計案」から、必須項目として転記する。無ければ approved.md を書かず、補ってから悠さんに確認する）、割れた点の決定、実装時に守ること、検証計画、E2E への影響、実装順と依存。
2. 各Issueに要約コメントを投稿する（`gh issue comment`）。内容は、決定事項と検証計画だけ。議論の原文は貼らない。
3. 「`/clear` のあと `/implement-issue <N>` で、実装順に進める」と報告して、停止する。
