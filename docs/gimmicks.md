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
- `blocks?(state, pos, spec)`：（任意）posが通行不可なら真。壁と同様に動けない扱い（ドア・動く壁向け）。ギミックに`soft: true`（または盤面specを受けて真偽を返す関数`soft(spec)`。水向け）があると、そのblocksに当たっても失敗（`blockedAt`）にならず手前で止まるだけ（クッション向け）
- `redirect?(state, pos, dir, spec)`：（任意）posへ入った直後に続けて移動する先`{pos, dir}`かnull。返り先が盤内・非壁・非`blocks`なら1マスとして`path`へ積み（同一`stepOwner`。`simulate`の`slid[i]`が真）、再度問う。連鎖は`cols*rows`回で打ち切り（滑り・ワープ向け）
- `onStep?({pos, spec, view, run})`：（任意）`createStepper`が1手進むたび（壁衝突を除く）に呼ぶUI更新用フック。`view.gimmickEls[key]`にrenderの戻り値が入る。`run`は実行1回ごとの作業領域。効果音名を返すと鳴らす（かぎ・ドアの開閉向け。Issue #62）
- `dead?(state)`：（任意）真ならその状態から二度とクリアできない。BFS（shortestSteps/shortestChips/shortestPath）はその遷移を捨てる（枝刈りのみ。最短手数は変わらない。paint向け。Issue #286）
- `roll?(state, pos, dir, spec, isOpen)`：（任意）ロボットが pos へ dir 向きで入る直前に呼ぶ。pos に動かせるものが無ければ null。動かせないなら `{ ok: false }`（壁と同じ失敗。`simulate` の `rolls[i]` に `{ from, stuck: true }`）。動かせたら `{ ok: true, state, move: { from, to, fill } }`（新しい状態でロボットが pos へ入る。`rolls[i]` に move）。1手で動かせるのは1つ（転がす球向け。Issue #287）
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

## water（水）

- JSONフィールド：`water`・`bridge`（任意・`{x, y}`の配列・既定`[]`）、`waterMode`（任意・`"cushion"`（既定）か`"bump"`）。`play`・`tutorial`で使える（`intro.demo`は対象外）。`bridge`は描画専用（橋。動き・最短手数に影響しない）
- 移動規則：水は通行不可のマス（`blocks`）。`waterMode`が`"cushion"`なら`soft`になり、当たったら手前で止まり失敗にしない（`## cushion`と同じ。命令1つは無駄）。`"bump"`なら壁と同じ失敗（`blockedAt`・`bumped`）。壁・盤外は従来どおり失敗。BFS（最短手数）は動けない手を採らない
- 描画：水のセルに波のSVGを重ね`data-water="true"`、橋のセルに板橋のSVGを重ね`data-bridge="true"`・`data-bridge-dir`（`h`横／`v`縦。上下に水があれば横、左右に水があれば縦、それ以外は横）を付ける。隣り合うタイルは各辺2pxずつ広げて枠の色を見せずにつなげる。水で止まると`view.bounce(dir, 'water')`（水しぶき＋困り顔）と効果音`splash`
- 数値条件：水は盤内・重複不可で、壁・start・goal・items・ice・cushion・keys・doors・switches（targetsを含む）・paint・periodicと重ならない（併用自体は可）。橋は盤内・重複不可で、water・壁・cushion・doors・switches.targetsと重ならず、上下左右に水が1つ以上ある。`waterMode`は`"cushion"`/`"bump"`以外はNG、`water`が空のときの指定もNG
- stageGen：`water`は`warps`・`periodic`と併用できる（#649。1種制限は撤廃）。どんぐり・こおり・かぎ・クッション・スイッチとも併用できる。`paint`とも併用できる（`## paint`のstageGen参照）。壁`walls`は従来どおり併用可。`groupRepeats`・`repeatBox`とは併用不可。水マス数は2〜8。`waterMode`は入力にせず、`"cushion"`固定で出力する。水は連続した帯＋1マスの隙間（隙間が橋＝最短経路上）。橋は最短確定後、最短経路上で置けるときのみ置く（置けなければ橋なし）。`repeatBox`・`groupRepeats`は生成しない。`teach`は`gimmicks`に含めたギミックの1つを指定する（検査は`gimmicks`にあるかだけを見る）。`paint`と併用するときは`teach`に`water`も`paint`も指定できる。

## keys（かぎとドア）

- JSONフィールド：`keys`・`doors`（任意・`{x, y, color}`の配列・既定`[]`）。color=`red`（まる）／`blue`（さんかく）。`play`・`tutorial`・`intro.demo`で使える。ドアには同色のかぎが必要
- 移動規則：かぎのマスへ入るとその色を持つ（消費しない）。未所持の色のドアは`blocks`で壁と同じ失敗（歩き・こおりの滑走とも`blockedAt`）。所持後は通れる。クリア条件は変えない。BFSは所持色を状態に含む
- 描画：かぎ・ドアのセルにSVGを重ね`data-key` / `data-door`（色）を付ける。かぎは色マーカー（まる／さんかく）を持つ。ドアは鍵と同じ色で描き、ドア側にマーカーは付けない。かぎを取ると消え、同色のドアは`data-door-open="true"`（扉が脇に開き床が見える絵）になり`pickup`音が鳴る
- 数値条件：盤面の大きさは盤面共通の20×20以内。かぎ・ドアは壁・start・goal・items・ice・cushion・互いと重なり不可。対応するかぎの無いドア不可。ドアを壁扱い（かぎ無し）にして`maxCommands`以内に届くと検証NG（かぎの必須性）
- `keyMode`（盤の任意項目・Issue #391）：`"remote"`＝かぎのマスへ入った瞬間に同色のドアが開く（上の移動規則・描画）／`"carry"`（省略時）＝かぎを取ってもドアは閉じたままで、同色のドアのマスへ入ったときに開く。どちらでも通れるか・最短手数・必須性の判定は同じで、違うのは見た目と開くタイミングだけ
- `carry`の表示：持っているかぎは盤面の上の補助行の「かぎトレイ」に並ぶ。盤面にある色の数だけ空き枠を最初から出し、取った色の枠が埋まる（タップ不要）。持っていない色のドアに当たるとドアの前で止まり、その色の空き枠が一瞬ゆれる。ドアは色だけで見分ける（形の印は付けない）。トレイの分だけ盤面が縮む（縦向き360pxの5x3盤でマスが60pxから50px）
- ギミック間の重なり規則：盤面の1マスに置けるギミックは1つ（壁・start・goal含む）

## switches（スイッチ）

- JSONフィールド：`switches`（任意・`[{x, y, targets: [{x, y}], mode?}]`・既定`[]`）。`targets`は最初は壁で、スイッチを踏むと通れる（へこんで床に埋まる）。静的`walls`とは別フィールド。`mode`は省略時`"open"`（`"open"`・`"close"`・`"toggle"`のいずれか。それ以外は検証NG）。`targets`の要素は`{x, y, initial?}`（`initial`は`toggle`のみ有効）。`"close"`は逆に、踏むと`targets`に壁が出る（初期は床）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：スイッチのマスへ入ると、その`targets`が通れる（1回で固定・戻らない）。踏む前の対象は`blocks`で壁と同じ失敗（歩き・こおりの滑走とも`blockedAt`）。BFSは踏んだスイッチ番号を状態に含む
- AND：同じ座標を複数のスイッチが`targets`に持つと、全部踏むまで開かない（ORは非対応）
- `switches[].color`：`"red"`｜`"blue"`。省略可。省略時はその盤面の`switches`の添字順に red, blue, red, blue…
- 印：スイッチは色マーカー（red＝まる、blue＝さんかく）を持ち、対応するスイッチ壁の上面にも同じ印が載る。複数のスイッチが同じ壁を対象にするとき（AND）は印を2つ並べる（1つの壁を対象にできるスイッチは2つまで）
- スイッチ壁は立体の壁で、ON（立っている）と OFF（沈んで床と同じ高さ）を浮き沈みで表す。浮き沈みにはアニメーションを付け、`prefers-reduced-motion`では即時に切り替える
- エディタ設定項目：位置・対象の壁・（任意）色。色を省略すると添字順に割り当てられる。保存時に`color`を明示してよい
- close（壁が出る）：踏んだ後の`targets`が`blocks`で壁と同じ失敗。open・toggle とも同じ盤で併用できる（mode の混在可。どれか1つが壁なら壁）。対象の共有（AND）は、close が添字の後ろのスイッチと重ねる場合に検証NG（先に書いた open と後ろの close の組は検査を通るが、エディタは選べなくする）。対象が氷上は既存規則どおりNG。スイッチを無効化（スイッチ無し）した盤の最短より実際の最短が長くなければ検証NG（スイッチの罠の意味）。mode が混在した盤では、スイッチごとに「そのスイッチだけを外した盤」で、そのスイッチの mode の検査（close は罠の意味、open は必須性、toggle は必須性とトグルの意味）を行う。出現後にゴールへ届かないのはゴール到達可能性で検出。描画は初期が`data-switch-wall="off"`（床）、踏むと`"on"`（壁が立ち上がる。reduced-motion時は即時）
- toggle（踏むたびに入れ替わる）：スイッチのマスへ入るたびに、`targets`すべての開閉が入れ替わる（奇数回で入れ替わった状態、偶数回で初期状態。留まっても数えない）。`initial`は`"closed"`（壁が立っている。省略時）｜`"open"`（最初から通れる）で、壁ごとに混在できる。1つの toggle が複数の壁を動かしてよい。`initial`が`toggle`以外の`targets`にある、または上記2語以外はNG。踏まれた回数の奇偶は`stateKey`（BFS）の状態に含む
- mode の混在（#530）：同じ盤で open・close・toggle を混ぜてよい。1つの壁を複数のスイッチが対象にするときは「どれか1つが壁なら壁」（エンジン規則は変わらない）。描画は判定と同じ述語から再計算するため、見た目と判定が一致する。混在盤は「踏んで試す」題材でエディタ限定（レッスンには出さない。#530-1A）。印は従来どおり（AND 印は最大2）。
- `group`（スイッチの任意項目）：同じ`group`の`groupWalls`（盤面トップの`[{x, y, group}]`）すべてを、そのスイッチを踏むと通れるようにする。`targets`とは同時に書けない（どちらか一方）。省略すると従来の`targets`方式。`switches[].color`は見た目の印のままで、連動のキーではない
- `group`の制約（検証NG）：同じ`group`のスイッチは1枚の盤に1つだけ（同じ`group`のスイッチは`color`を明示する。省略時は添字順の自動割り当てで別の組と色がそろうことがあるため）。`group`と`targets`の併用／対応する`groupWalls`が無い`group`／対応するスイッチが無い`groupWalls`の`group`／`groupWalls`が壁・start・goal・他のギミックと重なる
- 読み込み時に`group`を`targets`に展開してから既存のスイッチと同じ扱いにする。エディタ設定項目：スイッチの位置・色・`group`、壁の位置・`group`（同じ`group`を選ぶとスイッチと壁が対応する）
- toggle の併用禁止（検証NG）：toggle と open／close は同じ盤に混ぜてよい（mode の混在可）。toggle の`targets`が他のスイッチの`targets`と重なる（前後どちらでも。同じ壁を複数のスイッチで共有しない）、対象が周期ドア・鍵の扉・水・クッション・氷と重なる、スイッチが氷・クッションの上にある、は検証NG。toggle の壁は AND にしない。
- toggle の必須性と意味：スイッチを踏まない盤（closed の壁だけ壁、open の壁は床）で`maxCommands`以内に届くと検証NG（必須性。全部`open`の toggle はここで落ちる）。さらに、closed の壁を`mode:"open"`、open の壁を常時床に置き換えた盤の最短より、toggle の最短が厳密に長くなければ検証NG（トグルの意味。1回踏んで通るだけの盤は不可で、奥へ行って戻る＝もう1回踏む構造にする）
- toggle の描画：レバーは偶数回（初期含む）で直立、奇数回で右に倒れる（踏んだ回数の数字は出さない）。対象は`data-switch-wall="on"`（立っている）／`"off"`（沈んでいる）が踏むたびに入れ替わり、約0.5秒の浮き沈み。連続で踏んだときは前のアニメを最終状態に揃えてから次を始める。沈んだ壁には床の上に点線の輪郭（色 #7c6338・不透明度0.6・線幅約2.4px・破線）を残し、「また立つ」ことを示す。reduced-motion時は即時
- toggle の生成：stageGen は toggle を生成しない（手書きの盤のみ。新しいレッスンは devOnly から）
- エディタ設定項目（toggle。E6 向け）：スイッチの位置・対象の壁（複数可）・各壁の初期状態（`closed`／`open`。既定`closed`）・（任意）色。モードで`toggle`を選ぶと、氷・クッションの上への配置と、対象を他のスイッチと共有することは選べない。他のスイッチと mode が違ってもよい。保存時に`initial`を明示してよい
- 描画：スイッチ・対象のセルにSVGを重ね`data-switch`（番号）/`data-switch-pressed`、対象は`data-switch-wall="on"`（踏むと`"off"`。約0.5秒で縮小＋暗くなって沈み、フラットな床表示になる。reduced-motion時は即時）。踏むと`pickup`音
- 数値条件：盤面の大きさは盤面共通の20×20以内。`targets`は空不可。スイッチ・対象は壁・start・goal・items・cushion・keys・doors・互いと重なり不可（対象同士の共有のみ可）。iceはスイッチのみ重なり可（氷上スイッチは滑走中の通過で作動。対象は氷上不可）。対象を壁のまま（スイッチ無し）にして`maxCommands`以内に届くと検証NG（スイッチの必須性）

## paint（色ぬり）

- JSONフィールド：`paint`（任意・目標の模様＝塗るマスの`{x, y}`配列）。`play`・`intro.demo`で使える。全回収（items）は「全マスを通る」が目的、こちらは「通ってよいマス・いけないマス」を区別して形を作る
- 移動規則：通ったマス（startを含む）が塗られる。クリアは「ゴール到達かつ最後の塗り＝目標」（塗り残しも目標外を塗るのも失敗。同じマスの再通過は変化なし）。`simulate`の`unmet`に`'paint'`、`paintOver`に目標外のマスが入る。BFSは塗り集合を状態に含み、目標外を塗った状態は`dead`で捨てる
- 描画：塗ったマスに黄（amber-300）の全面＋白い丸のSVGを重ね`.grid-paint`（0.3秒でフェードイン。reduced-motion時は即時）。補助行に目標を同じ色・図形で小さく見せる「みほん」ミニ盤（`data-paint-sample`）。クリア時は「みほんと おなじ！」。失敗時は目標外のマスに枠を出すだけで、文言のヒントは出さない
- 数値条件：盤面の大きさは盤面共通の20×20以内。他のギミック・repeatBox・groupRepeatsと併用できる（#529。併用盤はエディタ限定でレッスンには出さない）。目標は盤内・壁・水・氷と重ならず重複なし・start/goalを含む（目標×氷の同じマスは検証NG）。目標を外した（塗り無し）最短より塗りありの最短が長いこと、`maxCommands`＝最短ちょうど。必須性の判定で、ドア・ワープの穴など壁にして外すマスは、ぬりの目標から除いて再判定する（目標に残すと外した盤が解けず「必須」と誤判定するため）
- stageGen：`paint`は他のギミックと併用できる（#649。単独制限は撤廃）。`water`との併用では、目標は水マスに置かず橋の1マスを通る。items・ice・keys・cushion・switches・warps・periodicとの併用では、目標は他のギミックのマスを踏まず、塗りを外すと最短が縮む経路にする。壁`walls`は従来どおり併用可。`groupRepeats`・`repeatBox`とは併用不可。併用では成功率が下がることがある（実測は`## 併用の実測`）。目標マス数は4〜8。目標はstartからの細い経路型（2×2などの塊は作らず、末端をgoalにする）。`repeatBox`・`groupRepeats`は生成しない。`teach`の規則は`## water`のstageGenのとおり。

## warps（ワープ）

- JSONフィールド：`warps`（任意・`{x, y, pair}`の配列・既定`[]`）。`pair`は1か2。同じ`pair`の穴がちょうど2個で1組。組は最大2。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：穴のマスへ入ると、同じ`pair`のもう一方の穴へ移って止まる（向きは変えない）。同じ手の中では出口から再ワープしない。後の手で出口へ入ると、逆向き（元の入口）へワープする。ワープ自体は手数に数えない（`## 何を1手と数えるか`）。状態を持たず、クリア条件は変えない（`redirect`フックの`end: true`）
- 描画：穴のセルにうずまきのSVGを重ね`data-warp`（組の番号 1|2）・`data-mark`（`star`＝1組目・`square`＝2組目）を付ける。色は組ごとに紫・橙で、形（★■）でも見分けがつく
- 数値条件：盤面の大きさは盤面共通の20×20以内。穴は盤内・整数で、壁・start・goal・items・cushion・water・bridge・keys・doors・switches（targetsを含む）・groupWalls・穴同士・ice・periodicと重ならない（同じマスの重なりは検証NG）。ice・paint・periodicとは別のマスなら併用できる（#529。併用盤はエディタ限定でレッスンには出さない）。ぬりの目標が穴に当たる盤は、必須性の判定で穴を目標から除いて再判定する。stageGenでは`warps`は`periodic`・`water`・`paint`・どんぐり・こおり・かぎ・クッション・スイッチ・壁`walls`と併用できる（#649。1種制限・paint の併用不可は撤廃）。入口・出口は土台の橋の上に置かない。`groupRepeats`・`repeatBox`とは併用不可（検証NG）

## rollBalls（たま・おとし穴）
- JSONフィールド：`rollBalls`（任意・`{x, y}`の配列・既定`[]`。たまの初期位置）、`pits`（任意・`{x, y}`の配列・既定`[]`。おとし穴）。`play`だけで使える（`tutorial`・`intro.demo`は対象外）
- 移動規則：ロボットが進む先にたまがあれば同じ向きへ1マス転がし、ロボットはそのマスへ入る（1手）。たまは1マスで止まる（こおりのように滑り続けない）。転がし先が埋まっていないおとし穴ならたまは穴に埋まって消え、穴は床と同じになる。転がし先が盤外・壁・他のたまなら動かせず、壁と同じ失敗（`blockedAt`・`bumped`）。1手で動かせるのは1つ。埋まっていないおとし穴へ入る手も壁と同じ失敗。クリア条件は変えない（穴を全部埋めなくてよい）。BFSはたまの位置と埋まった穴を状態に含む
- 描画：たまは茶〜橙の球（影・縫い目の模様・ハイライト。壁より小さめ）で`data-roll-ball`（添字）。おとし穴は暗い楕円のくぼみで`data-pit`（添字）、埋まると`data-pit-filled="true"`（縁の中にたまの上半分が見える絵）。転がすとロボットと同じ時間でたまが1マス動きながら回転し（1マス180度。影とハイライトは回さない）、穴に入ると0.3秒で沈んで埋まった穴に替わる。動かせないとたまが小さく震え、ロボットは手前で止まる（`view.bounce(dir, 'ball')`。目回し星なし・文字なし）。音は`step`。reduced-motion時は回転・沈み・震えを省いて即時
- 数値条件：盤面の大きさは盤面共通の20×20以内。たまは1〜2個、おとし穴は1個以上たまの数以下（片方だけはNG）。盤内・整数・重複なしで、壁・start・goal・互いと重ならない。併用できるのはitems・cushion・bridge・paint・keys・doors・water・`repeatBox`・`groupRepeats`。ice（1手に同じたまを2回押す）・warps（出口でたまを押す・1手に2球動く）・switches・groupWalls・periodic（転がしたあとそのマスが壁になり、たまだけ動く）は同じ盤に置けない（検証NG）。たま・おとし穴をwater・doors・cushionのマスに重ねるとNG。たまを外しおとし穴を壁にした盤で`maxCommands`以内に届くと検証NG（転がす球の必須性）。startから届く状態のうち、ゴールへ二度と着けない状態（詰み）が1つでもあると検証NG（詰みの検査。探索は5万状態で打ち切り、打ち切りもNG）。詰みを許す盤（罠盤）は作らない（別Issueで検討）
- stageGen：対象外（生成しない）

## 何を1手と数えるか
- 1手＝コマ1つ分の移動。
  - 氷の滑走は、止まるまで全体で1手。
  - 壁にぶつかる手、クッションで止まる手も1手。
  - たまを転がす手は1手。動かせない手も1手（壁にぶつかる手と同じ）。
  - ワープは数えない（穴へ入る手の中で出口へ移る。移動した分を別に1手と数えない）。
  - くりかえし（repeatBox）は、中身を展開した方向1つずつを1手。
  - 1コマ実行は、押した1回が1手。通常実行と同じ数え方になる。
- 手番は、周期ドアのある盤面だけで数える。周期ドアの無い盤面の最短手数・状態数・別解は変わらない。

## 手番カウンタの置き場所
- 手番は周期ドアのギミックが持つ。ほかのギミック（かぎ・スイッチ・クッション・こおり・ぬる）は手番を持たず、挙動も変えない。
- 手番は、1手の移動が終わった時点で1つ進む。氷の各マスに入るときには進めない。
- 滑走中のドアの開閉は、その手の開始時の手番で決まる。滑走の途中では変わらない。
- 盤面の状態として、手番を周期で割った余りを区別する。
- 周期ドアは、ぬる（paint）と併用できる（#529。併用盤はエディタ限定）。手番は周期ドアだけが持つので、ぬりの挙動は変わらない。

## 周期ドア（実装は別Issue）
- JSONフィールド：`periodic`（任意・`{x, y, period}`の配列・既定`[]`）。`period`は2・3・4のみ。開閉の形は固定で、手番0から数え、開の手番が先頭。周期2＝開1・閉1、周期3＝開1・閉2、周期4＝開2・閉2。`open`フィールドは無い（指定すると検証NG）。
- 決まった手数ごとに開閉する。手の開始時の手番を`period`で割った余りが開の手番数より小さければ通れる。閉じたドアに入る手は壁と同じ失敗にする。失敗時の文言は「ドアが しまって いたよ」。
- 待つ手段は初期は設けない。回り道で手番を合わせる盤面だけを出す。「まつ」ブロックは別Issue。
- 必須性：ドアを常に開とみなした最短手数より、実際の最短手数が長くなければ不合格。
- 周期ドアのある盤面でrepeatBoxは使えない（箱の展開が手番の周期をまたぐため。検証NGのまま）。groupRepeatsとは併用できる（#529。併用盤はエディタ限定）。ワープ・氷など他のマスと同じマスには置けない（重なりは検証NG。ワープとの重なりも含む）。
- 盤面の大きさは盤面共通の20×20以内。
- stageGen：`periodic`は`warps`・`water`・`paint`・どんぐり・こおり・かぎ・クッション・スイッチ・壁`walls`と併用できる（#649。1種制限・paint の併用不可は撤廃）。周期ドアは土台の橋の上に置かない。`groupRepeats`・`repeatBox`とは併用不可。ドア数は1〜2、生成する`period`は3・4のみ（2は生成しない）。
- 見せ方：ドアの下端に、周期の数だけドットを横一列に並べ、開閉のタイミングを示す。左から手番0。色は周期2＝青・赤、周期3＝青・黄・赤、周期4＝青・青・黄・赤（青＝開、黄・赤＝閉）。青は#0072B2、黄は#F0E442（濃い縁つき）、赤は#D55E00。現在の手番は黒の太縁で示す。色だけに頼らず形でも区別する（青は塗りの丸●、黄は塗りの三角▲、赤は塗りの四角■）。半開きアニメ・音は保留（実機確認後に決める）。

## エディタ自動判定の見込み（#400 向け・#389 の測定）

- 盤面の上限は盤面共通の20×20（`checkBoard`・`checkDemo`）。20×20の重い盤面での最短手数の探索（`analyze-board` の `solve` 部分）は、keys・switches・periodic・paint の4本とも0.31秒以下（paint 209手・11175状態で0.31秒が最長）
- paint は目標のマスが太い（多い）と探索が重い。現行の6×6でも4×4を塗る盤で約6秒かかる。エディタの自動判定は Web Worker で行うか、編集が止まってから判定する
- 別解の数え上げ（`countAlternatives`）は20×20では30〜60秒でも終わらない。扱いは #394

## 追加手順・検証規則

- 盤面ギミックの追加：`js/gimmicks/<name>.js`＋登録1行＋本ファイルに1節＋`g-<name>-*.mjs`シナリオ（Issue #123以降）
- 新しいギミックのオブジェクトには`label`（開発者向けの短い日本語名）を必ず付ける
- ギミックの`label`は`validate(board, add, label)`の引数`label`（文言の接頭辞）とは別物
- ギミックのシナリオは`routeLesson`（`.claude/verify/helpers.mjs`）のインライン最小盤面で書き、実レッスンに依存させない
- 新規シナリオの命名は`g-<gimmick>-*`・`les-<lessonId>-*`。`e2e-run`（`docs/testing-guidelines.md`）で部分実行できる
- こおりを持つplayステージは、こおりを壁扱いにしてもmaxCommands以内に届かないこと（`validate:lessons`が検証。Issue #134）
- playステージに`solution`（正解手順）を必ず書く。`clearLesson`が読み、検証ツールがクリアを確認する
- 設計Issueの引継ぎには「読むファイル（行範囲）／読まなくてよいファイル」を書く（実装者の探索を減らす）

## 併用禁止の棚卸し（#649 段2）

stageGen（たたき台）と盤の検証にある併用禁止を3つに分けた。行番号は段1（4d2b455）時点。(3) は段3（#649）で撤廃した。

### (1) 技術的に不可能・(2) ルール上不可能（撤廃しない）

| 区分 | 禁止 | 理由 | 場所 |
|---|---|---|---|
| (1) | stageGen は `repeatBox`・`groupRepeats` を生成しない | 生成器が箱・まとめ繰り返しの命令列を扱わない（最短・別解の数え方が違う） | `docs/gimmicks.md:59,100,132` |
| (1) | `periodic`×`repeatBox` | 箱の展開が手番の周期をまたぐため | `js/gimmicks/periodic.js:177-179` |
| (2) | 同じマスに複数のギミックを置く（ワープ・壁・start・goal ほか） | 1マスに置けるギミックは1つ | `tools/lib/validate/board.mjs:83-106` |
| (2) | 土台（`base`）×`water` | 水を土台と `gimmicks.water` の二重に定義することになる | `tools/editor/serve.mjs:221`（`checkGenerateBase`） |
| (2) | `group`×`targets`（同じスイッチ） | 連動のキーが二重になる（どちらか一方） | `tools/editor/editor-view.js:132` |
| (2) | `rollBalls`・`pits`×ice・warps・switches・groupWalls・periodic | ice・warps・switches・groupWalls・periodic は禁止（理由は検証NGの文言）。items・cushion・bridge・paint・keys・doors・water・repeatBox・groupRepeats は併用可（water・doors・cushion のマスには重ねない） | `js/gimmicks/rollballs.js`（`validate`） |

### (3) 撤廃（段3で撤廃済み）

- `warps`・`periodic`・`water` の1種制限（`SG_ONE_OF_GIMMICKS`）: `tools/lib/validate/stagegen.mjs:14,86`、`tools/editor/editor-view.js:176`、`tools/editor/index.html:97,99`
- 土台の水×`warps`・`periodic`: `tools/editor/serve.mjs:255-256`、`tools/editor/editor-view.js:255`
- `paint` 単独（`SG_SOLO_GIMMICKS`・`SG_SOLO_EXCEPT`）: `tools/lib/validate/stagegen.mjs:10-12`、`tools/editor/editor-view.js:172-174,251`。盤の規則は併用を許す（上の `## paint`・`## warps`）

### 実測した結果（理由の記述が無かったもの）

- `switches`×`keys`: 撤廃した（実測は下の表。返った盤は全て必須）
- `warps`×`paint` の検証NG（`## warps` の数値条件）: 記述を直した（盤の規則は別マスなら併用でき、stageGen も併用を許す）
- `cushion` を `teach` にするとき `ice` が要る規則（`tools/lib/validate/stagegen.mjs`）: 撤廃しない。氷を足さない盤（6×6・seed 1〜200）でもクッションの必須性は200/200で成り立つので技術的には外せるが、設計（#649 の検査例 N4）で「クッションを教える盤には氷を併用する」を残すと決めた。外すかは別の判断
- 土台×`paint`（`tools/editor/serve.mjs` の `checkGenerateBase`）: 撤廃しない。実測の対象外で、土台で決まる欄（水・色ぬり）は選べない仕様のまま（#631）

### 生成しない・撤廃対象外・理由未確認

- `repeatBox`×`groupRepeats`（`tools/lib/validate/lesson.mjs:152-153`）。実測しても生成しないので撤廃の対象外。禁止の理由は未確認

## 併用の実測（#649 段3）

撤廃した併用を stageGen（`generateBoard`）で seed 1 から最大200まで回した目安。成功＝盤が返った／無＝候補なし（400回の再試行で受理できず）／中止＝探索量の上限（`GEN_ABORTED`）。必須＝返った全盤で、入っている全ギミック（`items`・`ice`・`keys`・`switches`・`cushion`・`warps`・`periodic`・`paint`・土台でない`water`）を個別に外すと最短が伸びる割合と、盤検査（`checkBoard`）に通る割合。成功率・時間は撤廃の可否に使わず、目安として残す。

- 条件：最短手数 6×6=4〜12・10×10=6〜25・20×20=10〜50、かべ 6×6=1〜4・10×10=3〜10・20×20=10〜30、曲がる回数の下限1。ギミック数は warps 1〜2（土台水+warps のみ。ほかは1）・periodic 1・paint 4〜6・items 1〜2・keys 1・switches 1。「items4+keys2+switches2+warps2」は各個数固定。土台の水は盤の中段を横切る川（隙間が1か所。橋あり＝その隙間に橋、なし＝橋なし）。
- 時間：1シードの時間の最大。1組み合わせあたり30秒を超えたら打ち切り、その時点の seed 数を「n seed」と書いた（20×20 と重い組み合わせは200に届かない）。
- 必須の判定は生成側の判定と同じ関数（`tools/lib/must-matter.mjs`・`mattersFor`）を使う。生成器が通した盤を同じ物差しで再確認したもので、別の物差しではない。

| 組み合わせ | 6×6 | 10×10 | 20×20 |
|---|---|---|---|
| base-water+warps | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.1s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.6s、必須100% |
| base-water+warps-nobridge | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.1s、必須100% | 196 seed: 成功100%/無0%/中止0%、最大0.9s、必須100% |
| base-water+periodic | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 122 seed: 成功100%/無0%/中止0%、最大1.1s、必須100% |
| base-water+periodic-nobridge | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.9s、必須100% |
| base-water+warps+periodic | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.1s、必須100% | 159 seed: 成功100%/無0%/中止0%、最大1.2s、必須100% |
| warps+periodic | 200 seed: 成功100%/無0%/中止0%、最大0.0s、必須100% | 200 seed: 成功100%/無0%/中止0%、最大0.3s、必須100% | 115 seed: 成功100%/無0%/中止0%、最大1.2s、必須100% |
| paint+items | 8 seed: 成功0%/無100%/中止0%、最大4.7s、必須— | 2 seed: 成功0%/無0%/中止100%、最大16.3s、必須— | 1 seed: 成功0%/無0%/中止100%、最大30.8s、必須— |
| paint+keys | 80 seed: 成功0%/無100%/中止0%、最大0.5s、必須— | 25 seed: 成功0%/無100%/中止0%、最大2.0s、必須— | 9 seed: 成功0%/無0%/中止100%、最大5.0s、必須— |
| paint+warps | 46 seed: 成功0%/無100%/中止0%、最大0.9s、必須— | 23 seed: 成功0%/無0%/中止100%、最大2.1s、必須— | 31 seed: 成功0%/無0%/中止100%、最大1.5s、必須— |
| paint+periodic | 69 seed: 成功0%/無100%/中止0%、最大0.6s、必須— | 58 seed: 成功0%/無0%/中止100%、最大1.0s、必須— | 85 seed: 成功0%/無0%/中止100%、最大0.7s、必須— |
| keys+switches | 200 seed: 成功100%/無0%/中止0%、最大0.5s、必須100% | 32 seed: 成功88%/無13%/中止0%、最大2.7s、必須100% | 5 seed: 成功0%/無100%/中止0%、最大8.6s、必須— |
| items4+keys2+switches2+warps2 | 7 seed: 成功0%/無0%/中止100%、最大6.2s、必須— | 4 seed: 成功0%/無0%/中止100%、最大12.4s、必須— | 4 seed: 成功0%/無0%/中止100%、最大10.8s、必須— |

読み取り：
- 土台の水+warps／periodic、warps+periodic、水+warps+periodic は、20×20 まで成功率100%・最大約1.2秒。返った盤は全て必須で、盤検査にも通る。
- keys+switches は 6×6 で100%、10×10 で約9割。20×20 は5 seed で成功なし（最大8.6秒）。
- 色ぬり+items／keys／warps／periodic、items4+keys2+switches2+warps2 は、この条件では盤が返らない（0%）。色ぬりは目標の末端が goal に置き換わるため、先に置いたギミックが必須でなくなる（main でも paint+keys は返った200盤の全てで keys が必須でなかった）。必須性を落として通すことはしない。探索が重い組み合わせは 10×10 で1シード十数秒、20×20 で30秒かかり、エディタでは「重すぎて途中で止めた」または「条件に合う盤が出なかった」になる。
- 撤廃しなかったもの：`cushion` の teach に `ice`（上の棚卸しの理由）、土台×`paint`、`repeatBox`×`groupRepeats`。
- 実行時間（`test:unit:core`・`test:unit:generate`、main と交互に測定）：generate 段は main 比 約1.03（114.4秒→117.8秒。3回の中央値）、core 段は約1.04（2回。1回目の main は土台のファイルが不足で無効）。合計は約1.03。許容（generate 段 ≤1.25・合計 ≤1.15）の内。generate 段のテストは `tools/gen/stage-gen.mjs` を通らないため、差は誤差の範囲。
