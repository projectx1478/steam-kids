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
