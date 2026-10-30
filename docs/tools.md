# 開発用ツール

## analyze-board（盤面解析）
盤面の最短手数・別解の本数・探索規模を測る。設計・実装で盤面を作るとき、使い捨てスクリプトを書かずにこれを使う。

```
node tools/analyze-board.mjs <レッスンID> <ステージ番号|stepId> [--timeout 秒] [--limit 本数]
node tools/analyze-board.mjs --board <盤のJSONファイル>        [--timeout 秒] [--limit 本数]
```
- ステージ番号は、そのレッスンの play を 1 から数える（stepId でも指定できる）。`--board` は play ステージ1つ分のJSON。
- 出力：最短手数（groupRepeats はチップ数、repeatBox は箱なし）、訪問状態数（BFSの状態数＝検証コストの目安）、maxCommands 以内の別解の本数、所要時間。
- 既定は timeout 60秒・別解 1000本まで。打ち切ったときは「打ち切り」と理由を出す（別解は「これ以上」の意味）。別解の探索はノード数30万で切り、切れたら「不明（N本以上）」と出す（20×20 でも約10秒で返る）。
- 別解は、壁衝突・塗りはみ出しの枝を切った全列挙。repeatBox/groupRepeats は対象外。
- 探索は js/engine-grid.js の `shortestSteps`/`shortestChips` を使う。ここでは複製しない。

例（paint-01）：p1＝最短6手・訪問34・別解2本、p2＝10手・102・2本、p3＝12手・221・4本。

## verify:fast（軽量検証）
```
npm run verify:fast
npm run verify:fast -- --with-generate
```
- check:static → validate:lessons → test:unit:core を順に実行。各段の成否と秒だけ出し、失敗時は要約のみ。全体 timeout 240秒。E2E は含まない。
- 既定は生成テスト（test/engine-generate*.test.mjs）を除く。次のとき test:unit:generate も末尾に追加する：(1) 生成まわりに変更（origin/main との merge-base からの差分＋作業ツリー＋未追跡）、(2) `--with-generate`、(3) 変更検知に失敗（origin/main なし・git 失敗。安全側）。実行前に含める／除く理由を1行出す。
- 生成まわりのパス（tools/verify-fast.mjs の `GENERATE_PATHS` が正本）：js/engine-generate.js、js/engine-grid.js、js/gimmicks/ 配下、test/engine-generate*、package.json、tools/verify-fast.mjs、tools/test-unit-core.mjs。
- 根拠：生成テストが import する js/engine-generate.js → engine-grid.js・gimmicks/ 配下。gimmicks/keys.js の sfx.js は動的importでテストでは呼ばれないため含めない。
- 注意：生成まわり以外の変更では生成テストが走らない。生成に影響しうる変更を上記パス外に置いたときは `--with-generate` を付ける。手元の generate 段は `GENERATE_SEEDS=200`（1000シードの4本のみ。複合300・golden は変えない。呼び出し側で設定済みならそれを優先。所要は約60秒（実測）。verify:fast 合計は約76秒）。CI（checks.yml）は従来どおり test:unit で全件実行し、1000シードのまま。
- 関連 npm スクリプト：test:unit（全件・CI用）／test:unit:core／test:unit:generate。

## 盤面エディタ（npm run editor）
- 開発者用。`npm run editor` で `127.0.0.1:5173` に起動（`EDITOR_PORT` で変更）。子ども画面（js/）には含まれない。
- 使い方のヘルプ：`tools/editor/help.html`（`help.css`）。エディタのヘッダーの「つかいかた」から別タブで開く。操作の手順（置き方・ギミック別・Shift 移動・元に戻す・拡大縮小・チュートリアルの面（tutorial の足す・文面・命令ボタンの手順・消す）・下書き・たたき台・ためしあそび）を図つきで載せる。エディタの操作を変えたら help.html も同じ Issue・PR で直す（#510）。
- 盤面の大きさ：1×1〜20×20（`EDITOR_MAX_SIZE`＝20。レッスンJSON の上限検査と同じ）。見た目の拡大縮小は2つあり、`cellPx`（マスの px。ホイール。8〜128）がエディタの表示倍率で、子ども画面の拡大縮小（`js/ui-zoom.js`）とは別。20×20 の編集では `cellPx` を小さくして全体を見る。
- 判定：編集が止まって約300ms後に `POST /api/analyze`（クリア可否・最短手数・曲がる回数の一例・各ギミックの必須）。20×20 まで。判定は `worker_threads` で実行し10秒で打ち切る（打ち切りは「未判定」で、OK には見せない）。面の前後との勾配（最短手数の非減少）に反すると警告するが、保存は止めない。
- 保存：`PUT /api/lessons/:id` が `validateLesson`・`validateIndex` をメモリ上で通し、エラー0件のときだけ `lessons/<id>.json` に書く（10秒で打ち切り、時間切れは保存不可）。書く前に `tools/editor/backups/<id>-<YYYYMMDD-HHmmss>.json`（同一秒は連番付き）へ退避し、レッスンごとに直近10件を残す。
- 配置の保存：`lessons/index.json` は専用 API で読み書きする（`GET /api/index`・`PUT /api/index`）。レッスン保存（`PUT /api/lessons/:id`）は `index` を受け付けない。PUT は全体を受け、レッスン ID の集合が現行と同じこと（足し引き・改名は 400）・空でない単元／大項目・`validateIndex` をメモリ上で通し、通ったときだけ書く（直前の index.json は `index-<日時>.json` に退避）。単元間の移動のときだけ、対象の `lessons/<id>.json` の `unitId` も（退避したうえで）書き換える。パネルはトップバーの「配置」。
- 生成の打切りと20×20の実測（Issue #394。2026-10-14、grid 20×20・壁3〜60・最短2〜16）：`generateBoard` は探索量 `MAX_WORK`＝100万（マス数×2^(どんぐり＋かぎ/スイッチ)の足し上げ。時計は使わない）で `GEN_ABORTED` を返す。`gen-stages` の安全弁は `TIME_LIMIT_MS`＝600秒（超過は「未完了」エラー）。1盤の生成は壁・ギミックなしで平均15ms、ice 約60ms、switches 約0.2秒、cushion 約1秒、items・keys 約3秒（最悪7秒）。items で予備盤なし（400回使い切り）は最悪約80秒。`collectCandidates`（200 seed）は plain 約1.3秒、items 約523秒。各ギミックの必須判定 `strip()` は 1〜7ms で、時間の大半は `shortestPath`（`js/engine-grid.js`）。
- ワープ：palette に「ワープ1」「ワープ2」（pair=1/2）。1回の配置で穴を1個置く。同じpairが2個になるまで保存時のvalidateがNG（3個以上もNG）。
- かぎ・ドア（#523 段1）：palette に「かぎ」（`keys`）と「ドア」（`doors`）が別項目。置くと色は red（既定）で、選択物の設定欄のラジオで red／blue を変える（`setKeyColor`／`setDoorColor`）。盤全体の `keyMode`（remote／carry。既定 carry は省略）は右下の設定欄のラジオ（`setKeyMode`。かぎ・ドアが無い盤では選べず、全部消すと keyMode も消える）。接続待ち印（`pendingKeys`＝同じ色のかぎが無いドア・同じ色のドアが無いかぎ）は黄色の「!」と判定欄の「接続待ち」。ドアの警告基準は validate の keys.js（「対応する色のかぎが無い」）と一致。`COMPLEX_KEYS` からは keys を外した。
- 周期ドア（#523 段2）：palette に「周期ドア」（`periodic`）。置くと period 3（既定）で、選択物の設定欄のラジオで 2／3／4 を変える（`setPeriodicPeriod`）。初期位相は無い。消す・動かすは座標で指す（`erase`／`move`）。repeatBox との併用不可や他要素との同じマスの重なり（ワープ・氷を含む）は validate（js/gimmicks/periodic.js）の保存時検査。paint・groupRepeats とは併用できる（#529。併用盤はエディタ限定でレッスンには出さない）。`COMPLEX_KEYS` は paint のみになった。
- 水の橋・waterMode（#523 段3）：palette に「橋」（`bridge`）が水と別項目。置く・消す・動かすは座標で指す（`place`／`erase`／`move`）。橋は見た目だけ。上下左右に水が無い橋は接続待ち（`pendingBridges`＝黄色の「!」と判定欄の「接続待ち」。基準は validate の water.js「bridge の上下左右に水が無い」と一致）。水を消すと、そのマスの隣にあった橋のうち上下左右に水が残らないものだけ一緒に消え（`dropOrphanBridges`）、水が全部無くなると `waterMode` も消す。盤全体の `waterMode`（cushion／bump。既定 cushion は省略）は右下の設定欄のラジオ（`setWaterMode`。水が無い盤では選べない）。
- ぬりマス（#523 段4）：palette に「ぬりマス」（`paint`）。マスのクリックは目標マスのトグル（`togglePaint`。あれば外し、無ければ足す。`place(state,'paint',…)` も同じ）。目標は start・goal と重なってよく（`place`／`move` の start・goal は paint との重なりを許す）、それ以外の要素とは重ならない。盤面の描画は目標を出さないので、エディタが橙の面で示す（`.ed-paint`）。start／goal が目標に含まれない盤は接続待ち（`pendingPaint`＝そのマスに橙の「!」と判定欄の「接続待ち」。基準は validate の paint.js「paint に start・goal のマスが含まれない」と一致。start を自動では足さない）。他のギミック・repeatBox・groupRepeats とは併用できる（#529。併用盤はエディタ限定でレッスンには出さない）。壁・水・氷との重なりは validate の保存時検査。ドア・ワープの穴に当たる目標は、必須性の判定（tools/lib/must-matter.mjs）で壁にして外すマスを目標から除いて再判定する。消しゴムは目標を外し、Shift 移動は目標（start・goal と重なるマスでは start・goal のほう）を動かす。`COMPLEX_KEYS` は空になり、「#404」の文言は残っていない。
- たたき台生成：ギミックに「周期ドア」を選べる（ドア数1〜2。周期3・4のみ。ワープ・水と同時には指定できない（この3つは1種まで）。どんぐり・こおり・かぎ・クッション・スイッチ・壁とは併用できる）。「色ぬり」も選べる（目標マス数4〜8。色ぬりは、水とだけいっしょに使えます。川をわたる橋のマスを通るぬり目標の盤ができます。壁は併用可）。「水」も選べる（水マス数2〜8。ワープ・周期ドアと同時には指定できない（この3つは1種まで）。どんぐり・こおり・かぎ・クッション・スイッチ・色ぬり・壁とは併用できる）。
- 固定：stageGen のあるレッスンで面を固定すると、`stageGen.keepHandwritten` に足す（先頭から連続した面だけ。途中からは断る）。置き換え・複製は `gen` を外して手書きの面にする。固定しないまま `gen-stages --write` を回すと手書きの面は消える。
- 下書き：`tools/editor/drafts/<name>.json`（`<name>` は `^[a-z0-9-]+$`、同名は上書き、数の上限なし）。保存時は形（JSON のオブジェクト）だけ確認し、「面として追加」して保存するときに上の保存検査を通る。
- 書き込み先は `lessons/*.json`・`tools/editor/drafts/`・`tools/editor/backups/` だけ（後ろ2つは `.gitignore` 済み）。

## 盤面は開発者がエディタで作る方針（Issue #396）
- 順番は「ギミックのエンジン側を先に完成 → 盤面エディタを作る → 盤面は開発者がエディタとジェネレーターで作る」。これまでは Issue ごとに AI がレッスンの盤面を作っていた。
- ギミックの Issue はエンジン側（仕組み・描画・validate・stageGen での生成・`strip()` の必須判定）だけを扱う。動作確認のテスト盤面は1〜2枚まで。
- 試し遊び（#403）は `dev=1` で開き、記録（履歴・再開点）を残さない。

### 悠の決裁待ち
- 盤面だけを変える PR の扱い。案：CI の validate と e2e が通れば、AI のレビューを省く。`.claude/` の変更になるため、ここでは決裁事項として書くだけで、`.claude/` は変えない。
