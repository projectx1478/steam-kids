---
description: キューの Issue を1件、設計→ゲート判定→実装→PR→マージ前の照合まで自動で進め、人の判断が要る点で止まる（マージはしない）
argument-hint: [/usage の値（例：5時間 42% 週間 30%）] [決裁の回答（例：1A 2B）]
---

キューから Issue を1件選び、進められるところまで進める：$ARGUMENTS

あなた（メインセッション）は調整役で、進行・git・gh の操作と、状態ファイルの読み書きを担当する。設計は `/design-issue`、実装は `/implement-issue`、審査は `reviewer` に任せる。

## 規則
- **1回の起動で1 Issue。** 途中で別の Issue に移らない。
- 状態ファイルの置き場所：`git worktree list` の先頭行（main の作業ツリー）を `<MAIN>` とし、`<MAIN>/review/autopilot/` を**絶対パスで**読み書きする。worktree に複製しない。`review/design/<N>/` も `<MAIN>` 側を絶対パスで読む。
- `review/autopilot/` は git に入れない（`git add` しない。PR に含めない）。
- `/design-issue`・`/implement-issue` の規則（触らないもの・作成者の確認・マージしない）はそのまま守る。この手順はそれを緩めない。
- マージはしない。

## 止まる条件（それ以外は approved.md の事前許可と先例に従って進む）
- `.claude/` の変更が要る
- docs の規則の変更が要る（`docs/lesson-schema.md`・`docs/learning-spec.md`・`docs/ui-rules.md`・`docs/gimmicks.md`・`PROJECT.md`）
- 見本の色・形・文言・盤面の承認
- 設計案の承認（`/design-issue` の手順5で止まる）
- approved.md に先例が無い判断
- マージ（PR ができてマージ前の照合が済んだら止まる）
- `/implement-issue` の打ち切り規則の発動
- 予算の不足（手順0）

## 手順

### 0. 起動時
1. `<MAIN>/review/autopilot/` の `queue.md`・`log.md`・`decisions/` と、最新の引き継ぎ書（`<MAIN>/review/handoff-*.md` のうち日付が最新のもの）を読む。
2. 引数に `/usage` の値があれば、`log.md` の「/usage の記録」に、日時・5時間枠・週間を1行で書く。値が無ければ、止まって `/usage` の値を求める。
3. 予算の判定：
   - 週間が85％以上なら、新しい Issue に着手しない（途中の Issue の報告だけ書いて止まる）。
   - 5時間枠の残りが、次の Issue の見積もり（approved.md の `見積もり:` 行。無ければ下の目安）に足りなければ着手しない。
   - 目安（単位は5時間枠）：docs の照合 5〜8％／4役の設計 18〜23％／小さめの実装 15〜17％／新ギミックの実装 38〜40％。
4. 引数に決裁の回答（`1A 2B` の形）があれば、該当の決裁票の項目に回答を書き、決まった内容を対象 Issue の `<MAIN>/review/design/<N>/approved.md` の該当節に転記する。転記した行は、報告に**全文**出す。

### 1. Issue の選択
`queue.md` の上から、状態が `照合待ち`・`待ち`・`再開可` のどれかで、依存がすべて完了しているものを1件選ぶ。`照合待ち` は手順5（マージ前の照合）だけを行う。決裁待ちの Issue は、その決裁票が回答済みのときだけ選ぶ。選べなければ、理由（依存・決裁待ち）を書いて止まる。

### 2. 設計
- `<MAIN>/review/design/<N>/approved.md` が無い：`/design-issue <N>` を実行する。手順5（設計案の提示）で止まり、設計案の承認を決裁票に載せて停止する。
- approved.md があり、先頭に `承認:` がある：次へ。

### 3. ゲート判定
1. その Issue 専用の worktree を作る：`git worktree add ../<リポジトリ名>-<N> -b feature/issue-<N>-<短い英語のslug> origin/main`（既にあれば使う）。
2. 検査を新設・変更する設計なら、`<MAIN>/review/design/<N>/boards/` の合格盤・不合格盤を `node tools/validate-lessons.mjs` 系のコマンドで走らせ、結果を `<MAIN>/review/design/<N>/gate-validate.txt` に書く（他の verify・テストと並行させない）。
3. `reviewer` をモード `ゲート判定` で呼ぶ。渡すのは、Issue 本文・approved.md・引き継ぎ書の決定欄のパス、`boards/`・`mock/`・`gate-validate.txt` のパス、`git worktree list` と `<MAIN>` の `git --no-pager status --short` の出力だけ。
4. reviewer の返信を `<MAIN>/review/design/<N>/gate.md` に、日付を付けてそのまま保存する（`/implement-issue` が合格の記録として読む）。
5. 判定が合格（G1〜G6 すべて合格）でなければ、coder を呼ばずに止まる。不合格の項目を決裁票に載せる。

### 4. 実装
作った worktree で `/implement-issue <N>` を実行する（ブランチは手順3で切ったものを使う。打ち切り規則は `/implement-issue` の「打ち切り規則」に従う）。PR 作成までで、`gh pr checks --watch` の後に戻る。

### 5. マージ前の照合
1. `gh pr view <PR番号> --json body -q .body` で PR 本文を取る。
2. `reviewer` をモード `マージ前の照合` で呼ぶ。渡すのは、Issue 本文・approved.md・引き継ぎ書の決定欄のパス、PR 番号、作業ブランチ、PR 本文だけ。coder の報告・検証ログ・判断の経緯・checker の返信は渡さない。
3. 重大があれば、`/implement-issue` の打ち切り規則（reviewer の重大）に従い、PR は下書きのままにする。重大が無ければ `gh pr ready <PR番号>`。軽微は報告に書く。
4. マージ待ちで止まる。

### 6. 記録して停止
1. `queue.md` の状態を更新する（`照合待ち`／`待ち`／`設計承認待ち`／`決裁待ち`／`マージ待ち`／`再開可`／`完了`）。
2. `log.md` に、Issue ごとの1行（停止の回数と分類、coder の呼び出し回数、検証の所要時間、/usage の前後）を書く。
3. 引き継ぎ書を `<MAIN>/review/handoff-steam-kids-<日付>.md` に書く（その日のものがあれば追記）。見出しは、現在の状態／**決定**（悠さんが決めたこと。reviewer が照合に使う）／未決（決裁票の番号）／次の一手。
4. 次の「停止の報告」をして止まる。

## 決裁票
- 置き場所：`<MAIN>/review/autopilot/decisions/<Issue番号>.md`（同じ Issue で2枚目以降は `<Issue番号>-2.md`）。
- 止まる時点で見えている判断を、**すべて1枚に**まとめる（後で分かる判断は、決められない理由を添えて載せる）。
- 項目ごとに書くこと：番号／問い／選択肢（`A`〜`D` の記号付きで2〜4個）／推奨案と理由1行／先例の有無（あれば Issue・PR 番号）／決めないと止まる段。
- 回答は `1A 2B` の形で受ける。回答を approved.md に転記したら、転記した行を報告に全文出す。

## 停止の報告（チャット）
必ず次を書く。
- 停止理由と分類（設計の穴／運用／予定どおり／既知の負債／予算不足）
- coder の呼び出し回数（見積もりとの比）
- 残りの段
- 推奨案（決裁票の番号と、各項目の推奨）
- 分類が「設計の穴」のときは、ゲートに足す確認項目の案を決裁票に1行で載せ、その行を報告にも出す
