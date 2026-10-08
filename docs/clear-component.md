# クリア演出の共通部品（js/ui-clear.js）

星のトースト → 間（操作行が空き枠＋「…」）→ 結果ダイアログ（つぎへ＋もういちど）を1か所に集めた部品。新しい画面でクリア演出を出すときは自前で組まず、これを呼ぶ（Issue #342）。

## 呼び方

```js
import { showClearSequence, recordClear } from './ui-clear.js';

recordClear({ isFinal, stageIndex });          // クリアの記録
clearSequence?.dispose();                       // 前回分を片付け
clearSequence = showClearSequence({ statusBar, controls, lockEls, gapEl, view, restore,
  label, primary: { label, action, id }, replay, heading, setActiveAnimation });
```

| 引数 | 意味 |
| --- | --- |
| statusBar / view / restore | 星のトースト（showSuccess）に渡す。restore は表示後に元へ戻す処理 |
| controls | ダイアログを被せる先（操作パネル）。表示中だけ `relative` になる |
| lockEls | ダイアログ表示中に `inert` にする背面の要素の配列 |
| gapEl | 間のあいだ空き枠にする操作行（省略可） |
| label | トーストの文言（省略可） |
| primary | つぎへ側。action＝押下時の処理、id＝`data-action` |
| replay | 「もういちど」押下時の処理（`data-action="replay"`） |
| heading | ダイアログの見出し（省略可。パネルに収まらなければ自動で消える） |
| setActiveAnimation | 画面側の「進行中アニメ」登録関数。間のタイマーを cancel できる形で渡す。間の終わりに null を渡す |

- 返り値は `{ dispose() }`。ステージ切替・やり直し・画面を離れる時に必ず呼ぶ（タイマー・ダイアログ・inert・空き枠を戻す。2回呼んでも安全）。
- `recordClear`：最終ステージは clear → markLessonCleared → clearResume、途中は stage_clear のみ（Issue #104）。

## 画面ごとに変えてよいもの／いけないもの

| 変えてよい | 変えてはいけない |
| --- | --- |
| label、heading、primary のボタン文言、controls・lockEls・gapEl（被せる先の要素） | 間の長さ（1500ms、reduced-motion は 1000ms） |
| | ボタン高さ64px、背面の inert |
| | ダイアログの見た目、星の大きさ20px |
| | ボタン順（つぎへが上、もういちどが下） |
| | `data-result*` 属性名（シナリオが参照） |

## CSS

`tailwind.src.css` に書く部品の CSS は `.sk-clear-*`（現状は星の `.sk-clear-reaction`）に閉じ、`.play-screen`・`.status-bar` など画面側のクラスに依存しない。ダイアログ（`result-row`・`result-dialog`）は Tailwind のユーティリティだけで組み、これらの名前は E2E が読む目印で CSS ルールは持たない。見た目を変えたいときは部品側を直し、全画面に効かせる。

## 実例

- play：js/ui-play.js の finishRun
- seesaw：js/ui-seesaw.js の finishRun
- predict は結果ボタンの並び（つぎへ上・もういちど下）だけ揃えており、ダイアログ化はしていない。
