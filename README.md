# プロジェクトテンプレート

汎用プロジェクトテンプレート。このテンプレートから新規プロジェクトを生成できます。

## 使い方

1. GitHub Web UI で「Use this template」をクリック
2. 新しいリポジトリ名を入力
3. 生成されたリポジトリをクローン
4. README.md, PROJECT.md, SESSION.md を編集

## ファイル構成

- **README.md** - プロジェクト説明（ユーザー向け）
- **PROJECT.md** - 要件定義・設計・開発ルール
- **SESSION.md** - 進捗管理・引き継ぎ情報
- **CLAUDE.md** - Claude Code 運用ルール
- **AGENTS.md** - OpenCode 向け行動規範
- **opencode.json** - OpenCode の permission・agent 定義
- **.claude/** - Claude Code のフック・検証ハーネス・スクリプト
- **.devcontainer/** - Codespaces/OpenCode Web 用の開発コンテナ設定
- **.gitignore** - Git 除外ファイル設定

## ライセンス

MIT
