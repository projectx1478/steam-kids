# 自動進行のクラウド引き継ぎ（備忘録）

手元のターミナルで 5時間枠が尽きたとき、クラウドセッションのクレジットで `/run-issues` を続ける手順。状態ファイルは公開リポジトリに置けないため、非公開リポジトリ `steam-kids-state` と `tools/autopilot-state.mjs` で受け渡す（Issue #442）。

## 仕組み
- 同期対象：`review/design/`・`review/autopilot/`（`runlogs/` と `lock.txt` を除く）・`review/handoff-*.md`。コピーは追加と上書きだけで、削除はしない。
- 作業コピーは `<MAIN>/.worktrees/_state`。コミットは noreply・Co-Authored-By なし。
- lock：`start` で取り、`finish` で外す。他方が12時間以内に lock 中なら終了コード2（`STOP（他方が実行中）`）。
- 手元は `start local`、クラウドは `start cloud`。`/run-issues` が起動時に `start`、どの停止でも `finish`（push してから unlock）を実行する。
- クラウドは 5時間の判定をしない。週間 85％の判定と件数上限（実装2件・設計3件）は残る。

## 手元 → クラウド
1. 手元の `/run-issues` が停止（`finish` まで済み）していることを確認する。次の場合は手動で `node tools/autopilot-state.mjs finish`：
   - `/run-issues` を使わず、`review/` の状態ファイル（approved.md・inbox.md など）を直接編集した。
   - セッションが落ちた、または途中で止めた（lock が12時間残る）。
2. 作業ブランチ（`feature/...`）を push 済みにする。未 push のコミットはクラウドから見えない。
3. claude.ai/code で新しいセッションを作る。環境は Default、リポジトリは `projectx1478/steam-kids`。
4. 最初の依頼文：
   ```
   add_repo で projectx1478/steam-kids-state を access: push で追加して。
   そのあと /run-issues クラウド 週間 ○% を実行して。
   ```
   週間の値は `/usage` の最新値。`steam-kids-state` を付けないと clone できない（`could not read Username`）。

## クラウド → 手元
1. クラウドの停止時に `finish` が実行されていることを確認する（実行されていなければ、クラウドで `node tools/autopilot-state.mjs finish`）。
2. 手元で `git fetch origin main` し、必要なら `.worktrees/<N>` を更新する。
3. 手元の `review/` に、クラウドへ出していない編集があれば、先に `node tools/autopilot-state.mjs push`（`start` は、`queue.md`・`log.md`・`decisions/inbox.md` に未同期の編集があれば上書きせず `STOP`（終了コード3）。`queue-inbox.md` は追記マージ）。
   - 終了コード3で止まったときの復帰：手元の該当ファイルの編集を別名に退避 → `start` で state を pull → 退避分を手で反映し直す。
   - キューへの追加は `review/autopilot/queue-inbox.md` に書く（`queue.md` を直接編集しない。`start` が末尾へ取り込む）。
4. `/run-issues 週間 ○% 5時間 ○%` を起動する（`start local` が pull する）。

## 予算不足で止まったとき
手元の `/run-issues` が 5時間の予算不足で止まると、next.txt の1行目が `STOP（予算不足：クラウドで続行可）` になり、引き継ぎ書の起動欄にクラウド用の依頼文が書かれる。クラウドの起動は悠さんが手動で行う。

## 未確認
- クラウドでの `gh`（PR の作成・checks）の可否は、実運用の最初の PR で確認する。
