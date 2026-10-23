# 共通部品の台帳

画面をまたいで使う部品の索引。新しい画面で同じ演出・見た目が要るときは自前で組まず、ここにある部品を呼ぶ。部品を足す・直すときは、この表と禁止パターンも更新する（Issue #347・#349）。

## 部品の一覧

| 部品 | 置き場 | 個別の説明 | 禁止パターン（部品の外で自前で組まない） | 基準件数（`patterns`） |
| --- | --- | --- | --- | --- |
| クリア演出（星のトースト→間→結果ダイアログ＋紙吹雪） | `js/ui-clear.js` | `docs/clear-component.md` | ダイアログの自前生成、待ち時間の直書き、星サイズの直書き、`showSuccess`・紙吹雪・クリア記録・クリアログの直呼び | dialog 0・wait 0・star 0・showsuccess 0・confetti 2・clearrecord 0・clearlog 0 |
| 操作画面の枠（補助行・盤面・小鳥の吹き出し・操作パネル・ボタン行の骨格。縦・横・背の低い横向き） | `js/ui-screen.js` | 本表（下の「操作画面の枠」） | 旧クラス名（`play-screen`・`status-bar`・`board-area`・`controller-panel`・`action-row`）での枠の自前組み立て | screen 0（allow 2） |
| 確認ダイアログ（play中にレッスンせんたくがめんへ離れる確認・ほごしゃの画面を開く確認。縦並び：つづける＝大・離れる＝小。覆いのタップ＝つづける。文言は呼び出し側が渡す） | `js/ui-dialog.js`（`confirmDialog`） | 本表 | `window.confirm`、確認の自前生成（`.leave-confirm` の直書き） | 検査なし（Issue #542） |
| 盤面の描画（マスの大きさ計算・`renderGrid` 呼び出し・盤面エリアの大きさが変わったときの描き直し） | `js/ui-board.js` | 本表（下の「盤面の描画」） | `renderGrid(`・`computeCellSize(` の直呼び（`js/ui-board.js`・`js/ui-grid.js` 以外） | board 0（excluded の `js/ui-demo.js` に 1） |
| やり直しの流れ（失敗のゆれ・「もういちど」ボタン切替・開始時の「スタート！」） | `js/ui-retry.js` | `js/ui-retry.js` 先頭のコメント | 検査なし（登録表に足さない。Issue #344） | — |
| 小鳥の吹き出しでのヒント（失敗後のヒント・顔アイコンのタップ・失敗2回目の自動1回・「とめる」のヒント） | `js/ui-bird.js`・`js/bird-phrases.js`・`js/ui-reaction.js`（`showHint`） | `docs/hint-bubble.md` | なし（#468-19B） | なし（#468-19B） |
| 下端バー（intro・まとめ・スロット選択・単元マップ・大項目の主ボタン・副ボタンを画面の下端に固定し、スクロールせずに押せる。`#stage` 直下の最後の子。高さ72px・ボタン64px以上・間隔16px以上。左寄せは `.sk-bottom-bar--start`。play 画面には出さない） | `tailwind.src.css`（`.sk-bottom-bar`）。使う側は `js/ui-step.js`（intro）・`js/ui-summary.js`・`js/ui-slots.js`・`js/ui-picker.js`・`js/ui-tracks.js` | 本表 | `position: sticky` のバーの自前組み立て、下ボタンを本文の流れの末尾に置く | 検査なし（Issue #551。E2E `b1-primary-in-view` で見る） |

基準件数の正本は `test/forbidden-baseline.json`。`showsuccess 0`：`js/ui-predict.js`・`js/ui-tutorial.js` も `showClearToast` に移行済み（状態：移行完了）。`confetti 2` は `js/ui-reaction.js` の `showSuccess` 本体と `js/ui-seesaw.js` のアダプタ。

歯車メニュー（開く⚙は、play・れんしゅうではパレット上段右の `[data-action="menu"]`、ほかの画面ではヘッダー右上の `#gear-btn`。どちらも64px以上で同じ中央パネル `#gear-menu` を開く。中身は「いまの ばしょ」〔単元名・区分チップ・ステップ点列。play・れんしゅうのみ〕・「レッスンせんたくがめん」〔`#menu-home`。まえは廃止〕・「がめん」・「ほごしゃの かた」→確認「ほごしゃの がめんへ／とじる」〔`#guardian-confirm`・`#guardian-go`・`#guardian-cancel`。開いている間だけ DOM にある〕→`dashboard.html`・「とじる」）は `js/ui-menu.js`（`initMenu`・`openMenu(opener)`）。`<dialog>` は使わず `hidden` 切替（Issue #389 段A・#467）。「がめん」（`#menu-zoom-open`）は `getActiveZoom()` が拡大できる盤（既定でマス24px未満）のときだけ出し、押すとパネルを閉じて画面下のズームバー `#zoom-bar`（`#zoom-in`・`#zoom-out`・`#zoom-all`・`#zoom-back`。覆いなし）を開く。倍率を変えてもバーは閉じず、もどる・Esc で閉じる。ヘッダの←・🏠と点列のメニュー内への移し替えは `js/ui-step.js`（`renderHeader`・`renderStepDots`・`setBackDisabled`。対象は play〔シーソー除く〕・tutorial。`#app` の `data-op-compact`）。パレットの⚙と、「とめる」ボタンへの残り回数の統合（`data-pause-count`・`data-pause-left`・バッジ。`setPauseLeft`）は `js/ui-commands.js`（`renderCommandPalette`）。

盤面の拡大縮小（CSS transform で再描画しない。倍率 1→1.5→2→3・ホイール・2本指ピンチ・拡大中の1本指ドラッグ〔直接操作型は2本指のみ〕・実行中の追従・実行後は戻さない・拡大中だけ `touch-action:none`）は `js/ui-zoom.js`（`createZoom({ boardArea, boardWrap, direct })`。ui-play・ui-tutorial・ui-predict が接続、`onDraw` を `drawBoard` の後に呼ぶ）。

盤面エディタは子ども向け画面の部品ではなく、開発者用の独立ツールとして `tools/editor/` に置く（上の表には載せない）。ステージ設定に「とめる回数（maxPauses）」（0以上の整数・上限なし。0はキーごと消す。#395）。`maxPauses>0` のステージは失敗時に操作ボタン行が2ボタン「とちゅうから／さいしょから」になり、「とめる」未使用（止まった地点なし）のときは「とちゅうから」をマスク（`createRetryChoice`、`js/ui-retry.js`）。エディタの「たたき台」パネル（`POST /api/generate` の候補4枚）も、盤面は `drawBoard`（`js/ui-board.js`）で描く（#401）。

## 操作画面の枠

- 呼び方：`createOpScreen({ root, question })` → `{ frame, questionEl, boardArea, panel, actions, renderQuestion(text), announceQuestion, bird }`。問い文は小鳥の吹き出し（`js/ui-bird.js`）で出し、`questionEl` は鍵トレイ・残数・塗りの見本だけの補助行（中身が無ければ非表示）。各要素に `data-sk-screen`（`frame`・`question`・`board`・`panel`・`actions`）、クラスは `sk-screen-*`。E2E は属性セレクタで探す。
- 変えてよい（画面ごと）：盤面の中身、パネルの中身、ボタンの数と文言。変えてはいけない：盤面が flex-1 で残り高さに縮むこと、吹き出しは顔・吹き出し自体のタップで消え、下の盤面マスへは素通ししないこと、ボタン高さ48px以上、横向きの `1fr＋320px` 2列、クリア演出の `controls`・`lockEl` に渡す要素とその位置・寸法、シーソーのボタン配置。
- ボタン行の修飾：`actions.classList.add('sk-screen-actions--one-row')` で横向きでも1行（◀・▶ 各1/4幅、残りが主ボタン）。使用はシーソーのみ。
- ボタン行の修飾：`sk-screen-actions--play`（play 全ギミック・tutorial）＝ぜんぶけす・１つけす｜32px｜1コマ・じっこうの順、間隔8px。高さ480px以上の横向き（1024×600）は2×2（行間16px）。
- 状態：移行完了（tutorial・seedpick は例外）。置き換え済みは `js/ui-play.js`・`js/ui-seesaw.js`・`js/ui-predict.js`。`js/ui-seedpick.js` の `status-bar`（別用途の問い文）と `js/ui-tutorial.js` の `board-area`（結果の星を盤面に重ねる別骨格）は `allow-component:screen` で逃がしている（allow 2）。

## 盤面の描画

- 呼び方：`fitCellSize({ spec, boardArea, portraitMax, noSplit })`（`{ cellSize, gap, pad }`。既定のすき間4px・余白4pxでマス24px未満になる盤だけ、すき間1px・余白2pxで計算し直す。#389）／`drawBoard({ boardWrap, spec, cellSize, gap, pad, playerPos, labels, hide })` → `{ el, view }`（`spec` の項目を `renderGrid` にそのまま渡す。`hide.goal` で goal を描かない）／`observeBoard({ boardArea, fit, current, skipWhen, redraw })`（大きさが変わったら描き直す。`skipWhen` は画面ごと：実行中・結果表示中は描き直さない）。`MIN_CELL`・`computeCellSize`・`renderGrid` は `js/ui-grid.js` に残す。
- 置き換え対象（Issue #345）：`js/ui-play.js`・`js/ui-tutorial.js`（`portraitMax` 56）・`js/ui-predict.js`（goal を描かない・`noSplit` で横向きでも上限64）。対象外：`js/ui-demo.js`（固定の大きさ・観察なし）、シーソー。
- PR の分け方：1 PR・2段（段1＝部品＋play、段2＝tutorial・predict・禁止パターン・台帳）。
- 状態：移行完了（`board 0`、`excluded` の `js/ui-demo.js` に 1）。
- 水・橋（#338）：`drawBoard` は `spec.water`・`spec.waterMode`・`spec.bridge` を `renderGrid` に通す。描画は `js/gimmicks/water.js` の `render`（水＝`data-water`、橋＝`data-bridge`・`data-bridge-dir`〔h横/v縦〕。隣と2pxつなげる）。水で止まったときは `view.bounce(dir, 'water')`（水しぶき＋困り顔）と音 `splash`（`js/ui-step.js` が盤の `water` と進行方向で判定）。`generator.shape` は PR2。
- 盤面エディタ（`tools/editor/`）は盤面を `drawBoard`（`js/ui-board.js`）経由で描き、`renderGrid(`・`computeCellSize(` を直呼びしない。
- 盤面エディタのパレットは `GIMMICKS` の `key`・`label` から生成され、登録表に足せば自動で出る。

## 禁止パターンの検査

`test/forbidden-patterns.test.mjs`（`npm run test:unit` に含まれる）。項目は登録表 `test/forbidden-registry.mjs`、件数の基準は `test/forbidden-baseline.json`。ファイル単位の正規表現で、部品の置き場（上の表）を除いた `js/`（`js/vendor/` は対象外）と `tailwind.src.css`（星サイズのみ）を調べる。

- 件数が基準より**増えたら赤**。**減ったのに基準を下げていなくても赤**（減ったときの失敗文言は「<id>: 基準N→実際M。下げるなら基準をMに」。増えたときは「…。増えた：部品を使う（理由つきの allow-component:<id> か、悠さんの承認を得て基準を上げる）」）。
- 例外は、該当行の末尾に `// allow-component:<id> 理由` を書く（CSS は `/* allow-component:<id> 理由 */`）。理由は必須（無ければ赤）。`<id>` は登録表の id。旧 `allow-clear` は受け付けず、残れば赤。例外の件数も基準の `allow` に id ごとに記録する。
- 誤検知を例外で逃がすのは、自分が編集してよいファイルに限る。
- 除外ファイル：`js/ui-summary.js`（レッスン・単元の完了画面で、ステージ演出ではない）、`js/ui-demo.js`（お手本デモで、クリアではない）。検査の対象からは外すが、中の検出件数は数え続け、基準の `excluded` にファイルごと・id ごとに記録する。除外は2ファイルまで。増やすには悠さんの承認。

| id | 部品 | 項目 | 定義 |
| --- | --- | --- | --- |
| dialog | クリア演出 | ダイアログの自前生成 | `js/ui-clear.js` 以外で、`createElement('dialog')`・`.showModal(`・`.show(`・`result-row`・`result-dialog` |
| wait | クリア演出 | 待ち時間の直書き | `js/ui-clear.js` を import するファイルで、`setTimeout(…, 1500)`・`setTimeout(…, 1000)`、`const RESULT_GAP…` の再定義 |
| star | クリア演出 | 星サイズの直書き | `tailwind.src.css` の `.sk-clear-` を含まないルールの `width/height: 20px`、`js/` の `style.width/height = '20px'` |
| showsuccess | クリア演出 | `showSuccess` の直呼び | `js/ui-clear.js` 以外での `showSuccess(` の呼び出し（定義行・import 行・コメント行は数えない） |
| confetti | クリア演出 | 紙吹雪の直呼び | `view.confetti(`（`?.` つきも）・`screenConfetti(` の呼び出し（同上） |
| clearrecord | クリア演出 | クリア記録の直呼び | `markLessonCleared(`・`saveResumePoint(` の呼び出し（同上） |
| clearlog | クリア演出 | クリアログの直書き | `logEvent('clear'`・`logEvent('stage_clear'` |
| screen | 操作画面の枠 | 枠の自前組み立て | `js/ui-screen.js` 以外で、`className` を含む行に `play-screen`・`status-bar`・`board-area`・`controller-panel`・`action-row` のいずれか（コメント行は数えない） |
| board | 盤面の描画 | 盤面の描画の直呼び | `js/ui-board.js`・`js/ui-grid.js` 以外で、`renderGrid(`・`computeCellSize(` の呼び出し（定義行・import 行・コメント行は数えない） |

部品の置き場は、その部品の id だけを数えない（`js/ui-clear.js` はクリア演出の id、`js/ui-screen.js` は `screen`、`js/ui-board.js`・`js/ui-grid.js` は `board`。互いの id は数える）。

効果音（`playSfx`）と `clearResume` は数えない。トーストと結果ボタンの並びは目視。

## 基準ファイルの更新手順

基準を**上げる**変更（検出が増える変更）は、原則しない。部品を使うか、理由つきの `allow-component` で逃がす。どうしても上げるときは、悠さんの承認を得て、`test/forbidden-baseline.json` の該当の数字だけを変え、PR 本文に理由を書く（差分を悠さんが読んで止める）。

基準を**下げる**とき（移行や削除で検出が減った）は、失敗文言の「基準をMに」のとおり、同じファイルの数字を実際の件数に直す。基準ファイルは `patterns`（除外ファイルを除いた件数）・`allow`（`allow-component` コメントの件数）・`excluded`（除外ファイルの中の件数）の3つ。キーは登録表の id すべてが必須で、値は0以上の整数。

## 部品を足すとき

1. 部品の説明を `docs/<部品名>.md` に書き、上の一覧に1行足す（基準件数の列も）。
2. 登録表 `test/forbidden-registry.mjs` に `{id, 部品, 項目, 対象, 検出}` を足し、`test/forbidden-baseline.json` の `patterns`・`allow`・`excluded` の各ファイルに同じ id を足す（件数は実測）。違反するダミー（赤）と `allow-component:<id>` 付きのダミー（緑）を `test/forbidden-patterns.test.mjs` に入れる。
3. `docs/file-structure.md` の索引にファイルを足す。

## 重複検出（報告のみ）

部品化の候補を見つける材料として、jscpd で重複コードを検出する。ワークフロー `.github/workflows/jscpd-nightly.yml`（毎晩 2:30 JST、直近25時間に main へのコミットがあった日だけ。手動実行は常に実行）。設定は `.jscpd.json`（対象は `js/`・`app.js`・`service-worker.js`、除外は `js/vendor`・`test`・`style.css`、`minLines` 8・`minTokens` 70）。結果は Job Summary と artifact（14日保持）に出す。閾値は付けず、失敗にも Issue 起票にもしない。`verify:fast` と PR の CI には入れない。手元では `npx jscpd`（出力は `.verify/jscpd/`）。

## 見送った部品

候補に挙げたが、今は部品にしないもの。見直す条件は全行「同じ見た目かロジックが3画面以上で必要になったとき」。

| 候補 | 見送りの理由 | 見直す条件 |
| --- | --- | --- |
| 重ねて出す画面 | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |
| 進捗のドット | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |
| レッスンの枠 | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |
| くりかえし箱の操作行 | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |
| 最初のステージの指ガイド | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |

## レイアウト・ビルドの落とし穴（SESSION.mdから移動。Issue #447）

- `#app`は`h-[100dvh]`固定（`min-h`ではない）。操作画面（play/predict/tutorial）のflex-1な
  盤面エリアが画面高さから縮む前提のレイアウトのため、`min-h`に戻すと縦スクロールが発生する
  （Issue #93で発覚。360×640で再現）
- `js/ui-grid.js`の`computeCellSize`の下限（`MIN_CELL`）は8px（0除算防止のみが目的で、見た目の
  下限ではない）。48px等の固定下限に戻すと、行数の多い盤面＋文字拡大＋操作パネルが重なる
  組み合わせで盤面がエリアより大きくなり、ロボットが隠れる事故が起きる（Issue #99・#97。
  盤面のマスはplay中はタップ対象ではないため64pxタップ領域規則とは衝突しない）
- Tailwindのcontentスキャンはコード中の識別子も拾う。ユーティリティ名と一致する語（例:
  `hidden`）を書くと無関係なクラスが再ビルド時に生成される。実害はないが、再ビルド後の
  `git diff --stat`とCIの「style.cssのビルド忘れ」チェックで確認してからコミットする
  （`.gitattributes`で`style.css -diff`のため、差分本文は出ない）
