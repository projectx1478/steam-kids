# 共通部品の台帳

画面をまたいで使う部品の索引。新しい画面で同じ演出・見た目が要るときは自前で組まず、ここにある部品を呼ぶ。部品を足す・直すときは、この表と禁止パターンも更新する（Issue #347・#349）。

## 部品の一覧

| 部品 | 置き場 | 個別の説明 | 禁止パターン（部品の外で自前で組まない） | 基準件数（`patterns`） |
| --- | --- | --- | --- | --- |
| クリア演出（星のトースト→間→結果ダイアログ＋紙吹雪） | `js/ui-clear.js` | `docs/clear-component.md` | ダイアログの自前生成、待ち時間の直書き、星サイズの直書き、`showSuccess`・紙吹雪・クリア記録・クリアログの直呼び | dialog 0・wait 0・star 0・showsuccess 0・confetti 2・clearrecord 0・clearlog 0 |
| 操作画面の枠（問い文の行・盤面・操作パネル・ボタン行の骨格。縦・横・背の低い横向き） | `js/ui-screen.js` | 本表（下の「操作画面の枠」） | 旧クラス名（`play-screen`・`status-bar`・`board-area`・`controller-panel`・`action-row`）での枠の自前組み立て | screen 3（allow 1） |

基準件数の正本は `test/forbidden-baseline.json`。`showsuccess 0`：`js/ui-predict.js`・`js/ui-tutorial.js` も `showClearToast` に移行済み（状態：移行完了）。`confetti 2` は `js/ui-reaction.js` の `showSuccess` 本体と `js/ui-seesaw.js` のアダプタ。

## 操作画面の枠

- 呼び方：`createOpScreen({ root, question })` → `{ frame, questionEl, boardArea, panel, actions, renderQuestion(text) }`。各要素に `data-sk-screen`（`frame`・`question`・`board`・`panel`・`actions`）、クラスは `sk-screen-*`。E2E は属性セレクタで探す。
- 変えてよい（画面ごと）：盤面の中身、パネルの中身、ボタンの数と文言。変えてはいけない：盤面が flex-1 で残り高さに縮むこと、問い文の行の高さ（20px 揃え）、ボタン高さ48px以上、横向きの `1fr＋320px` 2列、クリア演出の `controls`・`lockEl` に渡す要素とその位置・寸法、シーソーのボタン配置。
- 状態：移行中。置き換え済みは `js/ui-play.js`・`js/ui-seesaw.js`。未済は `js/ui-predict.js`（2件）・`js/ui-tutorial.js`（1件）で、後続 #355。`js/ui-seedpick.js` の `status-bar` は別用途の問い文で、`allow-component:screen` で逃がしている（allow 1）。#355 が済んだら `patterns.screen` を 0 に下げ、「移行完了」にする。

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

部品の置き場は、その部品の id だけを数えない（`js/ui-clear.js` はクリア演出の id、`js/ui-screen.js` は `screen`。互いの id は数える）。

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
| ヒント表示 | 効果が小さい（2026-10-08 判断） | 同じ見た目かロジックが3画面以上で必要になったとき |
