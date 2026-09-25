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

`play.initialCommands`（任意・方向文字列の配列・既定なし＝空キュー）を指定すると、`play`
ステップ開始時に子どものキューへ最初からその命令列を積んでおく。「誤った命令列を提示し、
誤りを見つけて直させる」レッスン（例: なおす）で使う。個別削除（×）で不要な命令を消し、
必要なら追加してから実行する、という従来通りの操作で直せる（Issue #31）。
`initialCommands`はそのまま実行してもゴールに到達しない内容にする（直す必要が無いと検証NG）。

`play.items`（任意・マス座標`{x, y}`の配列・既定`[]`）を指定すると、盤面に回収対象（どんぐり）
を置く。クリア条件は「ゴール到達」から「ゴール到達 **かつ** 全item回収」に変わる（items未指定時
は従来通りゴール到達のみ）。item同士・item-壁の座標重複は不可（`validate-lessons.mjs`が検証）。
`maxCommands`はゴール到達と全item回収の両方を満たす最短経路の手数（`groupRepeats`時はチップ数）
で判定される（Issue #60）。

### ルビ記法（`text`内の漢字表記）

`text` 内で漢字を使う場合は `{漢字|よみ}` の形式で書く（例: `"{右|みぎ}へ すすもう"`）。
地の文に生の漢字を書かない。漢字は `js/kanji-grades.js`（文部科学省「学年別漢字配当表」）に
含まれるものに限る。1つの `{...}` に複数の漢字を含める場合、表示判定はその中の**最大配当学年**
で行う（部分的に漢字とひらがなを混在させない）。

表示は端末内の「よみレベル」（`ねんちょう`/`1ねん`〜`6ねん`、`dashboard.html`の保護者ゲート内で
設定・**同期しない**）で決まる。配当学年 ≦ よみレベルなら漢字（ふりがなトグルON時は`<ruby>`要素）、
それ以外はひらがな表示に自動で落ちる。解析・表示・検証は `js/text-render.js` の純粋関数
（`parseSegments` / `plainReading` / `rubyGrade` 等）に集約する（Issue #59）。

## `lessons/index.json`（単元マップ）

レッスン選択画面（単元マップ＝「しま」）の一覧ファイル。レッスン本体ではない（Issue #58）。

```json
{
  "units": [
    {
      "unitId": "commands",
      "title": "めいれいでうごかす",
      "lessonIds": ["cmd-01-susumu", "cmd-02-mijikaku", "cmd-03-naosu"]
    }
  ]
}
```

- `unitId` は各レッスンJSONの `unitId` と一致させる
- `lessonIds` は同じ `unitId` を持つレッスンのファイル名（拡張子無し）の配列。1つの `lessonId` を
  複数の `unit` から参照しない
- 単元内の全レッスンで `clear` イベントが記録されると、単元マップにスタンプ・旗が表示される
  （端末内判定・同期しない。`js/ui-picker.js`）

## 検証ルール（生成後に自動チェック）

`npm run validate:lessons`（`tools/validate-lessons.mjs`）が `lessons/*.json` を全件チェックする。

- 必須キー（`lessonId` `unitId` `title` `type` `estimatedMinutes` `steps`）が揃っている
- `lessonId` がファイル名と一致する
- `text` は全てひらがなに展開した表示（よみレベル0相当）で20字以内
- `steps` は4〜7個
- `predict` ステップが最低1つ含まれること
- `grid-runtime` では `play` ステップがちょうど1つであること
- `estimatedMinutes` が5であること
- `answer` が `options` に存在し、`optionCells` の `id` 集合が `options` と一致すること
- `predict.commands` を `play` の盤面で実行した終点が `answer` の `optionCells` 座標と一致すること
- `commands` / `allowedCommands` が `up` `down` `left` `right` のみであること
- `groupRepeats` を持つ場合はboolean型であること
- `initialCommands` を持つ場合は語彙が正しく、長さが `maxCommands` 以内であり、そのまま実行
  してもゴールに到達しないこと（`items` がある場合は全回収も満たしていないこと）
- `start` `goal` `walls` `optionCells` `items` の座標が盤内であること
- `start` と `goal` が重ならず、`walls` が `start` `goal` を含まないこと
- `items` が `walls` と重ならず、`items` 同士も座標重複しないこと
- ゴールが到達可能であること（`items` がある場合は全回収した上でのゴール到達）を `maxCommands`
  以内の最短手数でBFS確認する（`groupRepeats: true` の場合は同方向連続を1チップにまとめた
  最小チップ数で判定する）
- `text` に否定語（「ちがう」「まちがい」「ざんねん」）が含まれないこと（ひらがな展開後の
  文字列で判定。`docs/authoring-rules.md`）
- `text` のルビ記法 `{漢字|よみ}` 外に生の漢字が無いこと、ルビ内の漢字が
  `js/kanji-grades.js`（学年別漢字配当表）に含まれること、よみ側に漢字が混じっていないこと
  （`docs/authoring-rules.md`「使用できる文字」）
- 各レッスンで使われている漢字の最大配当学年（`kanjiMaxGrade`）を算出し、使用があれば
  `INFO`行で表示する（失敗にはしない情報表示）
- **検証NGの場合は再生成する。手で通さない**
- `lessons/index.json`: 参照する `lessonId` が実在すること、レッスン本体の `unitId` と一致すること、
  同一 `lessonId` を複数の `unit` から参照しないこと

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
  "readingLevel": 0,
  "createdAt": 1757913600000
}
```

- `learnerId` は端末で生成するランダムUUID
- `label`（呼び名）・`readingLevel`（よみレベル。0=ねんちょう〜6）は **localStorage のみ**。
  同期先へ送信しない
- **氏名・学年・学校名を扱うフィールドを作らない**
