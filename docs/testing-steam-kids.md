# steam-kids固有の検証事項

`docs/testing-guidelines.md`はテンプレート配布物（同期で上書き）のため、steam-kids固有の内容はここに置く。

## 1. 手元で実行する軽量チェック

- コードを変えたら`npm run check:static`と`npm run test:unit`、レッスンJSONを変えたら`npm run validate:lessons`、CSSを変えたら`npm run build:css`
- `checks.yml`はPRごとに`check:static`・`test:unit`・`validate:lessons`と、`style.css`のビルド忘れ検出を実行する

## 2. スモーク5本の意味

一覧の正は`e2e-pr.yml`の`SMOKE`。変更するときはIssueで決め、この表と同時に更新する。

| シナリオ | 検出する致命的な問題 |
| --- | --- |
| `app-version` | キャッシュ更新漏れ（`APP_VERSION`と`CACHE_NAME`の不一致） |
| `p3-offline` | オフラインで動かない |
| `lesson-picker` | レッスンを選べない |
| `cmd01-flow` | レッスンを最後まで進められない |
| `guardian-gate` | 保護者ゲートが開かない |

Service Workerの配信経路は単体テスト`test/service-worker.test.mjs`（`checks.yml`）で担保する。

## 3. 影響シナリオの列挙と`E2E:`行の例

- 影響シナリオ：`grep -lE '<lessonId|data-action名>' .claude/verify/scenarios/*`
- 例：`E2E: les-cmd-04-repeat-box les-cmd-04-tutorial group-repeats-ui`

## 4. 手元ガード

`.claude/verify/config.mjs`の`ciOnly`で有効化している。解除・変更するときはIssueで決める。

## 5. 盤面の描画の計測（Issue #389 段B）

- 20×20（400マス）の `drawBoard`（`fitCellSize` の結果＝マス9px・すき間1px・余白2px、壁40）。Chromium（Playwright）で10回描いた値。レイアウトまで含む。
  - 通常速度：初回 6.5ms／中央値 3.1ms／最大 6.5ms
  - CPU 4倍遅延（CDP の `Emulation.setCPUThrottlingRate`）：中央値 18ms／最大 39ms
  - CPU 6倍遅延：中央値 38ms／最大 60ms
  - 要素数：719（マス400＋盤面・ロボット・足あと層など）
- 同じ計測は `.claude/verify/scenarios/zoom-draw-cost.mjs`（CIで実行。MEASURE 行に出る。判定は中央値500ms未満）。単体テストは `test/board-20x20.test.mjs`。
- 古いタブレット実機での描画の重さは、悠さんが実機で確認する。

## 6. シナリオ作成時の決まり（SESSION.mdから移動。Issue #447）

- `.claude/verify/config.mjs`が`cmd-01-susumu`・`donguri-01-hirou`を凍結fixture（tutorial追加前）へ
  差し替えている。現行構造を検証する新シナリオは冒頭で`page.unroute('**/lessons/<id>.json')`する
  （c2・c4・c5と同じ）
- 凍結fixtureはレッスン**構造**の変更からは隔離されるが、`js/ui-reaction.js`・`js/ui-summary.js`等の
  **コード側の挙動変更**（例: クリア音がclear→fanfareへ、紙ふぶきが24→60個へ。Issue #104）は
  フィクスチャ経由でも影響する。効果音・演出を変える時はフリーズ系シナリオ（a1-sfx-flow等）も
  必ず確認する
- シナリオ内で`browser.newContext()`を呼ぶときは`{ serviceWorkers: 'block' }`を必ず付ける。
  無いとSW登録→`controllerchange`→`location.reload()`が操作中に割り込み間欠失敗する（#128）
- 無操作タイマー等の時間検証は`page.clock.install()`＋`fastForward`（Playwright 1.63）

## あばれ役（`rough-grid`。Issue #729）

AIを使わず、grid-runtime のレッスンを乱暴に操作して機械で判定するE2Eシナリオ（`.claude/verify/scenarios/rough-grid.mjs`）。判定は純関数`tools/playtest/rough-judge.mjs`（単体テスト`test/rough-judge.test.mjs`）。`e2e-run`・夜間で回る。出力は全件を`.verify/rough/<lessonId>.json`（`{rule, where, detail}[]`。成果物に入る）、合否は未知の件数のcheck。`where`＝`<lessonId>/<stepId>/<幅>x<高さ>/<操作>`。答え（`solution`）は出力に入れない。

| 規則 | 見るもの |
| --- | --- |
| R1 はみ出し | `#app`内の見える文字要素の`scrollWidth > clientWidth + 1` |
| R2 重なり | 見える`button, [data-action], [data-command]`どうしの交差面積1px²以上（祖先・子孫を除く） |
| R3 小さすぎ | 同じ要素の短辺48px未満（64pxの基準は既存シナリオ） |
| R4 結果が2つ同時 | 見える`[data-result]`＋`[data-hint]`が2個以上 |
| R5 盤の寸法変化 | クリア前後の`.grid-board`の幅か高さが10%超変わる |
| R6 飛び | 実行中0.1秒おきの`.grid-player`中心が1マス以上動く（`warps`のある面は見ない） |
| R7a/R7b | リロード後に同じplayか「つづきから」がある／端末の戻るで同じoriginの画面に留まる |
| R8 暗幕 | クリア後3秒、ダイアログが盤の30%以上を覆う |
| R9 隠れ | 要素の中心が画面外、または`elementFromPoint`が自分・子孫でない |
| R10 内部ID | 保護者画面の見える文字に`/^[stp]\d+$/`の語 |

静的な点検（R1〜R3・R9）は intro・各play（2.5秒後）・summary を1280×800・360×640・1024×600で見る。乱暴な操作（開始直後の実行・連打・実行中のメニュー・クリア）は1280×800のみ。

- **既知リスト**：`tools/playtest/rough-known.json`（`[{rule, where, issue}]`）。mainで出た件は、1件ずつバグIssueを起票して`issue`に番号を書く。rule・whereが一致する件は合否から除く（直したら行を消す）
- **レッスンの足し方**：シナリオ冒頭の`LESSONS`配列にレッスンIDを足す（grid-runtimeのみ。凍結fixtureのレッスンは`page.unroute`が要る）

## 紙芝居と一目チェック（`sheet.mjs`。Issue #766）

`npm run sheet -- <lessonId> [--root <dir>] [--out <dir>]`（`tools/playtest/sheet.mjs`。AIは使わない）。grid-runtime の1レッスンを1280×800で6コマに撮り、`.verify/sheet/<lessonId>/` に `sheet.png`（2列×3行・幅1280）と `sheet.txt`（コマごとの見える文字。先頭 `# sheet <id> type=<type> commit=<短縮hash|-> size=1280x800 frames=<撮れた数>/6`、各コマ `## <n> <見出し>（<stepId>）`、末尾 `## エラー`）を書く。`--root` は過去のコミットの worktree を指す用（素直な手の判定は常に今の `js/engine-grid.js`）。手元30秒・60秒以内。

| コマ | 見出し | 撮り方 |
| --- | --- | --- |
| 1 | 最初の画面 | start が出て1.5秒後 |
| 2 | 最初の操作後 | start を押し、2.5秒後に1回操作して0.8秒後 |
| 3 | 素直な手で失敗した直後 | 対象の面で素直な手→run→retry が出て0.2秒後 |
| 4 | その1.5秒後の手がかり | コマ3の1.5秒後 |
| 5 | クリア直後 | retry→solution→run→next が出て0.3秒後 |
| 6 | 次の面の最初 | next を押し、2.5秒後（最後の面なら summary） |

- **素直な手**（`tools/playtest/naive.mjs`）：ゴールへまっすぐ向かう手。横→縦でも縦→横でも解けない最初の面をコマ3〜5の面にする（無ければ最後の面・コマ3・4は札「なし」）。judgment-guide 1章2の「何も考えずにいちばん目につく手」の機械の代わり
- 撮れないコマは灰色の札（待つセレクタが15秒出ない／solution に文字列以外／grid-runtime 以外の型＝コマ1のみ撮る）。終了コード：6/6＝0、札あり＝1、引数の誤り・レッスン無し＝2
- **glance-check の呼び出し文**（#768 がそのまま使う。問いを変えたら judgment-guide と同時に直す）：

```
紙芝居 .verify/sheet/<lessonId>/sheet.png と文字 .verify/sheet/<lessonId>/sheet.txt を読み、次の7つの問いに答える。手引きのファイルは読まなくてよい（問いはここにあるものだけ）。コマ番号は sheet.txt の「## <n>」。
1 気づき：コマ5・6を見て、この面で何に気づくかを「〜すると〜になる」の1文で言えるか
2 素直な手：コマ3で、ゴールへまっすぐの手が失敗しているか（札「なし」なら「いいえ」）
3 総当たり：コマ5・6の命令の数と盤の広さから、考えずに端から試してもすぐには当たらなさそうか
4 前との違い：コマ5の面とコマ6の面で、考えることが違って見えるか（長さ・数が増えただけは「いいえ」）
5 手がかり：コマ4で、次の手が分かる事実が盤面に残っているか（文でなく盤の上で）
6 失敗の明るさ：コマ3・4の盤面で、止まったマス・壁・ゴールが明るく読めるか
7 最初の画面：コマ1に、文のほかに見るもの（動く見本・盤・絵）があるか
```

- トークン数の記録：Agent ツールの結果に出る合計トークン数を「入出力の合計」とする（目標1万以内）
