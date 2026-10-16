# SESSION.md

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。
進行中タスクの正本は`agent:<tool>`ラベル付きのオープンIssue、完了タスクの正本はPR履歴（AGENTS.md
「並行作業の衝突回避」）。

---

# 引き継ぎ事項

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く。`.claude/skills/`・`.claude/agents/`・`.claude/commands/`は配布対象外なので
  本リポジトリに直置きしてよい（project-templateの`.github/sync-files.txt`確認済み）
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
  （`.github/workflows/deploy-worker.yml`はプロジェクト固有のデプロイCIで対象外。#44参照）
- `style.css` は Tailwind の生成物。直接編集禁止（`tailwind.src.css` を編集して再ビルド）
- 実行時に外部APIを呼ばない。CDNからのアセット取得も行わない（オフライン要件）
- `lessons/index.json`はレッスン選択画面（単元マップ）の一覧ファイル。
  `tracks: [{trackId, title, units: [{unitId, title, lessonIds}]}]`の2段（#374）。`units`直下の古い形も読める（併用不可）。`validate-lessons.mjs`が参照整合性を検証する。
  レッスン追加時はレッスンJSON本体＋該当`unit.lessonIds`（または新規unit）を更新する
  （`.claude/skills/lesson-author/SKILL.md`手順4）

## 環境

- GitHub PagesはSettings → Pagesで`main` / rootを配信
- AIはリポジトリ作成・削除ができない（GitHub AppにAdministration権限なし）。ユーザーがWeb UIで行う
- AIのサンドボックスからは `*.workers.dev` 等の任意外部ドメインへcurl等で直接到達できない
  （プロキシがpolicy denialで403を返す）。D1へはCloudflare MCP経由でアクセス可能。
  デプロイ済みWorkerへの疎通確認はCodespaces等ユーザー側の実ネットワークで実行してもらい、
  出力を貼ってもらう

- 自動進行の状態（review/design・autopilot・handoff）は非公開リポジトリ `steam-kids-state` と `tools/autopilot-state.mjs` で同期し、手元とクラウドの同時稼働は lock（12時間）で防ぐ（#442。手順は `docs/autopilot-cloud.md`）
