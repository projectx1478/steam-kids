# 盤面ギミック仕様

盤面（`play`・`tutorial`・`intro.demo`）に置くギミックの仕様。ギミックごとに1節。ギミックを足す時は
`docs/lesson-schema.md`ではなく本ファイルに1節を足す。各節は次の4項目で書く。

- JSONフィールド（型・既定・省略時の挙動）
- 移動規則（クリア判定への影響を含む）
- 描画（SVG・演出・ふりがな不要の短文）
- 数値条件（判定可能な数値。検証ツールで確認するもの）

追加手順・命名規則はPROJECT.md「ギミックの追加手順」。

## フックIF（js/gimmicks/<name>.js）

`js/gimmicks/index.js`のGIMMICKSへ登録するモジュールが持つフック（`js/engine-grid.js`・
`js/ui-grid.js`・`tools/validate-lessons.mjs`が呼ぶ。Issue #123）。

- `key`：状態を持つオブジェクトのキー名（文字列）
- `initState(spec)`：盤面specから初期状態を作る
- `enter(state, pos, spec)`：1手進んだ直後に呼ばれ、新しい状態を返す（不変更新。既存stateは書き換えない）
- `isCleared(state)`：このギミックがクリア条件を満たすか（BFSのゴール判定に使う）
- `stateKey(state)`：BFS（shortestSteps/shortestChips）の重複排除キー用の文字列
- `blocks?(state, pos, spec)`：（任意）posが通行不可なら真。壁と同様に動けない扱い（ドア・動く壁向け）
- `redirect?(state, pos, dir, spec)`：（任意）posへ入った直後に続けて移動する先`{pos, dir}`かnull。返り先が盤内・非壁・非`blocks`なら1マスとして`path`へ積み（同一`stepOwner`。`simulate`の`slid[i]`が真）、再度問う。連鎖は`cols*rows`回で打ち切り（滑り・ワープ向け）
- `validate(board, add, label)`：`tools/validate-lessons.mjs`のcheckBoardから呼ばれる盤面検証
- `render(cellCtx)`：`js/ui-grid.js`のrenderGridから呼ばれる描画。`{board, pixelFor, CELL, shapeSvg, …}`を受け取る

## items（どんぐり）

- JSONフィールド：`items`（任意・`{x, y}`の配列・既定`[]`）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：通過したマスのitemを回収する。クリアは「ゴール到達かつ全回収」。壁・他itemと座標重複不可
- 描画：個別要素で持ち、回収時に個体を消す（`js/ui-grid.js`）。未回収は`hintItems`で点滅
- 数値条件：`maxCommands`は全回収してゴールする最短手数（`groupRepeats`時はチップ数）以上

## ice（こおり）

- JSONフィールド：`ice`（任意・`{x, y}`の配列・既定`[]`）。`play`・`tutorial`・`intro.demo`で使える
- 移動規則：こおりのマスへ入ると、同方向へ次のマスへ滑る。こおりが続く限り滑り続け、最初の通常マス（ゴール含む）か壁・盤端の手前で止まる（最終位置で判定）。start上では滑らない。最初の1マスが壁・盤外なら`blockedAt`、滑走が壁・盤端で止まるのは`blockedAt`に入れない。`{dir, times}`は滑走後の位置から次の反復を行う
- 描画：該当セルに氷のSVGを重ね`data-ice="true"`を付ける。滑走は1マスずつの`path`として通常移動と同じく再生される（滑走中の1マスは効果音`slide`。`docs/learning-spec.md`）
- 数値条件：壁・start・goal・items・ice同士の重なり不可、盤外不可。滑ってゴールへ止まれない盤面は到達不能として検証NG

