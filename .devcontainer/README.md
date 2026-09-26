# .devcontainer

Codespaces上でOpenCode Webを使うための環境構築。`.claude/verify/README.md`と同様、
利用時のみ読む（毎セッション冒頭には読まない）。

## OpenCode Webの起動

```
opencode web
```

`post-create.sh`が`~/.bashrc`に`opencode`関数を追加しており、`web`サブコマンド実行時に
自動で`--hostname 0.0.0.0 --port 4096`が付与される（既定の`127.0.0.1`バインドのままだと
Codespacesのポート転送機構から到達できないため）。別のホスト/ポートを使いたい場合は
明示的に指定すれば上書きできる（例: `opencode web --port 5000`）。

起動後、VS Code / Codespacesのポート転送通知、またはPORTSタブから転送URLを開く。

## ポート可視性

`devcontainer.json` で `4096` を **private** に設定している。**Publicに変更しないこと。**
OpenCode Webはシェルアクセス権を持つAIエージェントの操作UIであり、公開するとURLを知る
誰でもリポジトリを操作できる状態になる。privateであればGitHub認証済みの本人のみアクセスできる。

## APIキーの設定

Codespaces Secrets（リポジトリまたはアカウント単位）に、標準の環境変数名で設定する
（例: DeepInfraなら`DEEPINFRA_API_KEY`）。`devcontainer.json`・`post-create.sh`に
APIキーを直書きしない。

## OpenCode 利用時のプロバイダー設定・設計と実装のモデル分離

`docs/agents/opencode.md`参照。

## 初回起動が遅い場合

`post-create.sh`はChromiumを毎回ダウンロードするため、初回Codespace作成に数分かかる。
頻繁にCodespaceを作り直すなら、GitHubの[Codespaces prebuilds](https://docs.github.com/ja/codespaces/prebuilding-your-codespaces)を設定するとこの時間を短縮できる。

## Nodeバージョンの自動切替（`.nvmrc`）

base imageは`javascript-node:20`固定（配布先が複数あり、各々のNode要求が異なりうるため）。
配布先のリポジトリ直下に`.nvmrc`があれば、`post-create.sh`が起動時にnvmでそのバージョンへ
切り替える（メジャーバージョンが既に一致していれば何もしない。`.nvmrc`が無ければ完全にno-op
でbase imageのNodeのまま）。

切替はOpenCode CLI・Playwrightのグローバル導入より前に行われる（nvmはNodeバージョンごとに
グローバルディレクトリを分けるため、導入後に切り替えるとコマンドがPATHから消える）。
そのため`opencode`・`playwright`は常に`.nvmrc`が指すバージョン配下に入る。

`.nvmrc`はこのファイル自体は配布対象外（各リポジトリが持つ）。project-template自身には
`.nvmrc`を置かない。

## main直接commit・直接push防止フック（.githooks）

`post-create.sh`が`git config core.hooksPath .githooks`を実行し、リポジトリ直下の
`.githooks/pre-commit`（mainブランチ上での`git commit`を拒否）と`.githooks/pre-push`
（mainへの直接push・force pushを拒否）を有効化する（AGENTS.md「GitHub運用」を機構的に
補強するもの）。エラー時のメッセージに従って`git fetch origin main && git checkout -b
<branch-name> origin/main`で作業ブランチを作ってからcommit/pushし直す。意図的に回避する
場合は`--no-verify`。

このフックの有効化はCodespaces起動時（`post-create.sh`実行時）のみ自動で行われる。ローカル
環境では`git config core.hooksPath .githooks`を手動で実行すれば同様に効く。配布先で
`core.hooksPath`が既に設定済み（husky等）の場合は上書きせずスキップする。

## プロジェクト固有の依存を追加する場合

`.devcontainer/setup-project.sh` を作成すると、`post-create.sh`の末尾から自動実行される。
このファイルは配布対象外（`.github/sync-files.txt`に含まれない）なので、各リポジトリが
自由に編集してよい（例: `npm install`、フレームワーク固有のセットアップ）。
