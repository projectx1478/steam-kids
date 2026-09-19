# SESSION.md

最終更新：2026-09-19（PR #27マージ済。配信キャッシュ問題を#28として起票、P4・P5も起票）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**Issue #28（配信キャッシュ対策・Service Worker導入）を次に実装する。** 設計は承認済みで
Issue #28本文に全て記載（移植元コミット・分岐規則・検証計画・落とし穴）。実装はSonnetが行う。

PR #27はマージ済だが、**マージしても実機が新版へ変わらない**問題が発覚。原因は
本リポジトリに Service Worker も `manifest.json` も無く、`index.html` がバージョン無しの
固定パスで `app.js` / `style.css` を参照しているだけのため（GitHub Pagesの
`Cache-Control: max-age=600` と相まって再取得契機が無い）。同時に PROJECT.md 1章の
「オフラインで学習継続可能」も未達だったことが判明。両方を #28 で閉じる。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- P0〜P3完了（PR #4〜#26）。完了経緯・副産物はIssue #3に集約済み
- **#22フォローアップ**（2026-09-18）。同期不備4点を修正、全17シナリオ121チェックPASS。PR #27マージ済
- **Issue起票**（2026-09-19）。#28／#29／#30／#31。Issue #3の表も更新済み

# 引き継ぎ事項

**実装順序は #28 → #29 → #30 → #31。** #28 が Issue #22 の実機再確認をブロックしているため
必ず先行させ、単独PRで出す。各Issue本文に実装内容・判定可能な数値条件・検証計画が揃っている。

#28 の分岐規則・移植元コミット・落とし穴はIssue #28本文が正本。特に見落としやすい3点だけ再掲:

- **検証でSWを実登録しない。** SW内`fetch`が`page.route()`を貫通し実ネットワークへ出て誤FAILする。
  kids-player `.claude/verify/scenarios/service-worker-post-passthrough.mjs` の疑似self方式を使う
- アプリシェル取得は`cache: 'no-cache'`。SW内`fetch`は既定でHTTPキャッシュを経由するため
  （kids-playerはVercel配信でこの指定が無い。本リポジトリ固有の上積み）
- この修正は**既存端末には即座には効かない**。効くのは次の更新から。初回のみ手動リロードを依頼する

#28 マージ後、**ユーザーに実機2台で確認を依頼する**：①マージで新版に変わるか（本丸）②機内モードで
レッスンが進むか③Issue #22の①〜④が解消されているか④リンクコード入力しやすさ・ダッシュボードの
読みやすさ。問題なければIssue #22をクローズしてよい。

#29 は反映にユーザーの手動`wrangler deploy`が必要。#31 は #30 完了後に着手する。

## 恒久的な制約

- 本リポジトリは project-template の配布先。`CLAUDE.md` / `AGENTS.md` / `opencode.json` /
  `.claude/` 配下の同期対象ファイルは**本リポジトリで編集しない**（テンプレート同期PRで上書きされる）。
  プロジェクト固有の規則は PROJECT.md と `docs/` に置く
- `.github/` にbroadcast関連ファイルを置かない。配布元は project-template のみ
- `style.css` は Tailwind の生成物。直接編集禁止（`tailwind.src.css` を編集して再ビルド）
- 実行時に外部APIを呼ばない。CDNからのアセット取得も行わない（オフライン要件）
- 同期データに氏名・学校名・学年を含めない。これらを扱うフィールドを作らない
- Tailwindのcontentスキャンはコード中の識別子も拾う。ユーティリティ名と一致する語（例:
  `hidden`）を書くと無関係なクラスが再ビルド時に生成される。実害はないが、再ビルド後の
  `style.css`差分が「意図した変更」か確認してからコミットする

## 環境

- GitHub Pages は Settings → Pages で `main` / root を配信
- AIはリポジトリ作成・削除ができない（GitHub App に Administration 権限なし）。ユーザーがWeb UIで行う
- AIのサンドボックスからは `*.workers.dev` 等の任意外部ドメインへcurl等で直接到達できない
  （プロキシがpolicy denialで403を返す）。D1へはCloudflare MCP経由でアクセス可能。
  デプロイ済みWorkerへのAPI疎通確認が必要な場合はCodespaces等ユーザー側の実ネットワーク環境で
  実行してもらい、出力を貼ってもらう
- Cloudflareの `account_id` は `e869e1d895a7144f62de9105d5374a4a`
  （`workers/steam-kids-sync/wrangler.toml` に記載済み）

## 未着手Issue

- #3 P1〜P5 と未決事項のトラッキング（P3完了済み。P4→#30・P5→#31を起票済み）
- #22 リンクコードUIと複数端末の履歴統合表示（#28マージ後、実機再確認できればクローズ）
- #28 配信キャッシュ対策とオフライン対応（Service Worker導入）← **次に着手**
- #29 同期Workerとクライアントの版数ズレ検知（X-Worker-Version）
- #30 P4 Claude Codeによる教材生成フロー整備（スキル化）
- #31 P5 レッスン2・3の追加（#30完了後）

# 未コミットの変更

なし

# 次回最初に行うこと

Issue #28 を読み、`origin/main`起点のブランチでService Workerを実装する（モデルはSonnet）。
