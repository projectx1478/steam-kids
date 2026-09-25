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
   - 3段構え（予想→実行→ズレを見る）を全ステップで維持する
   - `steps` は4〜7個、`estimatedMinutes` は5
   - 1画面の文章は20字以内。ひらがな主体・漢字ゼロ（暫定規則）
   - 否定語（「ちがう」「まちがい」「ざんねん」）を使わない
   - `predict` を最低1つ、`grid-runtime` では `play` をちょうど1つ含める
   - `predict.commands` の終点が `answer` の `optionCells` 座標と一致すること
   - `play.groupRepeats: true` を使う場合、同方向連続をまとめた最小チップ数が
     `maxCommands` 以内であること（`tools/validate-lessons.mjs` が自動判定する。
     Issue #48）
3. `lessons/<lessonId>.json` を書き出す（`lessonId` はファイル名と一致させる）
4. `lessons/index.json` を更新する（`docs/lesson-schema.md`「`lessons/index.json`」参照）。
   既存 `unitId` への追加なら該当 `unit.lessonIds` に追記、新しい単元なら `units` に
   `{unitId, title, lessonIds}` を追加する
5. `npm run validate:lessons` を実行する。**検証NGの場合は再生成する。手で通さない**
6. `.claude/verify` にそのレッスン用のシナリオを作成する（`cmd01-ui-rules.mjs`
   `cmd02-ui-rules.mjs` を参考に、48px・20字・横スクロール無しを確認する内容）。
   `node .claude/verify/run.mjs <シナリオ名>` と `--mobile` 付きの両方で実行する
7. 既存シナリオを全再実行し、後方互換を確認する（`p3-link.mjs` の実行環境依存クラッシュは
   本スキルと無関係な既知の問題。Issue #43）

## 完了条件

- 単元名1つを入力に `lessons/*.json` が1本生成される
- 生成JSONが `npm run validate:lessons` を無改変で通る
- 実機シナリオで48px・20字・375px横スクロール無しを確認済み
