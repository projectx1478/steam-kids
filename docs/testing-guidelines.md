# テスト実行ガイドライン（E2Eは手元で実行せずGitHub Actionsで実行）

配布物（同期で上書きされる）。リポジトリ固有の値は書かず、参照先（`e2e-pr.yml`・PROJECT.md）を正とする。
`config.mjs`の`ciOnly`を有効にしたリポジトリ向けの運用。`ciOnly`が無いリポジトリは、AGENTS.md「検証フェーズ」の「CI実行」指定が無い場合と同じく手元で全コマンドを実行する。

## 1. 方針

- **E2E（`.claude/verify/run.mjs`・`run-all.mjs`）は、個別・全件を問わず手元で実行しない。すべてGitHub Actionsで実行する。** 手元実行はガード（§6）が既定で止める
- 手元で実行してよいのは、ブラウザを使わない軽量チェックのみ（PROJECT.md「検証コマンド」表で実行場所が「手元」のもの）
- 「テストを通すための書き換え・skip・期待値の合わせ込み禁止」は従来どおり有効
- どのAI・人が開発しても同じワークフローを使う

検証は「軽量チェック（手元・CI）→ E2E（CIのみ）」の2段で行う。軽量チェックは手元でもCI（`checks.yml`）でも同じコマンドを使う。

| 目的 | ワークフロー | 起動 | 実行内容 |
| --- | --- | --- | --- |
| PRの軽量チェック | `checks.yml` | PRの作成・更新で自動 | PROJECT.md「検証コマンド」の軽量チェック |
| 実装中の確認 | `e2e-run.yml` | `gh workflow run`（手動） | 指定シナリオのみ（`all`で全件） |
| PRの最低ライン | `e2e-pr.yml` | PRの作成・更新・本文編集で自動 | スモーク＋PR本文の`E2E:`行 |
| 回帰の網羅 | `e2e-nightly.yml` | 毎晩2時（コミットがあった日）／手動 | 全件 |

## 2. 開発の流れ

1. 実装する。コードを変えたら軽量チェックを手元で実行する
2. ブランチをpushする
3. 途中で確かめたいシナリオは`e2e-run`で実行する

   ```
   gh workflow run e2e-run.yml --ref <ブランチ> -f scenarios="<シナリオ名…>"
   gh run watch "$(gh run list --workflow e2e-run.yml --branch <ブランチ> --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
   ```

4. PRを作る。本文に`E2E:`行を書き、この変更に関係するシナリオを列挙する（最大12本）。**このPRで追加・変更したシナリオは必ず含める**。影響シナリオは`grep -l '<キーワード>' .claude/verify/scenarios/*`で列挙する

   ```
   E2E: login-success form-validation-error --mobile
   ```

5. `gh pr checks --watch`で、**E2E PRが緑になるまで**直す
6. 完了報告には次の形で書く

   ```
   検証:
   - 手元: <軽量チェック>（結果）
   - CI: Checks結果 / E2E PR（スモーク＋<E2E:行のシナリオ>）結果 / e2e-run（実行した場合）
   - 全件: 夜間実行に委ねる
   ```

ドキュメントのみの変更は、手元検証もCIのE2Eも不要（E2E PRの起動対象は`e2e-pr.yml`の`paths-ignore`に従う）。

## 3. 失敗したときの調べ方

- 失敗したステップのログ：`gh run view <run-id> --log-failed`
- ログとスクリーンショット（`--shot`指定時）の取得：`gh run download <run-id>`。保存場所は`.verify/`、成果物名は`e2e-pr-log`／`e2e-run-log`／`e2e-nightly-log`
- 画面の確認が必要なときは、`e2e-run`に`--shot`を付けて再実行する

## 4. スモーク

PRごとに必ず実行するシナリオ。一覧は`e2e-pr.yml`の`SMOKE`が正。致命的な問題（起動不能・主要フロー不能など）だけを検出する少数に絞る。加える・外すときはIssueで決め、`SMOKE`を更新する。

## 5. 夜間E2Eが失敗したとき

1. セッション開始時に`gh issue list --label e2e-nightly --state open`を確認し、あれば最優先で対応する（AGENTS.md「起動時の必須手順」）
2. 失敗したシナリオを`e2e-run`で再実行して再現させ、原因のコミットを特定して修正する（1 Issue = 1 PR）
3. 修正PRの`E2E:`行に、失敗していたシナリオを含める
4. マージ後に`gh workflow run e2e-nightly.yml`を実行し、通ればIssueを閉じる
5. 再実行すると通る不安定な失敗は、テストを削らずにIssueに記録し、待ち方の見直しを別Issueにする

## 6. 手元実行のガード

- `.claude/verify/run.mjs`・`run-all.mjs`は、`config.mjs`の`ciOnly`が有効で、環境変数`CI`も`E2E_LOCAL=1`も無い場合、`e2e-run`の案内（＋`hint`）を表示して終了する（終了コード2）
- ユーザーが明示的に手元での実行を指示したときだけ、`E2E_LOCAL=1`を付けて実行してよい

## 7. 注意点

- CIで1回実行するごとに準備に1〜2分かかる。途中確認はシナリオをまとめて1回で投げる
- `e2e-run`は、ワークフローがmainに入ってからでないと起動できない（GitHubの仕様）
- GitHubの定期実行は、リポジトリに60日間動きがないと自動停止する
- プライベートリポジトリではActionsの実行時間が課金・上限の対象になる。実行回数を見直す
