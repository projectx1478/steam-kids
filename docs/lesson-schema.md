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
    {
      "stepId": "s1",
      "kind": "intro",
      "text": "ゴールまで {進|すす}もう",
      "demo": {
        "grid": { "cols": 4, "rows": 4 },
        "start": { "x": 3, "y": 3 },
        "goal": { "x": 0, "y": 0 },
        "walls": [{ "x": 2, "y": 2 }],
        "commands": ["left", "left", "left", "up", "up", "up"]
      }
    },
    {
      "stepId": "s2",
      "kind": "predict",
      "text": "ロボットは どこで とまる？",
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
      "text": "ロボットを ゴールへ うごかそう",
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

`kind` は `intro` / `predict` / `play` / `tutorial` / `summary`（れんしゅう専用に`seedPick`。後述の`generator`）。座標は y が下向きに増加する。
`grid-runtime`の`play`は2〜4個（`p1`, `p2`…と番号付きのstepIdにする）で構成し、だんだん
難易度を上げる（後のステージほど最短手数・`groupRepeats`時はチップ数が非減少であること。
`tools/validate-lessons.mjs`が機械チェック）。`predict`は将来の教材型向けに語彙のみ残し、
現行レッスンでは0個（Issue #104で全廃。0個でも検証NG にはしない）。

`predict` ステップは自前の盤面を持たず、同じレッスン内の最初の `play` ステップ（`p1`）の
`grid` / `start` / `goal` / `walls` を参照する。`commands` はその盤面上で予想させる命令列、
`optionCells` は `options` の各選択肢が指すマス座標（`id` が `options` の値と対応）。

`play.groupRepeats`（任意・boolean・既定false）を`true`にすると、実行時に子どもが同じ方向を
続けてタップした際、新しいチップを追加せず直前のチップへ回数をまとめる（「した ×5」表示）。
`maxCommands`はまとめ後のチップ数で判定されるため、まとめないと手数制限に収まらないレッスンを
作れる（Issue #48）。レッスンJSON自体の`commands`/`allowedCommands`は従来通り単発方向の配列で
書く。まとめは実行時のみの挙動で、レッスンデータの書き方は変わらない。

`play.repeatBox`（任意・boolean・既定false）を`true`にすると、パレットに「はこ」（くりかえしの箱）が
出る。操作はタップのみ：はこ→（開いている間の方向タップは箱の中へ）→回数ボタン（2→3→4→2）→
とじる。命令列の要素は`{box: [dir…], times}`（boxをtimes回繰り返す。Issue #66）。箱の中は方向のみ
（入れ子なし）・空の箱不可・`times`は2〜4。`maxCommands`は**箱1＋中の命令数**のチップ数で判定する。
`groupRepeats`とは併存し（同一stepで同時指定は検証NG）、`{dir, times}`は箱の1命令版の別表現として
残す。`solution`は必須で、箱を`{box, times}`で書ける（`repeatBox`時のみ）。ループ込みの最短性は
BFSで求めない（`js/ui-summary.js`は「いちばん みじかい」を出さない）。
実行中は箱チップの「はこ ×N」ラベルの下に周回の点（`.box-rounds`・N個）が並び、済みの周と
実行中の周が塗りつぶされる（実行中の点だけ強調。実行外はすべて空で、点の数だけで回数が分かる）。
DOM判定用に箱チップへ`data-round`（0始まりの現在周。実行外は属性なし。Issue #167）。

`play.initialCommands`（任意・方向文字列の配列・既定なし＝空キュー）を指定すると、`play`
ステップ開始時に子どものキューへ最初からその命令列を積んでおく。「誤った命令列を提示し、
誤りを見つけて直させる」レッスン（例: なおす）で使う。個別削除（×）で不要な命令を消し、
必要なら追加してから実行する、という従来通りの操作で直せる（Issue #31）。
`initialCommands`はそのまま実行してもゴールに到達しない内容にする（直す必要が無いと検証NG）。

`play.solution`（検証ハーネス用の正解手順。実行時は使わない）は、方向文字列の配列（`initialCommands`
の後ろへ積む命令）か`{ "removeIndex": N, "commands": [...] }`（`initialCommands`のN番目を消してから
`commands`を積む。なおす系）。`.claude/verify/helpers.mjs`の`clearLesson`が読む。盤面ギミックの
仕様は`docs/gimmicks.md`。

`play.items`（任意・マス座標`{x, y}`の配列・既定`[]`）を指定すると、盤面に回収対象（どんぐり）
を置く。クリア条件は「ゴール到達」から「ゴール到達 **かつ** 全item回収」に変わる（items未指定時
は従来通りゴール到達のみ）。item同士・item-壁の座標重複は不可（`validate-lessons.mjs`が検証）。`ice`（こおり）も座標範囲・壁/start/goal/items/ice同士の重複不可、`cushion`（クッション）も同様（仕様は`docs/gimmicks.md`）。
`maxCommands`はゴール到達と全item回収の両方を満たす最短経路の手数（`groupRepeats`時はチップ数）
で判定される（Issue #60）。

`play.text`（任意・文字列。他stepの`text`と同じくルビ記法・20字制限の検証対象）を指定すると、
playステップの指示文になる。未指定時の既定文言は`items`の有無で決まる（`js/ui-step.js`）：
`items`が1つ以上あれば「どんぐりを ぜんぶ とって ゴール」、無ければ
「ロボットを ゴールへ うごかそう」（Issue #80）。

`intro.demo`（任意・`{ grid, start, goal, walls, items?, commands, showCommands?, fixFrom? }`。
`play`と同じ形状の自前の盤面）を指定すると、「はじめに」画面でロボットがその経路をたどって
ゴールへ到達する完成イメージをアニメーションで見せる（`js/ui-demo.js`の`renderGoalDemo`）。
自動再生は1回だけ（「もういちど みる」で再生し直せる）。`start`/`goal`の組は**本番の`play`の
どのステージとも同一にしない**（答えのネタバレになるため。`validate-lessons.mjs`が機械チェックする）。
`commands`は壁にぶつからずゴール到達・全item回収する内容にする（同じくチェック対象）。
`commands`の各要素は方向文字列、`{dir, times}`（まとめ表示。`cmd-02-mijikaku`で使用）、または`{box, times}`（くりかえしの箱。`cmd-04-kurikaeshi`で使用）。
`showCommands`（任意・boolean）を`true`にすると、盤面の上に命令チップ列を表示し実行中のチップを
光らせる。`fixFrom`（任意・`commands`と同じ形状の配列）を指定すると、先にこの誤った命令列を
実行して失敗させ、一呼吸おいてから正しい`commands`へ差し替えて再実行する（「なおす」のデモ。
`fixFrom`はそのまま実行してもゴールに到達しない内容にする）。reduced-motion時も1手0.6秒の
コマ送りで動かし、静止画にはしない。未指定の教材型は表示しない（Issue #97・#104）。

### `predict-slider`の`play`（シーソー。Issue #150）

`type: "predict-slider"`のレッスンは`kind: "play"`に`seesaw`と`solution`（整数）を持つ。`pos`・`start`は支点からの刻み数（1〜`notches`）。
```json
{ "stepId": "p1", "kind": "play", "text": "つりあう ところに おこう",
  "seesaw": { "notches": 4, "left": [{ "robots": 2, "pos": 2 }], "mover": { "robots": 1, "start": 1 } },
  "solution": 4 }
```

### `tutorial`（なぞり操作型チュートリアル）

各レッスンで新しい操作が初登場する時、`intro`直後かつ最初の`play`より前に0〜1個置く
（Issue #81・#98）。`grid`/`start`/`goal`/`walls`/`items`（任意）/`allowedCommands`は`play`と
同じ形状の自前の盤面を持つ。`maxCommands`は持たない（`script`の手数がそのまま操作対象になるため）。
`groupRepeats`（任意・boolean）・`initialCommands`（任意・方向文字列の配列）は`play`と同じ意味
（同方向連続タップを1チップへまとめる／誤った命令列を最初から積む）を持ち、指定した場合は
`script`の再生・積んだチップの表示にも反映される（Issue #98）。

```json
{
  "stepId": "t1",
  "kind": "tutorial",
  "grid": { "cols": 3, "rows": 3 },
  "start": { "x": 0, "y": 2 },
  "goal": { "x": 2, "y": 0 },
  "walls": [],
  "allowedCommands": ["up", "down", "left", "right"],
  "script": [{ "tap": "up" }, { "tap": "up" }, { "tap": "right" }, { "tap": "right" }, { "tap": "run" }]
}
```

`script`は`{ tap }`の配列。`tap`は`up`/`down`/`left`/`right`/`run`に加え、`remove`
（`{ "tap": "remove", "index": N }`。積んだ命令列のN番目のチップをタップして消す。`initialCommands`
付きの「なおす」れんしゅう用。Issue #98）を取り得る。`tutorial.repeatBox: true`の時は
箱の語彙`box`（はこを開く）・`times`（かいすう。1タップ＝1回、初期×2→3→4→2）・`close`（とじる）も使える
（箱を開いている間の方向は箱へ入る。Issue #139）。**`script[]`要素に`text`は持たない**
（文字を読ませない方針。Issue #81）。最後の要素は必ず`run`で、それより前は方向または`remove`。
盤面上部の「お手本列」（実物ボタンと同じ見た目のミニボタン列）とパレット・じっこうボタンが、
現在の`tap`対象だけ有効化・点灯し、他は無効化される。`tap`が`remove`の時はパレット・じっこうを
すべて無効化し、積んだ命令列の対象チップだけを光らせてタップを許可する。子どもは光っている箇所を
順にタップするだけで進む。`tutorial`自体の`text`（任意）は視覚だけでは伝えられないルールがある時
だけ書く（例: どんぐり単元1本目は「どんぐりを とって ゴール」。方向操作のみのcmd単元1本目は
`text`無し）。

チュートリアル中は`run`/`undo`/`retry`/`clear`の学習イベントを記録しない（`step_enter`/
`step_leave`は通常どおり記録する）。これらを記録すると、チュートリアル完走だけでレッスンが
`cleared`と判定され単元スタンプが誤って付与されるため（`js/analytics.js`のクリア判定は
`clear`イベントの有無で決まる）。

### ルビ記法（`text`内の漢字表記）

`text` 内で漢字を使う場合は `{漢字|よみ}` の形式で書く（例: `"{右|みぎ}へ すすもう"`）。
地の文に生の漢字を書かない。漢字は `js/kanji-grades.js`（文部科学省「学年別漢字配当表」）に
含まれるものに限る。1つの `{...}` に複数の漢字を含める場合、表示判定はその中の**最大配当学年**
で行う（部分的に漢字とひらがなを混在させない）。

表示は端末内の「よみレベル」（`ねんちょう`/`1ねん`〜`6ねん`、`dashboard.html`の保護者ゲート内で
設定・**同期しない**）で決まる。配当学年 ≦ よみレベルなら漢字（ふりがなトグルON時は`<ruby>`要素）、
それ以外はひらがな表示に自動で落ちる。解析・表示・検証は `js/text-render.js` の純粋関数
（`parseSegments` / `plainReading` / `rubyGrade` 等）に集約する（Issue #59）。

## `lessons/index.json`の解放と開発者画面（Issue #216）

単元マップは`units`の`lessonIds`を通しの順に並べ、前のレッスンをクリアすると次が開く（先頭は最初から開く。`practiceIds`は同単元の`lessonIds`を全クリアで開く）。
`devOnlyIds`に載せたレッスンは通常の単元マップに出さず、開発者画面（`index.html?view=map&dev=1`。保護者ゲート解錠後のダッシュボードにリンク）だけに出す。
開発者画面は全レッスンが開き、学習記録（events・tutorialDone・同期）を残さない。`lessons/*.json`は`lessonIds`・`practiceIds`・`devOnlyIds`のどれかに載せる（`validate-lessons`が検証）。

## `generator`（シード生成の制約。Issue #68）

`js/engine-generate.js`の`generateMap(generator, seed)`へ渡す制約。同じシードなら同じ盤面。れんしゅう（Issue #69）は`steps`が`seedPick`（`text`のみ）→`generator`付き`play`（盤面フィールドを持たない）→`summary`で、
`lessons/index.json`の単元`practiceIds`に載せる。たね入力で確定したコードから`play`の盤面をその都度生成して差し込む
（`js/seed-code.js`・`js/ui-seedpick.js`・`js/ui-step.js`）。検証は`tools/validate-lessons.mjs`が40個のたねで生成できることを確認する。

| フィールド | 意味 |
| --- | --- |
| `grid` | `{cols, rows}` |
| `walls` | `{min, max}` 壁の数 |
| `shortestPath` | `{min, max}` 最短手数の範囲 |
| `minTurns` | 最短解の曲がり角（方向転換）数の下限 |
| `wallsMustMatter` | true＝壁を全部外すと最短手数が短くなること（飾りの壁を防ぐ） |
| `maxCommandsSlack` | `maxCommands`＝最短手数＋この値 |

返り値は`play`相当`{grid, start, goal, walls, items: [], allowedCommands, solution, maxCommands, fallback}`。乱数を進めて200回再試行し、満たせなければ手作りの予備盤面（`fallback: true`）を返す。`items`は0固定（ギミック対応はR3）。予想ステップは自動生成しない（#104で全廃）。

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
- `grid-runtime` では `play` ステップが2〜4個であること（`predict`は0個でもよい。Issue #104）
- `estimatedMinutes` が5であること
- `answer` が `options` に存在し、`optionCells` の `id` 集合が `options` と一致すること
- `predict.commands` を最初の `play`（`p1`）の盤面で実行した終点が `answer` の `optionCells` 座標と
  一致すること
- `commands` / `allowedCommands` が `up` `down` `left` `right` のみであること
- `groupRepeats` を持つ場合はboolean型であること
- `repeatBox` を持つ場合はboolean型で、`groupRepeats`と同時に`true`にしないこと。`true`の場合は
  `solution`が必須で、箱は空でなく中が方向のみ（入れ子なし）・`times`が2〜4の整数であること、
  `solution`のチップ数（箱1＋中の命令数）が`maxCommands`以内であること、箱を使わない最短手数が
  `maxCommands`を超えること（箱が必須）。ステージ難度の比較は`solution`のチップ数で行う
- `initialCommands` を持つ場合は語彙が正しく、長さが `maxCommands` 以内であり、そのまま実行
  してもゴールに到達しないこと（`items` がある場合は全回収も満たしていないこと）
- `solution` を持つ場合は形式が正しく、実行するとクリアし（ゴール到達・全item回収・壁や盤外に
  当たらない）、手数（`groupRepeats`時はチップ数）が `maxCommands` 以内であること
- `start` `goal` `walls` `optionCells` `items` の座標が盤内であること
- `start` と `goal` が重ならず、`walls` が `start` `goal` を含まないこと
- `items` が `walls` と重ならず、`items` 同士も座標重複しないこと
- ゴールが到達可能であること（`items` がある場合は全回収した上でのゴール到達）を `maxCommands`
  以内の最短手数でBFS確認する（`groupRepeats: true` の場合は同方向連続を1チップにまとめた
  最小チップ数で判定する）
- 複数の`play`ステージがある場合、後のステージほど最短手数（`groupRepeats`時はチップ数）が
  非減少であること（Issue #104）
- `intro.demo`がある場合、`commands`（`fixFrom`があればそれも）の語彙が正しく、壁にぶつからず
  ゴール到達＋全item回収になること。`fixFrom`はそのまま実行してもゴールに到達しないこと。
  `start`/`goal`の組が本番`play`のいずれのステージとも一致しないこと（ネタバレ防止。Issue #104）
- `text` に否定語（「ちがう」「まちがい」「ざんねん」）が含まれないこと（ひらがな展開後の
  文字列で判定。`docs/authoring-rules.md`）
- `text` のルビ記法 `{漢字|よみ}` 外に生の漢字が無いこと、ルビ内の漢字が
  `js/kanji-grades.js`（学年別漢字配当表）に含まれること、よみ側に漢字が混じっていないこと
  （`docs/authoring-rules.md`「使用できる文字」）
- 各レッスンで使われている漢字の最大配当学年（`kanjiMaxGrade`）を算出し、使用があれば
  `INFO`行で表示する（失敗にはしない情報表示）
- `tutorial`は0〜1個であること。ある場合は直前が`intro`かつ最初の`play`より前の位置にあること
- `tutorial.groupRepeats`はboolean、`tutorial.initialCommands`は方向文字列の配列であること。
  `initialCommands`はそのまま実行してもゴールに到達しないこと（なおす不要判定。Issue #98）
- `tutorial.script`が非空配列であること、各`tap`が`allowedCommands`∪`run`∪`remove`のいずれかで
  あること、`script`要素に`text`キーを持たないこと、`run`は最後の要素のみであること、
  `remove`の`index`が整数であること
- `tutorial.initialCommands`→`script`（`remove`は範囲外なら消し過ぎとしてNG、方向は
  `groupRepeats`を考慮してチップへ反映）の順に逐次再生し、最終的な命令列が壁にぶつからず
  ゴール到達＋全item回収になること（Issue #81・#98）
- `tutorial.repeatBox`はboolean（`groupRepeats`と同時`true`は不可）。`box`/`times`/`close`は`repeatBox`時のみ。
  `box`は開いている間に押せず、`times`/`close`は開いている間だけ、空の箱は`close`不可、
  箱を開いたままの`run`・`remove`は不可（Issue #139）
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
| `stage_clear` | 途中のplayステージのクリア（最終ステージ以外。Issue #104） |
| `clear` | レッスン達成（最終playステージのクリア） |
| `abandon` | 途中離脱 |

`logEvent(type, payload)` で `js/storage.js` 経由の localStorage（キー `steamkids.events`）へ
追記する。保存件数の上限は5000件で、超過時は古い順に破棄する（P2で実装）。

`run`イベントの`payload`は`commandCount`に加え、「1コマ」ボタンで開始した場合のみ`mode: "step"`を
持つ（じっこうの一括実行では`mode`キー無し。Issue #111）。

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

### セーブスロット（Issue #218）

1端末で最大3人が別々の進行を持つ。スロットごとに別プロファイル（別`learnerId`）・別イベント・別同期状態。

| キー | 単位 | 内容 |
| --- | --- | --- |
| `steamkids.slots` | 端末 | `{ active: 0〜2, occupied: [bool,bool,bool] }`。`active`は次回起動時に遊ぶスロット |
| `steamkids.{profile,events,sync}` / `steamkids.tutorialDone.<id>` | スロットA | 従来のキーをそのまま使う（移行コピー無し） |
| `steamkids.s2.*` / `steamkids.s3.*` | スロットB/C | Aと同じ構造 |
| `steamkids.guardian` / `gateDate` / `sound` | 端末 | スロットに依存しない |

- `steamkids.slots`が無い初回起動時、Aに旧profileがあり「events1件以上／`label`有り／`sync.enabled`」のどれかに当たれば`occupied[0]=true`。どれにも当たらない自動生成profileは空き扱いで、Aを作るとき既存`learnerId`を引き継ぐ
- `label`は最大10文字（コードポイント）・前後空白除去・空なら表示は「プレイヤーN」。表示は必ず`textContent`
- eventsを`learnerId`でのフィルタでなくスロット別キーに分ける理由：リンクコードの乗り換えで`learnerId`が変わっても旧イベントを見失わず、5000件上限を3人で共有しないため
