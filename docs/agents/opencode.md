# OpenCode 固有ガイド

共通ルールはAGENTS.md参照。ここではOpenCode固有の行動規範・権限設定・プロバイダー設定のみを記載する。

## 起動時の必須手順（Codespace）

Codespace起動直後で`main`ブランチにいる場合、編集を始める前にAGENTS.md「GitHub運用」に従い`origin/main`起点の作業ブランチへ切り替える。Codespaceは再開時も前回の作業ツリーが残り、古いファイルを最新と誤認するため、AGENTS.mdの起動時手順（`git fetch origin main && git log --oneline HEAD..origin/main`）を必ず実行する。

## 設計と実装でモデル・エージェントを分ける

設計・調査タスクはplanエージェントで開始する（Web UIでは入力欄左下のドロップダウンまたは`Ctrl/Cmd + .`で切り替え。Tabキー（`agent.cycle`）はTUI専用でWeb UIでは効かない。セレクタは`opencode.json`にカスタムエージェント定義がある場合のみ表示される）。buildに居続けると本節のガードは働かない。設計案を提示したら同一ターンで実装に進まず停止し、buildエージェントへの切り替えと、GUIのモデルピッカーでの実装用モデルの選び直しをユーザーに促す。

`opencode.json`の`agent.plan`は既に編集不可（`tools:{write:false, edit:false, patch:false}`）に設定されているため、planのままでは実装に進めず、実装するには必ずTabまたはドロップダウンでbuildへ切り替える操作が必要になる。

モデル名は更新頻度が高いため、`opencode.json`・グローバル設定のいずれにも特定のモデル名を書かない（ハードコードしない、Issue #63の教訓）。設計時に高単価モデルを使っていた場合でも、実装に進む際は必ずこの選び直しのタイミングでユーザー自身が確認・選択する。

## OpenCode の権限設定

`permission`はAGENTS.mdのauto方針準拠で、`edit`・`bash`とも既定allow。守るのはdeny群（`git reset`/`git clean`/force push/`rm -rf`。履歴・ファイル破壊はPR revertで回復不能なため）と`git push *:main*`のask（PRマージという人間ゲートを迂回させないため）のみ。パターンは最後にマッチしたルールが勝つため、`opencode.json`では`"*"`を先頭に置く。

## OpenCode 利用時のプロバイダー設定

リポジトリ直下の `opencode.json` には permission・agent 定義・instructions のみを置き、`provider`・`model`・APIキーは書かない。プロバイダーとモデルの選択は実行環境ごとの事情（契約しているサービス・コスト・利用可能なモデル）で変わるため、各自のグローバル設定 `~/.config/opencode/opencode.json` に置く。OpenCode の設定はグローバル → プロジェクトの順にマージされプロジェクト側が優先されるため、プロジェクト側に `model` を書くとグローバルの指定を上書きしてしまう。

手順：

1. APIキーを**標準の環境変数名**で設定する（DeepInfra なら `DEEPINFRA_API_KEY`、Anthropic なら `ANTHROPIC_API_KEY`）。OpenCode は models.dev のプロバイダー定義に沿った名前を自動検出するため、`DEEPINFRA_TOKEN` のような独自の名前では認識されない
2. `opencode` を起動し、**実際にチャットを1回送信して応答が返ることを確認する**。`/models` にモデルが表示されても認証の成否は判定できない（未認証でもモデル一覧は表示される）
3. 既定モデルを固定したい場合は、グローバル設定に `model` を書く

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "deepinfra/deepseek-ai/DeepSeek-V3"
   }
   ```

4. 手順2で `missing API key` になる場合のみ、`provider` ブロックでAPIキーを明示する

   ```json
   {
     "provider": {
       "deepinfra": { "options": { "apiKey": "{env:DEEPINFRA_API_KEY}" } }
     }
   }
   ```

`provider` ブロックの明示指定は環境変数の自動検出より優先される。参照先の環境変数が未設定だと空のAPIキーで上書きされ、`/models` にはモデルが表示されるのにチャット送信時のみ `missing API key` となるため原因が分かりにくい。環境変数名を変更したときは、古い名前を参照する `provider` ブロックがグローバル設定に残っていないか確認する。

APIキーの値そのものは設定ファイルに書かず、必ず `{env:...}` 参照にする。

## Codespaces環境構築

`opencode web`の起動・ポート設定・Nodeバージョン切替・main直接commit防止フック等は`.devcontainer/README.md`参照（利用時のみ読む）。
