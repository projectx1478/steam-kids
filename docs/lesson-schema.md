# レッスンJSON・学習イベントのスキーマ

教材を追加・生成するとき、イベントを追加するときに読む。

## レッスンJSON

```json
{
  "lessonId": "cmd-01-susumu",
  "unitId": "commands",
  "title": "すすむ",
  "type": "grid-runtime",
  "estimatedMinutes": 5,
  "steps": [
    { "stepId": "s1", "kind": "intro", "text": "ゴールまで すすもう" },
    {
      "stepId": "s2",
      "kind": "predict",
      "text": "どのマスに つく？",
      "commands": ["up", "up", "right"],
      "optionCells": [
        { "id": "A", "x": 1, "y": 2 },
        { "id": "B", "x": 1, "y": 1 },
        { "id": "C", "x": 2, "y": 1 }
      ],
      "options": ["A", "B", "C"],
      "answer": "B"
    },
    {
      "stepId": "s3",
      "kind": "play",
      "grid": { "cols": 4, "rows": 4 },
      "start": { "x": 0, "y": 3 },
      "goal": { "x": 3, "y": 0 },
      "walls": [{ "x": 2, "y": 2 }],
      "allowedCommands": ["up", "down", "left", "right"],
      "maxCommands": 8
    },
    { "stepId": "s4", "kind": "summary", "text": "めいれいの じゅんばんが だいじ" }
  ]
}
```

`kind` は `intro` / `predict` / `play` / `summary`。座標は y が下向きに増加する。

`predict` ステップは自前の盤面を持たず、同じレッスン内の `play` ステップの
`grid` / `start` / `goal` / `walls` を参照する。`commands` はその盤面上で予想させる命令列、
`optionCells` は `options` の各選択肢が指すマス座標（`id` が `options` の値と対応）。

`play.groupRepeats`（任意・boolean・既定false）を`true`にすると、実行時に子どもが同じ方向を
続けてタップした際、新しいチップを追加せず直前のチップへ回数をまとめる（「した ×5」表示）。
`maxCommands`はまとめ後のチップ数で判定されるため、まとめないと手数制限に収まらないレッスンを
作れる（Issue #48）。レッスンJSON自体の`commands`/`allowedCommands`は従来通り単発方向の配列で
書く。まとめは実行時のみの挙動で、レッスンデータの書き方は変わらない。

## 検証ルール（生成後に自動チェック）

`npm run validate:lessons`（`tools/validate-lessons.mjs`）が `lessons/*.json` を全件チェックする。

- 必須キー（`lessonId` `unitId` `title` `type` `estimatedMinutes` `steps`）が揃っている
- `lessonId` がファイル名と一致する
- `text` は20字以内
- `steps` は4〜7個
- `predict` ステップが最低1つ含まれること
- `grid-runtime` では `play` ステップがちょうど1つであること
- `estimatedMinutes` が5であること
- `answer` が `options` に存在し、`optionCells` の `id` 集合が `options` と一致すること
- `predict.commands` を `play` の盤面で実行した終点が `answer` の `optionCells` 座標と一致すること
- `commands` / `allowedCommands` が `up` `down` `left` `right` のみであること
- `groupRepeats` を持つ場合はboolean型であること
- `start` `goal` `walls` `optionCells` の座標が盤内であること
- `start` と `goal` が重ならず、`walls` が `start` `goal` を含まないこと
- ゴールが到達可能であること（`maxCommands` 以内の最短手数をBFSで確認）
- `text` に漢字（CJK統合漢字）が含まれないこと（学年別許可リストの出典確定までの暫定規則。
  `docs/authoring-rules.md`）
- **検証NGの場合は再生成する。手で通さない**

## 学習イベント

**追記のみ。上書き・削除をしない。** 複数端末の同時進行でも衝突しない構造とする。
将来 `classId` を1フィールド追加するだけでクラス集計へ拡張できるよう、フラットな形を保つ。
（この「追記のみ」は同期時の衝突回避の原則。端末内ストレージは容量が有限なため、
上限到達時に古い順へ破棄する運用と両立させる。上限は `js/storage.js` で管理する。）

```json
{
  "eventId": "uuid-v4",
  "learnerId": "uuid-v4",
  "lessonId": "cmd-01-susumu",
  "stepId": "s3",
  "type": "retry",
  "ts": 1757913600000,
  "payload": { "commandCount": 7 }
}
```

| type | 意味 |
| --- | --- |
| `step_enter` / `step_leave` | 滞在時間の算出用 |
| `predict` | 予想の選択と正誤 |
| `run` | 実行 |
| `retry` | 失敗後の再実行 |
| `undo` | 命令の取り消し |
| `clear` | レッスン達成 |
| `abandon` | 途中離脱 |

`logEvent(type, payload)` で `js/storage.js` 経由の localStorage（キー `steamkids.events`）へ
追記する。保存件数の上限は5000件で、超過時は古い順に破棄する（P2で実装）。

## 学習者プロファイル

```json
{
  "learnerId": "uuid-v4",
  "label": "端末内のみ。同期しない",
  "createdAt": 1757913600000
}
```

- `learnerId` は端末で生成するランダムUUID
- `label`（呼び名）は **localStorage のみ**。同期先へ送信しない
- **氏名・学年・学校名を扱うフィールドを作らない**
