---
name: lesson-author
description: 単元名からgrid-runtimeレッスンJSONを生成し、npm run validate:lessonsで検証するまでを1コマンドで回す。教材追加・レッスン量産（P5含む）時に使う。
---

# レッスン生成スキル

単元名（と学習内容の要点）を入力に `lessons/<lessonId>.json` を1本生成し、検証まで行う
（PROJECT.md P4、Issue #30）。

## 手順

1. 必ず読む: `docs/authoring-rules.md`（文言・表現の禁止事項）、`docs/lesson-schema.md`
   （レッスンJSON・検証ルール）、`docs/learning-spec.md`（教材型・grid-runtime仕様・
   確定済み単元内容）、既存 `lessons/*.json`（記法の参考例）
2. `docs/learning-spec.md` に対象レッスンの確定値（grid/start/goal/walls等）が既にあれば
   それに従う。無ければ以下を満たすように設計する。
   - PROJECT.md「学習体験の固定仕様」の3原則を全ステップで維持し、操作モデル（計画型／直接操作型）を明記する
   - `steps` は4〜7個、`estimatedMinutes` は5
   - 1画面の文章はひらがな展開後20字以内。ひらがな主体。漢字を使う場合は`{漢字|よみ}`
     のルビ記法で書き、`js/kanji-grades.js`（学年別漢字配当表）内の漢字に限る
     （`docs/authoring-rules.md`「使用できる文字」）
   - 否定語（「ちがう」「まちがい」「ざんねん」）を使わない
   - `predict` を最低1つ、`grid-runtime` では `play` をちょうど1つ含める
   - `predict.commands` の終点が `answer` の `optionCells` 座標と一致すること
   - `play.text`（任意）を書く。省略時は`items`有無で既定文言が出るため、既定と異なる指示を
     出したい場合のみ明示する（`docs/lesson-schema.md`「`play.text`」）
   - `play.groupRepeats: true` を使う場合、同方向連続をまとめた最小チップ数が
     `maxCommands` 以内であること（`tools/validate-lessons.mjs` が自動判定する。
     Issue #48）
   - 新しい操作が初登場するレッスンには、`intro`直後・`predict`より前に`kind: "tutorial"`を置く
     （`docs/lesson-schema.md`「`tutorial`」参照。Issue #81・#98）
   - `intro.demo`（任意だが付ける）にロボットがゴールへ到達する完成イメージの経路を書く。
     `start`/`goal`は本番`play`と別の組にする（答えのネタバレ防止。`validate-lessons.mjs`が
     機械チェックする。`docs/lesson-schema.md`「`intro.demo`」参照。Issue #97）
3. `lessons/<lessonId>.json` を書き出す（`lessonId` はファイル名と一致させる）
4. `lessons/index.json` を更新する（`docs/lesson-schema.md`「`lessons/index.json`」参照）。
   既存 `unitId` への追加なら該当 `unit.lessonIds` に追記、新しい単元なら `units` に
   `{unitId, title, lessonIds}` を追加する
5. `npm run validate:lessons` を実行する。**検証NGの場合は再生成する。手で通さない**
6. `.claude/verify` にそのレッスン用のシナリオを作成する（`cmd01-ui-rules.mjs`
   `cmd02-ui-rules.mjs` を参考に、64px・20字・横スクロール無しを確認する内容）。
   E2Eは手元で実行しない。`e2e-run`で`<シナリオ名>`と`--mobile`付きの両方を実行する
   （`docs/testing-guidelines.md`）
7. PR本文の`E2E:`行に関連シナリオを列挙し、E2E PRで後方互換を確認する（`p3-link.mjs` の実行環境依存クラッシュは
   本スキルと無関係な既知の問題。Issue #43）

## 完了条件

- 単元名1つを入力に `lessons/*.json` が1本生成される
- 生成JSONが `npm run validate:lessons` を無改変で通る
- 実機シナリオで64px・20字・375px横スクロール無しを確認済み
