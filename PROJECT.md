# PROJECT.md

## プロジェクト概要

[プロジェクト名]
[プロジェクト説明]

## 1. 要件定義

### 主要機能

- [機能1]
- [機能2]
- [機能3]

## 2. 技術設計

### フロントエンド

- **フレームワーク**: バニラ JavaScript（ビルドステップなし、ES Modules使用）
- **UI状態管理**: S オブジェクトパターン（単一オブジェクト、直接変更）
- **スタイリング**: CSS
- **ホスティング**: GitHub Pages / Vercel

### バックエンド

- [バックエンド技術]
- [API仕様]

### セキュリティ設計（機密情報管理）

以下は Firebase + Cloudflare Worker 構成を採用する場合の例。実際に採用する技術に応じて置き換える。

- 課金・利用制限に直結するAPIキー（例: Gemini APIキー）、DB管理者権限の接続情報、認証パスワード・トークン・秘密鍵など、漏洩により金銭的損害や不正アクセスにつながる真の秘密情報は、クライアント側コード（Gitにコミットされるファイル）へ直書きしない
- 秘密情報は必ずサーバー側コンポーネント（例: Cloudflare Worker）に隔離し、クライアントは認証トークン（例: Firebase idToken）経由でのみアクセスする
- 例外：Firebase Web SDKの`firebaseConfig`（apiKey・authDomain・projectId等）は、Firebase仕様上クライアントに公開される前提の識別子であり、実際のアクセス制御はFirestoreセキュリティルール側で行われるため直書きを許容する。ただし値は1箇所（設定セクション）に集約し、変更・移行時は必ずユーザーに確認する
- Cloudflare WorkerのURL等、公開されても問題ない外部サービスのエンドポイントは直書きを許容するが、1箇所への集約とユーザー確認を徹底する
- 新たに「真の秘密情報」に該当する値を追加する場合は、直書きせず必ずユーザーに設計を確認する

### ファイル構成

```
index.html          # 骨格
style.css           # 全CSS
app.js              # エントリーポイント（初期化・全体の起動処理のみ）
js/
  state.js           # 状態管理（Sオブジェクト）
  api.js             # API通信
  ui-xxx.js          # 機能単位のUI処理（機能ごとにファイルを分ける）
.env.local          # 環境変数（Git 除外）
README.md
PROJECT.md
SESSION.md
CLAUDE.md
AGENTS.md            # OpenCode向け行動規範
opencode.json        # OpenCodeのpermission・agent定義
.claude/             # Claude Codeのフック・検証ハーネス・スクリプト
.devcontainer/        # Codespaces/OpenCode Web用コンテナ設定
.gitignore
```

ES Modules（`<script type="module">` / `import`/`export`）でファイル間を接続する。ビルドステップは導入しない。

## 3. 開発ルール

### Git ワークフロー

- **Main ブランチ**: 本番環境。直接 push 禁止
- **Feature ブランチ**: Claude Codeセッションは`claude/xxx`（セッションが自動採番）。人が作業する場合は`feature/XXX`または`fix/XXX`
- **Commit**: 論理的に小さな単位（Small Commit）
- **Pull Request**: 機能単位で作成

### 検証コマンド
コード変更後に必ず実行する。未設定の項目は「なし」と明記する（空欄にしない）。

| 種別 | コマンド |
| --- | --- |
| テスト | [例: npm test] |
| Lint | [例: npx eslint .] |
| 型チェック | [例: npx tsc --noEmit] |
| ビルド | [例: なし（ビルドステップ不要）] |
| E2E/実機確認 | [例: node .claude/verify/run.mjs] |

### コーディング規則

- **ファイル名**: 小文字統一
- **変数命名**: camelCase
- **クラス**: PascalCase
- **定数**: UPPER_SNAKE_CASE
- **コメント**: 最小限（WHY が非自明な場合のみ）
- **ファイルサイズ**: コードは1ファイル目安1000行以内、超えたら機能単位で分割
- ドキュメントは字数基準（CLAUDE.md参照）

### 他プロジェクトからのコード再利用

コピーしてよいのは**次の4条件を全て満たす場合のみ**。

1. **外部依存ゼロ**（import が無い、または標準APIのみ）
2. **入出力がプリミティブ／プレーンオブジェクト**（フレームワーク型・グローバル状態に触れない）
3. **仕様が一意に決まる**（「似ている」ではなく「同一」。目的が違えば実装も違って当然で、無理に統合すると両方が劣化する）
4. **目安50〜100行以内**（これを超える規模はプロジェクト固有の判断を含んでいる）

コピーする際は、冒頭に**出典コメント（コミットハッシュまで）**を必ず書く。

```js
// 出典: assessment-app-web src/providers/gemini/client.ts @34f7f51
// コピーであり、コピー元の変更は自動追従しない
```

- コピー後は**独立資産**。上流のバグ修正は自動では来ない
- 改善をコピー元へ戻すかは都度の別判断（自動では逆流させない）
- コピー元側には「コピー先がある」と書かない（追跡できないため嘘になる）

## 4. Issue 管理

### ラベル分類

- `feature`: 新機能
- `bug`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント

## 5. AI 運用ルール（Claude Code）

### AI の責務

- コード実装・修正
- 仕様整理時の質問対応
- 技術判断の提案

### 人間の責務

- 仕様確定
- コード レビュー
- Merge 判定

### OpenCode の権限設定

`permission` は Claude Code の auto モード準拠で、`edit`・`bash` とも既定 allow。守るのは deny 群（`git reset` / `git clean` / force push / `rm -rf`。履歴・ファイル破壊はPR revertで回復不能なため）と `git push *:main*` の ask（PRマージという人間ゲートを迂回させないため）のみ。パターンは最後にマッチしたルールが勝つため、`opencode.json`では`"*"`を先頭に置く。

### OpenCode 利用時のプロバイダー設定

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

## 6. ロードマップ

### Phase 1: MVP

- [ ] 基本機能実装

### Phase 2: 改善

- [ ] パフォーマンス最適化
- [ ] モバイル対応テスト

## 7. 関連ドキュメント（docs/）

本ファイルが目安12,000字を超えたら、機能単位でdocs/以下に分割し、ここに索引を追加する（CLAUDE.mdのトークン節約の方針を参照）。索引のない分割は読み忘れを招くだけなので、分割時は必ずこのセクションに追記すること。

分割前（本ファイルが12,000字未満）は、このセクションは空のままでよい。

<!-- 分割時の記法例
- `docs/requirements.md` — 要件定義の詳細。機能仕様を確認・変更する際に読む
- `docs/design-xxx.md` — xxx領域の詳細設計。xxx関連の実装時に読む
-->

