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
