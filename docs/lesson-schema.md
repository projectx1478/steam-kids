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

## 検証ルール（生成後に自動チェック）

- `text` は20字以内
- `steps` は5〜7個
- `predict` ステップが最低1つ含まれること
- `answer` が `options` に存在すること
- ゴールが到達可能であること（探索で確認）
- 使用漢字が学年別許可リスト内であること（`docs/authoring-rules.md`）
- **検証NGの場合は再生成する。手で通さない**

検証スクリプトはP1で追加する（`lessons/*.json` を全件チェックし、NGがあれば exit 1）。

## 学習イベント

**追記のみ。上書き・削除をしない。** 複数端末の同時進行でも衝突しない構造とする。
将来 `classId` を1フィールド追加するだけでクラス集計へ拡張できるよう、フラットな形を保つ。

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

P0では `logEvent(type, payload)` でメモリ配列に積むのみとし、永続化はP2で追加する。
イベントの形状はP0時点で上記に確定させ、P2では保存層だけを足す。

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
