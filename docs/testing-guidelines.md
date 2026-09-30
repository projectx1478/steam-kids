# steam-kids テスト実行ガイドライン（E2E はすべて GitHub Actions）

## 1. 方針

- **E2E（`.claude/verify/run.mjs`・`npm run verify:e2e`）は、個別・全件を問わず手元で実行しない。すべて GitHub Actions で実行する。**
  - 手元での実行は、ガード（§6）によって既定で止まる。
- 手元で実行してよいのは、ブラウザを使わない軽い検証だけ：`npm run check:static`、`npm run test:unit`、`npm run validate:lessons`、`npm run build:css`。
- 「テストを通すための書き換え・skip・期待値の合わせ込み禁止」は従来どおり有効。
- どの AI・人が開発しても、同じワークフローを使う。
- AGENTS.md「検証フェーズ」の「全コマンド実行」「PR作成前は全件実行」は、本書の運用（E2E は CI）が優先する（project-template#106 で AGENTS.md に反映予定。反映まではこの注記が正）。

検証は「軽量チェック（手元・CI）→ E2E（CI のみ）」の2段で行う。軽量チェックは手元でも CI（`checks.yml`）でも同じコマンドを使う。

| 目的 | ワークフロー | 起動 | 実行内容 |
| --- | --- | --- | --- |
| PR の軽量チェック | `checks.yml` | PR の作成・更新で自動 | check:static・test:unit・validate:lessons・style.css のビルド忘れ |
| 実装中の確認 | `e2e-run.yml` | `gh workflow run`（手動） | 指定シナリオのみ（`all` で全件） |
| PR の最低ライン | `e2e-pr.yml` | PR の作成・更新・本文編集で自動 | スモーク6本＋PR本文の `E2E:` 行 |
| 回帰の網羅 | `e2e-nightly.yml` | 毎晩2時（コミットがあった日）／手動 | 全件 |

## 2. 開発の流れ

1. 実装する。コードを変えたら `npm run check:static` と `npm run test:unit` を、レッスンJSONを変えたら `npm run validate:lessons` を、CSS を変えたら `npm run build:css` を実行する。
2. ブランチを push する。
3. 途中で確かめたいシナリオがあれば、`e2e-run` で実行する。

   ```
   gh workflow run e2e-run.yml --ref <ブランチ> -f scenarios="<シナリオ名…>"
   gh run watch "$(gh run list --workflow e2e-run.yml --branch <ブランチ> --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
   ```

4. PR を作る。本文に `E2E:` 行を書き、この変更に関係するシナリオを列挙する（最大12本）。
   **このPRで追加・変更したシナリオは必ず含める。** 影響シナリオは `grep -lE '<lessonId|data-action名>' .claude/verify/scenarios/*` で列挙する。

   ```
   E2E: les-cmd-04-repeat-box les-cmd-04-tutorial group-repeats-ui
   ```

5. `gh pr checks --watch` で、**E2E PR が緑になるまで** 直す。
6. 完了報告には次の形で書く。

   ```
   検証:
   - 手元: check:static / test:unit / validate:lessons / build:css（結果）
   - CI: Checks 結果 / E2E PR（スモーク＋<E2E: 行のシナリオ>）結果 / e2e-run（実行した場合）
   - 全件: 夜間実行に委ねる
   ```

ドキュメントのみの変更は、手元検証も CI の E2E も不要（E2E PR の起動対象かは `e2e-pr.yml` に従う）。

## 3. 失敗したときの調べ方

- 失敗したステップのログ：`gh run view <run-id> --log-failed`
- ログとスクリーンショット（`--shot` 指定時）の取得：`gh run download <run-id>`
  - 保存場所は `.verify/`。成果物名は `e2e-pr-log` / `e2e-run-log` / `e2e-nightly-log`
- 画面の確認が必要なときは、`e2e-run` に `--shot` を付けて再実行する。

## 4. スモーク6本の意味

| シナリオ | 検出する致命的な問題 |
| --- | --- |
| `app-version` | キャッシュ更新漏れ（`APP_VERSION` と `CACHE_NAME` の不一致） |
| `sw-routing` | Service Worker の配信経路の破損 |
| `p3-offline` | オフラインで動かない |
| `lesson-picker` | レッスンを選べない |
| `cmd01-flow` | レッスンを最後まで進められない |
| `guardian-gate` | 保護者ゲートが開かない |

スモークに加える・外すときは Issue で決め、この表と `e2e-pr.yml` の `SMOKE` を同時に更新する。

## 5. 夜間E2Eが失敗したとき

1. セッション開始時に `gh issue list --label e2e-nightly --state open` を確認し、あれば最優先で対応する。
2. 失敗したシナリオを `e2e-run` で再実行して再現させ、原因のコミットを特定して修正する（1 Issue = 1 PR）。
3. 修正PRの `E2E:` 行に、失敗していたシナリオを含める。
4. マージ後に `gh workflow run e2e-nightly.yml` を実行し、通れば Issue を閉じる。
5. 再実行すると通る不安定な失敗は、テストを削らずに Issue に記録し、待ち方の見直しを別 Issue にする。

## 6. 手元実行のガード

- `tools/verify-all.mjs`（`npm run verify:e2e` 経由を含む）は、環境変数 `CI` も `E2E_LOCAL=1` も無い場合、`e2e-run` の案内を表示して終了する（終了コード2）。
- `.claude/verify/run.mjs` はテンプレート配布物のため steam-kids ではガードを入れていない。直接実行もしない（ガード追加はテンプレート側で扱う）。
- ユーザーが明示的に手元での実行を指示したときだけ、`E2E_LOCAL=1` を付けて実行してよい。

## 7. 注意点

- CI で1回実行するごとに、準備に1〜2分かかる。途中確認はシナリオをまとめて1回で投げる。
- `e2e-run` は、ワークフローが main に入ってからでないと起動できない（GitHub の仕様）。
- GitHub の定期実行は、リポジトリに60日間動きがないと自動停止する。
- 公開リポジトリなので Actions は無料。プライベートに変える場合は、実行回数を見直す。

- 確認用（マージ不要。Checks が起動しないことの確認）
