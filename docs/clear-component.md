# クリア演出の共通部品（js/ui-clear.js）

星のトースト → 間（操作行が空き枠＋「…」）→ 結果ダイアログ（つぎへ＋もういちど＋紙吹雪）を1か所に集めた部品。新しい画面でクリア演出を出すときは自前で組まず、これを呼ぶ（Issue #342・#347）。台帳は `docs/components.md`。

## 呼び方

```js
import { showClearSequence, recordClear } from './ui-clear.js';

recordClear({ isFinal, stageIndex });          // クリアの記録
clearSequence?.dispose();                       // 前回分を片付け
clearSequence = showClearSequence({ statusBar, controls, lockEl, host, gapEl, view, restore,
  label, primary: { label, action, id }, replay, heading, setActiveAnimation });
```

| 引数 | 意味 |
| --- | --- |
| statusBar / view / restore | 星のトースト（showSuccess）に渡す。restore は表示後に元へ戻す処理。トーストは `confetti: false` で呼ぶ（紙吹雪はダイアログ側だけ） |
| controls | ダイアログの位置・大きさを合わせる先（play は操作パネル、シーソーは操作画面の枠 `data-sk-screen="frame"`）。ダイアログは controls の境界ボックスに一致する |
| lockEl | 間の始まりからダイアログ表示中ずっと `inert` にする、操作画面の外枠（1要素。play・シーソーとも `data-sk-screen="frame"` の枠）。盤面も含めて押せなくなる |
| host | ダイアログを置く先。lockEl の親（`#stage`）。`inert` の子孫は押せないので、ダイアログは lockEl の外に置く。`static` なら表示中だけ `relative` になる |
| gapEl | 間のあいだ空き枠にする操作行（省略可） |
| label | トーストの文言（省略可） |
| primary | つぎへ側。action＝押下時の処理、id＝`data-action` |
| replay | 「もういちど」押下時の処理（`data-action="replay"`） |
| heading | ダイアログの見出し（省略可。パネルに収まらなければ自動で消える） |
| setActiveAnimation | 画面側の「進行中アニメ」登録関数。`{ cancel: dispose }` を渡す。ダイアログを出した後も登録したままにし、画面の作り直し（renderStep の `activeAnimation.cancel()`）でも `dispose` が呼ばれるようにする |

- 返り値は `{ dispose() }`。ステージ切替・やり直し・画面を離れる時に必ず呼ぶ（タイマー・ダイアログ・紙吹雪・`inert`・空き枠・`relative`・リスナーを戻す。2回呼んでも安全）。
- `showClearToast(slotEl, { view, restore, label, confetti })`：星のトーストだけを出す（間・ダイアログなし。引数・既定は showSuccess と同じ）。predict・tutorial 用（Issue #352）。
- `recordClear`：最終ステージは clear → markLessonCleared → clearResume、途中は stage_clear → saveResumePoint（Issue #104）。

## 結果ダイアログ

- 非モーダルの `<dialog data-result-row="true">`（`show()`。`showModal()` は使わない）。中に白いカード `div[data-result-dialog="true"]`。Esc では閉じない。
- 背面のロックは `inert`（lockEl 1つ）。要素を列挙しない。
- 位置は resize・orientationchange・ResizeObserver（controls・host・lockEl）で測り直す。
- 紙吹雪：canvas-confetti（`js/vendor/confetti.js`、ISC ライセンス）。ダイアログ内の `canvas[data-clear-confetti="true"]`（`pointer-events: none`・ボタンより後ろ）に、ダイアログが出る瞬間に1回だけ、40粒・約1.8秒。動きを減らす設定（`prefersReducedMotion()`）では canvas を作らず 0粒。`dispose` で止めて消す。

## 画面ごとに変えてよいもの／いけないもの

| 変えてよい | 変えてはいけない |
| --- | --- |
| label、heading、primary のボタン文言、controls・lockEl・host・gapEl（要素の指定） | 間の長さ（1500ms、reduced-motion は 1000ms） |
| | ボタン高さ64px、背面の inert（外枠1つ） |
| | ダイアログの見た目、星の大きさ20px |
| | 紙吹雪の量・長さ、ダイアログ時だけ出すこと |
| | ボタン順（つぎへが上、もういちどが下） |
| | `data-result*`・`data-clear-confetti` 属性名（シナリオが参照） |

## CSS

`tailwind.src.css` に書く部品の CSS は `.sk-clear-*`（現状は星の `.sk-clear-reaction`）に閉じ、`.sk-screen-*`（`data-sk-screen`）など画面側のクラスに依存しない。ダイアログ（`result-row`・`result-dialog`）は Tailwind のユーティリティだけで組み、これらの名前は E2E が読む目印で CSS ルールは持たない。見た目を変えたいときは部品側を直し、全画面に効かせる。

## 実例

- play：js/ui-play.js の finishRun
- seesaw：js/ui-seesaw.js の finishRun
- predict は結果ボタンの並び（つぎへ上・もういちど下）だけ揃えており、ダイアログ化はしていない。

## 禁止パターン

部品の外で自前で組まない（検査は `test/forbidden-patterns.test.mjs`、定義は `docs/components.md`）。ダイアログの自前生成、待ち時間（1500・1000）の直書き、星サイズ20pxの直書き、`showSuccess`・紙吹雪・クリア記録・クリアログの直呼び。
件数は基準ファイル `test/forbidden-baseline.json` で管理し、増減とも赤になる（更新手順は `docs/components.md`）。例外は行末に `// allow-component:<id> 理由`（理由は必須）。
