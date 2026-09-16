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

## OpenCode 利用時のプロバイダー設定

リポジトリ直下の`opencode.json`にはpermission・agent定義・instructionsのみを置き、
`provider`・`model`・APIキーは書かない。プロバイダーとモデルの選択は実行環境ごとの
事情（契約しているサービス・コスト・利用可能なモデル）で変わるため、各自のグローバル
設定`~/.config/opencode/opencode.json`に置く。OpenCodeの設定はグローバル→プロジェクトの
順にマージされプロジェクト側が優先されるため、プロジェクト側に`model`を書くとグローバル
の指定を上書きしてしまう。

手順：

1. APIキーを**標準の環境変数名**で設定する（DeepInfraなら`DEEPINFRA_API_KEY`、Anthropic
   なら`ANTHROPIC_API_KEY`）。OpenCodeはmodels.devのプロバイダー定義に沿った名前を自動
   検出するため、`DEEPINFRA_TOKEN`のような独自の名前では認識されない
2. `opencode`を起動し、**実際にチャットを1回送信して応答が返ることを確認する**。
   `/models`にモデルが表示されても認証の成否は判定できない（未認証でもモデル一覧は
   表示される）
3. 既定モデルを固定したい場合は、グローバル設定に`model`を書く

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "deepinfra/deepseek-ai/DeepSeek-V3"
   }
   ```

4. 手順2で`missing API key`になる場合のみ、`provider`ブロックでAPIキーを明示する

   ```json
   {
     "provider": {
       "deepinfra": { "options": { "apiKey": "{env:DEEPINFRA_API_KEY}" } }
     }
   }
   ```

`provider`ブロックの明示指定は環境変数の自動検出より優先される。参照先の環境変数が
未設定だと空のAPIキーで上書きされ、`/models`にはモデルが表示されるのにチャット送信時
のみ`missing API key`となるため原因が分かりにくい。環境変数名を変更したときは、古い
名前を参照する`provider`ブロックがグローバル設定に残っていないか確認する。

APIキーの値そのものは設定ファイルに書かず、必ず`{env:...}`参照にする。

## 設計と実装でモデルを分ける

`opencode.json`の`agent.plan`は既に編集不可（`tools:{write:false, edit:false, patch:false}`）に設定されているため、planのままでは実装に進めず、実装するには必ずTabでbuildへ切り替える操作が必要になる。この切り替えのタイミングで、OpenCodeのモデルピッカーから実装用モデルを都度選び直す。

モデル名は更新頻度が高いため、`opencode.json`・グローバル設定のいずれにも特定のモデル名を書かない（ハードコードしない）。設計時に高単価モデルを使っていた場合でも、実装に進む際は必ずこの選び直しのタイミングでユーザー自身が確認・選択する。

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

## main直接commit防止フック

`post-create.sh`が`pre-commit`フックを導入し、`main`ブランチ上での`git commit`を拒否する
（CLAUDE.md「GitHub運用」のmain直接push禁止を機構的に補強するもの）。エラー時のメッセージに
従って`git fetch origin main && git checkout -b <branch-name> origin/main`で作業ブランチを
作ってからcommitし直す。意図的に回避する場合は`git commit --no-verify`。

このフックはCodespaces起動時（`post-create.sh`実行時）のみ導入される。Claude Code webセッション
では効かない。また配布先に`project-template:no-commit-on-main`マーカーを含まない既存の
pre-commitフックがある場合は上書きせずスキップする。

## プロジェクト固有の依存を追加する場合

`.devcontainer/setup-project.sh` を作成すると、`post-create.sh`の末尾から自動実行される。
このファイルは配布対象外（`.github/sync-files.txt`に含まれない）なので、各リポジトリが
自由に編集してよい（例: `npm install`、フレームワーク固有のセットアップ）。
