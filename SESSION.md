# SESSION.md

最終更新：2026-09-26（#80マージ・クローズ）

引き継ぎ専用。進捗・仕様はここに書かない（仕様→PROJECT.md、進捗→git/PR履歴、個別タスク→GitHub Issue）。

---

# 現在作業中のタスク

**実機フィードバック対応。** #80完了（マージ・クローズ済み）。次は**#81 C2 チュートリアル**、
その後**#82 C3 ボリューム増**を1 Issue=1PRで実装。設計はOpus→承認後Sonnetへ引き継ぐ
（CLAUDE.md「モデル選択ルール」）。設計・完了条件・検証計画は各Issue本文が正。
**B2以降・Rは#80〜#82完了後の再実機確認まで保留**。
拡張プランv2の親トラッキング #53、子Issue #54〜#70。EN・C〜Eは未起票。

# 完了したタスク（直近のみ・正本はgit/PR履歴とIssue #3）

- **#80マージ・クローズ**（2026-09-26）。PR #83。predictステップの盤面から`goal`を非表示化、
  ゴールの見た目を星→旗＋「ゴール」の文字に変更（星はクリア演出・単元スタンプ専用に統一）、
  playステップに指示文（`play.text`）と「もくひょう行」（ゴール・のこりアイテム数）を追加。
  5レッスンに`play.text`追加・`predict.text`を統一
- **#60マージ・クローズ**（2026-09-25）。PR #78。`play.items`（マス座標配列）を追加し、
  クリア条件を「ゴール到達」→「ゴール到達 かつ 全item回収」に変更。`engine-grid.js`の
  `simulate()`が`pickups`/`remainingItems`を返すよう拡張、`validate-lessons.mjs`のBFSに
  item回収ビットマスクを追加。新unit`donguri`にレッスン2本
  （`donguri-01-hirou`・`donguri-02-mawarimichi`）を追加
- P0〜P3、#22・#29・#37・#38・#43・#45・#48・#30・#31・#54・#55完了（詳細はgit/PR履歴とIssue #3）
- **#56マージ・クローズ**（2026-09-25）。PR #73。プレイヤー駒をロボット風SVGに変更
  （目線のみ移動方向へ追従、体は回転させない）。`view.confetti()`を追加しゴール到達時に
  紙ふぶき（粒子24個・1.5秒で除去）を表示。いずれもreduced-motion時は無効
- **#57マージ・クローズ**（2026-09-25）。PR #74。ボタン押下縮小（`active:scale-95`・
  100ms）と`navigator.vibrate`（未対応環境では何もしない）を追加。ステップ進行ドット
  と横スライド遷移（`prefers-reduced-motion`時は無効）を`renderStep()`に追加
- **#58マージ・クローズ**（2026-09-26）。PR #75。`lessons/index.json`を`units`構造へ拡張し、
  単元マップ（しま）＋レッスン完了スタンプ・単元全クリアの旗を追加（`js/ui-picker.js`新規）。
  入口→レッスンは従来通り1タップ（中間の単元選択画面は挟まない）
- **#76マージ・クローズ**（2026-09-26、#58に同梱）。`.claude/verify/run.mjs`がネイティブ
  Windows Nodeで動かない既存バグ（ESM動的importのURL scheme）を`pathToFileURL`化で修正
- **#59マージ・クローズ**（2026-09-26）。PR #77。`{漢字|よみ}`のルビ記法と`js/kanji-grades.js`
  （学年別漢字配当表・1026字）を追加。端末内の「よみレベル」（ダッシュボード内で設定・同期
  しない）に応じて漢字⇔ひらがなを出し分ける。ふりがなトグルの既定値をONに変更し、切替時は
  `refreshRubyText()`で該当要素のみ再描画。`validate-lessons.mjs`をルビ記法対応に更新し、
  PROJECT.md「8. 未決事項」から漢字出典を削除・Issue #3も反映済み

# 引き継ぎ事項

拡張プランv2はリポジトリにコミットしない。共通制約・決定事項・順序は#53に記録済み
（各子Issueは#53を参照すれば自己完結）。順はA→K→B→R（A・K・B1完了）。実機確認済みで、
#80〜#82を先行。完了後に再度実機確認し、B2以降・Rの優先度をユーザーと見直す。

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
- `.claude/verify/run.mjs`のWindows ESM修正（#76）はテンプレート同期PR #79で巻き戻り済み
  （`.claude/`は配布先で編集しない運用のため）。配布元project-templateにIssue起票済み
  （projectx1478/project-template#93）。修正されるまで、検証時はローカルでのみ一時的に
  `pathToFileURL`化を当てて実行し、コミットには含めない

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

# 未コミットの変更

なし

# 次回最初に行うこと

Opusで#81（C2 チュートリアル）の実装方針（検証計画含む）を設計し、承認後にIssueへ記載して
Sonnetへ引き継ぐ。既存シナリオの期待値は変更しない（構造が変わる既存シナリオは凍結fixture＋
`page.route`で保護）。
