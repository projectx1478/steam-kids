# SESSION.md

最終更新：2026-09-25（拡張プランv2のIssue起票 #53〜#70）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**なし。** 拡張プランv2（フェーズA・K・B・R）のIssueを起票した。親トラッキング #53、
子Issue #54〜#70（A1〜A5、K1、B1〜B8、R1〜R3）。EN・C〜Eは未起票。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3、#22・#29・#37・#38・#45完了・Worker自動デプロイ導入まで完了済み
  （詳細はgit/PR履歴とIssue #3）
- **#48マージ・クローズ**（2026-09-21）。PR #49。`play.groupRepeats`
- **#30マージ・クローズ**（2026-09-21）。PR #50。`lesson-author`スキル・レッスン2
- **#31マージ・クローズ**（2026-09-21）。PR #51。`play.initialCommands`・レッスン3
  「なおす」・レッスン選択画面（`lessons/index.json`）
- **Issue #3更新**（2026-09-21）。P4・P5完了の記録、P4/P5実装中に見つけた副産物を追記
- **#43マージ・クローズ**（2026-09-25）。PR #52。`p3-link.mjs`の`seed()`に、実行環境依存で
  発生する`Execution context was destroyed`検知時の再試行を追加（真因は未確定のまま。
  本番コードは未変更）

# 引き継ぎ事項

拡張プランv2はリポジトリにコミットしない。共通制約・決定事項・順序は#53に記録済み
（各子Issueは#53を参照すれば自己完結）。順はA→K→B→R。**A1〜A5とB1完了時点で実機で
子どもの反応を確認し、B2以降・Rの優先度を見直す**（B2以降は着手前にユーザーへ確認）。
K1（#59）のPRでPROJECT.md「8. 未決事項」の漢字出典を更新する（ユーザー指示）。

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
- `lessons/index.json`はレッスン選択画面の一覧ファイル（レッスン本体ではない）。
  `validate-lessons.mjs`はファイル名で除外している。レッスン追加時はレッスンJSON本体＋
  この1行を更新する

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
- 学年別許可漢字リストの出典（「学年別漢字配当表」に決定済み。K1 #59のPRでPROJECT.mdへ反映するまで「漢字ゼロ」の暫定規則で運用中）

# 未コミットの変更

なし

# 次回最初に行うこと

A1（#54）から着手する（実装はSonnet）。#53と#54を読み、実装方針（検証計画を含む）を提示して承認を得る。
