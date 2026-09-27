# SESSION.md

最終更新：2026-09-27（Issue #91取り込み）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。
進行中タスクの正本は`agent:<tool>`ラベル付きのオープンIssue、完了タスクの正本はPR履歴（AGENTS.md
「並行作業の衝突回避」）。

---

# 引き継ぎ事項

保護者ゲートは二層（閲覧解錠＝ローカルPBKDF2照合でオフライン可／サーバー側にHMAC短命
トークンを追加・実装済み）。ローカル層は devtools・localStorage 編集で迂回可能なことを許容済み。
パスコードのリセットボタンは作らない（迂回口になるため）。解錠状態はモジュールスコープ変数の
みで保持（sessionStorage等は使わない）。詳細は`docs/design-sync.md`「保護者ゲート」。

`GET /sync`の1000件上限（`ts`昇順）は未解消の既知の制約（Issue #35に記載）。現状の利用規模では
非現実的だが、必要になれば別Issue化する。

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く。`.claude/skills/`は配布対象外なので
  本リポジトリに直置きしてよい（`.github/sync-files.txt`確認済み）
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
  （`.github/workflows/deploy-worker.yml`はプロジェクト固有のデプロイCIで対象外。#44参照）
- `style.css` は Tailwind の生成物。直接編集禁止（`tailwind.src.css` を編集して再ビルド）
- 実行時に外部APIを呼ばない。CDNからのアセット取得も行わない（オフライン要件）
- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない
- Tailwindのcontentスキャンはコード中の識別子も拾う。ユーティリティ名と一致する語（例:
  `hidden`）を書くと無関係なクラスが再ビルド時に生成される。実害はないが、再ビルド後の
  `style.css`差分が「意図した変更」か確認してからコミットする
- `lessons/index.json`はレッスン選択画面（単元マップ）の一覧ファイル（レッスン本体ではない）。
  `units: [{unitId, title, lessonIds}]`構造（#58）。`validate-lessons.mjs`が参照整合性を検証する。
  レッスン追加時はレッスンJSON本体＋該当`unit.lessonIds`（または新規unit）を更新する
  （`.claude/skills/lesson-author/SKILL.md`手順4）
- `.claude/verify/config.mjs`が`cmd-01-susumu`・`donguri-01-hirou`を凍結fixture（tutorial追加前）へ
  差し替えている。現行構造を検証する新シナリオは冒頭で`page.unroute('**/lessons/<id>.json')`する
  （c2・c3・c4と同じ）
- 無操作タイマー等の時間検証は`page.clock.install()`＋`fastForward`（Playwright 1.63）
- `node .claude/verify/run.mjs`全件をバックグラウンド実行すると、この端末ではメモリ不足で停止
  されることがある（#87・#90・#91で発生）。停止時は勝手に再実行せず、フォアグラウンドで
  シナリオを分割して実行する
- `.claude/verify/run.mjs`のWindows ESM修正は配布元project-template側に正式反映され、
  テンプレート同期PR #85で取り込み済み（2026-09-26。project-template#93対応）。以後は
  ローカルでの一時当ては不要

## 環境

- GitHub Pages は Settings → Pages で `main` / root を配信
- AIはリポジトリ作成・削除ができない（GitHub App に Administration 権限なし）。ユーザーがWeb UIで行う
- AIのサンドボックスからは `*.workers.dev` 等の任意外部ドメインへcurl等で直接到達できない
  （プロキシがpolicy denialで403を返す）。D1へはCloudflare MCP経由でアクセス可能。
  デプロイ済みWorkerへのAPI疎通確認が必要な場合はCodespaces等ユーザー側の実ネットワーク環境で
  実行してもらい、出力を貼ってもらう
- Cloudflareの `account_id` は `e869e1d895a7144f62de9105d5374a4a`
  （`workers/steam-kids-sync/wrangler.toml` に記載済み）

## 未決事項（PROJECT.md「8. 未決事項」・Issue #3にも記載）

- ダッシュボードの認証方法（校内配布時の教師向け保護。話が出た時点で決める）
