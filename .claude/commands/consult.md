---
description: 週1回の「次の一手メモ」を作る（観察ログと決定ログを読んで、選択肢3つと推奨を出す）
argument-hint: "[今週特に相談したいこと（任意）]"
---

`docs/ai-consulting-rules.md`に従い、次の一手メモを作る。相談したいこと：$ARGUMENTS

## 読むもの（無いものは飛ばし、無かったことを1行書く）
- `docs/plan/observation-log.md`・`docs/plan/decision-log.md`（前回メモ以降の分を中心に）
- `docs/plan/plan-memo.md`（賭け3つ・やめる条件）、`docs/plan/taste-samples.md`
- `docs/plan/next-move/`の直近1件
- 前回メモ以降の`git log --oneline`
- 現在の段は`docs/kickoff-process.md`と照らして判断する

## 書くもの：`docs/plan/next-move/YYYY-MM-DD.md`（目安1,500字）
1. 分かったこと：観察ログの日付を出典に。【事実】【推測】を分ける。賭け3つそれぞれの当たり外れ
2. 今の段と、その段の「次へ」「やめる」条件に対する位置
3. 選択肢3つ（うち1つは「やらない・止める」）：各案の中身・リスク・確かめ方
4. 推奨と理由（「場合による」で終えない）
5. 反対役：devils-advocateサブエージェントに推奨を渡し、返った弱点を要約し、受ける／退けるを1行ずつ
6. 人が決めること（あれば）

観察ログが前回から増えていなければ、推奨の前に「観察を増やす」を必ず選択肢に入れる。最後に推奨を1行で人に示して終える。決定は人が行い、決まったら決定ログへ1行足す。
