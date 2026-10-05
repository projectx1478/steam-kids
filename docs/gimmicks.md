# 盤面ギミック仕様

盤面（`play`・`tutorial`・`intro.demo`）に置くギミックの仕様。ギミックごとに1節。ギミックを足す時は
`docs/lesson-schema.md`ではなく本ファイルに1節を足す。各節は次の4項目で書く。

- JSONフィールド（型・既定・省略時の挙動）
- 移動規則（クリア判定への影響を含む）
- 描画（SVG・演出・ふりがな不要の短文）
- 数値条件（判定可能な数値。検証ツールで確認するもの）

追加手順・命名規則・検証規則は末尾「追加手順・検証規則」。

## フックIF（js/gimmicks/<name>.js）

`js/gimmicks/index.js`のGIMMICKSへ登録するモジュールが持つフック（`js/engine-grid.js`・
`js/ui-grid.js`・`tools/validate-lessons.mjs`が呼ぶ。Issue #123）。

- `key`：状態を持つオブジェクトのキー名（文字列）
- `initState(spec)`：盤面specから初期状態を作る
- `enter(state, pos, spec)`：1手進んだ直後に呼ばれ、新しい状態を返す（不変更新。既存stateは書き換えない）
- `isCleared(state)`：このギミックがクリア条件を満たすか（BFSのゴール判定に使う）
- `stateKey(state)`：BFS（shortestSteps/shortestChips）の重複排除キー用の文字列
- `strip?(spec)`：（任意）このギミックを除いた盤面specを返す。`js/engine-generate.js`の解法関与チェック
  （`wallsMustMatter`と同様の最短手数比較。Issue #70）用
- `blocks?(state, pos, spec)`：（任意）posが通行不可なら真。壁と同様に動けない扱い（ドア・動く壁向け）。ギミックに`soft: true`があると、そのblocksに当たっても失敗（`blockedAt`）にならず手前で止まるだけ（クッション向け）
- `redirect?(state, pos, dir, spec)`：（任意）posへ入った直後に続けて移動する先`{pos, dir}`かnull。返り先が盤内・非壁・非`blocks`なら1マスとして`path`へ積み（同一`stepOwner`。`simulate`の`slid[i]`が真）、再度問う。連鎖は`cols*rows`回で打ち切り（滑り・ワープ向け）
- `onStep?({pos, spec, view, run})`：（任意）`createStepper`が1手進むたび（壁衝突を除く）に呼ぶUI更新用フック。`view.gimmickEls[key]`にrenderの戻り値が入る。`run`は実行1回ごとの作業領域。効果音名を返すと鳴らす（かぎ・ドアの開閉向け。Issue #62）
- `dead?(state)`：（任意）真ならその状態から二度とクリアできない。BFS（shortestSteps/shortestChips/shortestPath）はその遷移を捨てる（枝刈りのみ。最短手数は変わらない。paint向け。Issue #286）
- `validate(board, add, label)`：`tools/validate-lessons.mjs`のcheckBoardから呼ばれる盤面検証
- `render(cellCtx)`：`js/ui-grid.js`のrenderGridから呼ばれる描画。`{board, pixelFor, CELL, shapeSvg, …}`を受け取る

## items（どんぐり）

- JSONフィールド：`items`（任意・`{x, y}`の配列・既定`[]`）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：通過したマスのitemを回収する。クリアは「ゴール到達かつ全回収」。壁・他itemと座標重複不可
- 描画：個別要素で持ち、回収時に個体を消す（`js/ui-grid.js`）。未回収は`hintItems`で点滅
- 数値条件：`maxCommands`は全回収してゴールする最短手数（`groupRepeats`時はチップ数）以上

## ice（こおり）

- JSONフィールド：`ice`（任意・`{x, y}`の配列・既定`[]`）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：こおりのマスへ入ると、同方向へ次のマスへ滑る。こおりが続く限り滑り続け、最初の通常マス（ゴール含む）か壁・盤端の手前で止まる（最終位置で判定）。start上では滑らない。壁・盤外に当たったら（最初の1マスでも滑走の途中でも）失敗で`blockedAt`に入り、そこで実行停止。クッションに当たった場合は失敗にしない（`## cushion`）。`{dir, times}`は滑走後の位置から次の反復を行う
- 描画：該当セルに氷のSVGを重ね`data-ice="true"`を付ける。滑走は1マスずつの`path`として通常移動と同じく再生される（滑走中の1マスは効果音`slide`。`docs/learning-spec.md`）
- 数値条件：壁・start・goal・items・ice同士の重なり不可、盤外不可。滑ってゴールへ止まれない盤面は到達不能として検証NG

## cushion（クッション）

- JSONフィールド：`cushion`（任意・`{x, y}`の配列・既定`[]`）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：通行不可のマス（`blocks`＋`soft: true`）。歩きでも滑走でも、当たったらその手前で止まり、失敗にしない（`blockedAt`に入れず実行も止めない。命令1つは無駄になる）。`path`へは現在位置を重複で1つ積み、`simulate`の`bumped[i]`は偽。BFS（最短手数）は動けない手を遷移に採らない。壁・盤外は失敗（Issue #136）
- 描画：該当セルに丸い桃色のクッションSVGを重ね`data-cushion="true"`を付ける。当たると`view.bounce`＋効果音`cushion`（`docs/learning-spec.md`）で続行する
- 数値条件：壁・start・goal・items・ice・cushion同士の重なり不可、盤外不可。こおりの必須性検証（Issue #134）ではクッションも壁扱い

## keys（かぎとドア）

- JSONフィールド：`keys`・`doors`（任意・`{x, y, color}`の配列・既定`[]`）。color=`red`（まる）／`blue`（さんかく）。`play`・`tutorial`・`intro.demo`で使える。ドアには同色のかぎが必要
- 移動規則：かぎのマスへ入るとその色を持つ（消費しない）。未所持の色のドアは`blocks`で壁と同じ失敗（歩き・こおりの滑走とも`blockedAt`）。所持後は通れる。クリア条件は変えない。BFSは所持色を状態に含む
- 描画：かぎ・ドアのセルにSVGを重ね`data-key` / `data-door`（色）を付ける。色に加え形（まる／さんかく）でも区別する。かぎを取ると消え、同色のドアは`data-door-open="true"`（扉が脇に開き床が見える絵）になり`pickup`音が鳴る
- 数値条件：盤面は6×6以内。かぎ・ドアは壁・start・goal・items・ice・cushion・互いと重なり不可。対応するかぎの無いドア不可。ドアを壁扱い（かぎ無し）にして`maxCommands`以内に届くと検証NG（かぎの必須性）
- ギミック間の重なり規則：盤面の1マスに置けるギミックは1つ（壁・start・goal含む）

## switches（スイッチ）

- JSONフィールド：`switches`（任意・`[{x, y, targets: [{x, y}], mode?}]`・既定`[]`）。`targets`は最初は壁で、スイッチを踏むと通れる（へこんで床に埋まる）。静的`walls`とは別フィールド。`mode`は省略時`"open"`（`"open"`か`"close"`以外は検証NG）。`"close"`は逆に、踏むと`targets`に壁が出る（初期は床）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：スイッチのマスへ入ると、その`targets`が通れる（1回で固定・戻らない）。踏む前の対象は`blocks`で壁と同じ失敗（歩き・こおりの滑走とも`blockedAt`）。BFSは踏んだスイッチ番号を状態に含む
- AND：同じ座標を複数のスイッチが`targets`に持つと、全部踏むまで開かない（ORは非対応）
- close（壁が出る）：踏んだ後の`targets`が`blocks`で壁と同じ失敗。単独で使い、openとの併用・対象の共有（AND）は検証NG。対象が氷上は既存規則どおりNG。スイッチを無効化（スイッチ無し）した盤の最短より実際の最短が長くなければ検証NG（スイッチの罠の意味）。出現後にゴールへ届かないのはゴール到達可能性で検出。描画は初期が`data-switch-wall="off"`（床）、踏むと`"on"`（壁が立ち上がる。reduced-motion時は即時）
- 描画：スイッチ・対象のセルにSVGを重ね`data-switch`（番号）/`data-switch-pressed`、対象は`data-switch-wall="on"`（踏むと`"off"`。約0.5秒で縮小＋暗くなって沈み、フラットな床表示になる。reduced-motion時は即時）。踏むと`pickup`音
- 数値条件：盤面は6×6以内。`targets`は空不可。スイッチ・対象は壁・start・goal・items・cushion・keys・doors・互いと重なり不可（対象同士の共有のみ可）。iceはスイッチのみ重なり可（氷上スイッチは滑走中の通過で作動。対象は氷上不可）。対象を壁のまま（スイッチ無し）にして`maxCommands`以内に届くと検証NG（スイッチの必須性）

## paint（色ぬり）

- JSONフィールド：`paint`（任意・目標の模様＝塗るマスの`{x, y}`配列）。`play`・`intro.demo`で使える。全回収（items）は「全マスを通る」が目的、こちらは「通ってよいマス・いけないマス」を区別して形を作る
- 移動規則：通ったマス（startを含む）が塗られる。クリアは「ゴール到達かつ最後の塗り＝目標」（塗り残しも目標外を塗るのも失敗。同じマスの再通過は変化なし）。`simulate`の`unmet`に`'paint'`、`paintOver`に目標外のマスが入る。BFSは塗り集合を状態に含み、目標外を塗った状態は`dead`で捨てる
- 描画：塗ったマスに黄（amber-300）の全面＋白い丸のSVGを重ね`.grid-paint`（0.3秒でフェードイン。reduced-motion時は即時）。問い文の下に目標を同じ色・図形で小さく見せる「みほん」ミニ盤（`data-paint-sample`）。クリア時は「みほんと おなじ！」。失敗時は目標外のマスに枠を出すだけで、文言のヒントは出さない
- 数値条件：盤面は6×6以内。paint単独（壁のみ併用可。items・ice・cushion・warp・keys・doors・switches・repeatBox・groupRepeatsは検証NG）。目標は盤内・壁と重ならず重複なし・start/goalを含む。目標を外した（塗り無し）最短より塗りありの最短が長いこと、`maxCommands`＝最短ちょうど

## 何を1手と数えるか
- 1手＝コマ1つ分の移動。
  - 氷の滑走は、止まるまで全体で1手。
  - 壁にぶつかる手、クッションで止まる手も1手。
  - くりかえし（repeatBox）は、中身を展開した方向1つずつを1手。
  - 1コマ実行は、押した1回が1手。通常実行と同じ数え方になる。
- 手番は、周期ドアのある盤面だけで数える。周期ドアの無い盤面の最短手数・状態数・別解は変わらない。

## 手番カウンタの置き場所
- 手番は周期ドアのギミックが持つ。ほかのギミック（かぎ・スイッチ・クッション・こおり・ぬる）は手番を持たず、挙動も変えない。
- 手番は、1手の移動が終わった時点で1つ進む。氷の各マスに入るときには進めない。
- 滑走中のドアの開閉は、その手の開始時の手番で決まる。滑走の途中では変わらない。
- 盤面の状態として、手番を周期で割った余りを区別する。
- 周期ドアは、ぬる（paint）と併用しない。

## 周期ドア（実装は別Issue）
- 決まった手数ごとに開閉する。閉じたドアに入る手は壁と同じ失敗にする。失敗時の文言は実装Issueで決める。
- 待つ手段は初期は設けない。回り道で手番を合わせる盤面だけを出す。「まつ」ブロックは別Issue。
- 必須性：ドアを常に開とみなした最短手数が maxCommands 以下なら不合格。
- 初期は、正解手順が周期をまたぐくりかえしを含む盤面を不合格にする。解禁は「まつ」を入れるときに決める。
- 見せ方：ドア上のドットで開閉のタイミングを示す（案A）。ドットの色・数・位置は実装Issueで決める。半開きアニメ・音（案C）は保留（案Aの実機確認後に決める）。

## 追加手順・検証規則

- 盤面ギミックの追加：`js/gimmicks/<name>.js`＋登録1行＋本ファイルに1節＋`g-<name>-*.mjs`シナリオ（Issue #123以降）
- ギミックのシナリオは`routeLesson`（`.claude/verify/helpers.mjs`）のインライン最小盤面で書き、実レッスンに依存させない
- 新規シナリオの命名は`g-<gimmick>-*`・`les-<lessonId>-*`。`e2e-run`（`docs/testing-guidelines.md`）で部分実行できる
- こおりを持つplayステージは、こおりを壁扱いにしてもmaxCommands以内に届かないこと（`validate:lessons`が検証。Issue #134）
- playステージに`solution`（正解手順）を必ず書く。`clearLesson`が読み、検証ツールがクリアを確認する
- 設計Issueの引継ぎには「読むファイル（行範囲）／読まなくてよいファイル」を書く（実装者の探索を減らす）
