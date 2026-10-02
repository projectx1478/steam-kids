# 難易度一覧（自動生成・一度だけ）

`lessons/*.json`と`js/engine-grid.js`の`shortestSteps`／`shortestChips`から生成した静的な表。レッスン追加・変更後は自動更新されない（再生成が必要）。
並びは`lessons/index.json`の単元順（＝段階解放の順。各単元は`lessonIds`→`practiceIds`→`devOnlyIds`）。

## 読み方
- 操作モデル: 現行の全レッスンは計画型（PROJECT.md「操作モデル」の表で、プログラミング・てこは計画型）。**直接操作型のレッスンは現状ゼロ**。
- 最短: 壁・ギミックを考慮した最短手数（まとめ命令ありのレッスンは最短チップ数）。`maxCommands`は上限で、最短とは別。
- 「なおす」は初期列から直す箇所の数を示し、盤面の最短は参考値。くりかえしの箱は最短をBFSで求めず、`solution`の箱数と展開手数を示す。
- シーソー（predict-slider）は最短手数の定義がなく、正解の置き位置を示す。
- ステージごとの最短手数は同一レッスン内で非減少（`ui-rules.md`・#104）。レッスンをまたぐ最短手数の増加は保証されない。

### 1. cmd-01-susumu（めいれいでうごかす）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 3×3 | 0 | なし | 4手 | maxCommands=6 |
| p2 | 4×4 | 1 | なし | 6手 | maxCommands=8 |
| p3 | 5×5 | 4 | なし | 8手 | maxCommands=10 |

### 2. cmd-02-mijikaku（めいれいでうごかす）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 3×4 | 0 | まとめ(×N) | 2チップ | maxCommands=3 |
| p2 | 3×6 | 0 | まとめ(×N) | 2チップ | maxCommands=3 |
| p3 | 4×5 | 2 | まとめ(×N) | 3チップ | maxCommands=4 |

### 3. cmd-03-naosu（めいれいでうごかす）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 3×3 | 0 | なおす(初期列あり) | 直す1か所（初期列3手） | 盤面の最短は2手 |
| p2 | 4×4 | 0 | なおす(初期列あり) | 直す1か所（初期列4手） | 盤面の最短は3手 |
| p3 | 5×5 | 0 | なおす(初期列あり) | 直す1か所（初期列9手） | 盤面の最短は8手 |

### 4. cmd-06-practice（めいれいでうごかす／れんしゅう）
- 操作モデル: 計画型／型: grid-runtime／ステップ: seedPick→play→summary／ステージ数: 1／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×5（シード生成） | 3〜6 | なし | 6〜10手 | 毎回異なる盤面。minTurns=2 |

### 5. cmd-04-kurikaeshi（めいれいでうごかす／開発者画面のみ・子どもの動線外）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 3×3 | 0 | くりかえしの箱 | solution: 箱1個・展開4手 | maxCommands=3 |
| p2 | 5×5 | 0 | くりかえしの箱 | solution: 箱1個・展開8手 | maxCommands=4 |
| p3 | 5×4 | 0 | くりかえしの箱 | solution: 箱2個・展開7手 | maxCommands=5 |

### 6. cmd-05-kurikaeshi-donguri（めいれいでうごかす／開発者画面のみ・子どもの動線外）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 0 | どんぐり3・くりかえしの箱 | solution: 箱1個・展開4手 | maxCommands=3 |
| p2 | 5×4 | 0 | どんぐり2・くりかえしの箱 | solution: 箱1個・展開6手 | maxCommands=4 |

### 7. donguri-01-hirou（どんぐりひろい）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 3×3 | 0 | どんぐり1 | 4手 | maxCommands=6 |
| p2 | 4×4 | 0 | どんぐり2 | 6手 | maxCommands=8 |
| p3 | 5×5 | 0 | どんぐり3 | 8手 | maxCommands=10 |

### 8. donguri-02-mawarimichi（どんぐりひろい）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×5 | 2 | どんぐり2 | 6手 | maxCommands=8 |
| p2 | 5×5 | 3 | どんぐり2 | 8手 | maxCommands=10 |
| p3 | 6×6 | 5 | どんぐり2 | 9手 | maxCommands=11 |

### 9. ice-01-suberu（こおりですべる）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 4 | こおり3 | 4手 | maxCommands=6 |
| p2 | 5×4 | 4 | こおり2 | 4手 | maxCommands=6 |

### 10. ice-02-kabe（こおりですべる）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×4 | 2 | どんぐり1・こおり3・クッション1 | 4手 | maxCommands=5 |
| p2 | 5×4 | 5 | どんぐり1・こおり3・クッション1 | 6手 | maxCommands=7 |

### 11. key-01-kagi（かぎと ドア）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 2 | かぎ1・ドア1 | 6手 | maxCommands=8 |
| p2 | 5×3 | 2 | かぎ1・ドア1 | 8手 | maxCommands=10 |

### 12. key-02-iro（かぎと ドア）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 4 | かぎ2・ドア2 | 8手 | maxCommands=10 |
| p2 | 4×4 | 6 | かぎ2・ドア2 | 9手 | maxCommands=10 |

### 13. switch-01-suicchi（スイッチと かべ）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 2 | スイッチ1 | 6手 | maxCommands=8 |
| p2 | 5×3 | 2 | スイッチ1 | 8手 | maxCommands=10 |

### 14. switch-02-futatsu（スイッチと かべ）
- 操作モデル: 計画型／型: grid-runtime／ステップ: intro→tutorial→play→play→summary／ステージ数: 2／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 5×3 | 4 | スイッチ2 | 8手 | maxCommands=10 |
| p2 | 4×4 | 6 | スイッチ2 | 9手 | maxCommands=10 |

### 15. teko-01-tsuriai（つりあい）
- 操作モデル: 計画型／型: predict-slider／ステップ: intro→play→play→play→summary／ステージ数: 3／estimatedMinutes: 5

| ステージ | 盤面 | 壁 | ギミック | 最短 | 備考 |
| --- | --- | --- | --- | --- | --- |
| p1 | 刻み4 | - | 左 1体@2／右 1体 | 置く位置 2 | 最短手数は定義なし |
| p2 | 刻み4 | - | 左 2体@2／右 1体 | 置く位置 4 | 最短手数は定義なし |
| p3 | 刻み6 | - | 左 2体@3／右 1体 | 置く位置 6 | 最短手数は定義なし |

## 注記（手動追記）
- key-01-kagi と switch-01-suicchi、key-02-iro と switch-02-futatsu は、全プレイステージで盤面（grid・start・goal・walls）と solution が同一。違いはギミック（かぎ・ドア／スイッチ）と問い文のみ。
