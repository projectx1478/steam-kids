# 開発用ツール

## analyze-board（盤面解析）
盤面の最短手数・別解の本数・探索規模を測る。設計・実装で盤面を作るとき、使い捨てスクリプトを書かずにこれを使う。

```
node tools/analyze-board.mjs <レッスンID> <ステージ番号|stepId> [--timeout 秒] [--limit 本数]
node tools/analyze-board.mjs --board <盤のJSONファイル>        [--timeout 秒] [--limit 本数]
```
- ステージ番号は、そのレッスンの play を 1 から数える（stepId でも指定できる）。`--board` は play ステージ1つ分のJSON。
- 出力：最短手数（groupRepeats はチップ数、repeatBox は箱なし）、訪問状態数（BFSの状態数＝検証コストの目安）、maxCommands 以内の別解の本数、所要時間。
- 既定は timeout 60秒・別解 1000本まで。打ち切ったときは「打ち切り」と理由を出す（別解は「これ以上」の意味）。
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
- 判定：編集が止まって約300ms後に `POST /api/analyze`（クリア可否・最短手数・曲がる回数の一例・各ギミックの必須）。20×20 まで。判定は `worker_threads` で実行し10秒で打ち切る（打ち切りは「未判定」で、OK には見せない）。面の前後との勾配（最短手数の非減少）に反すると警告するが、保存は止めない。
- 保存：`PUT /api/lessons/:id` が `validateLesson`・`validateIndex` をメモリ上で通し、エラー0件のときだけ `lessons/<id>.json` に書く（10秒で打ち切り、時間切れは保存不可）。書く前に `tools/editor/backups/<id>-<YYYYMMDD-HHmmss>.json`（同一秒は連番付き）へ退避し、レッスンごとに直近10件を残す。
- 固定：stageGen のあるレッスンで面を固定すると、`stageGen.keepHandwritten` に足す（先頭から連続した面だけ。途中からは断る）。置き換え・複製は `gen` を外して手書きの面にする。固定しないまま `gen-stages --write` を回すと手書きの面は消える。
- 下書き：`tools/editor/drafts/<name>.json`（`<name>` は `^[a-z0-9-]+$`、同名は上書き、数の上限なし）。保存時は形（JSON のオブジェクト）だけ確認し、「面として追加」して保存するときに上の保存検査を通る。
- 書き込み先は `lessons/*.json`・`tools/editor/drafts/`・`tools/editor/backups/` だけ（後ろ2つは `.gitignore` 済み）。
