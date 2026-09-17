# steam-kids

小学生向けインタラクティブSTEAM学習アプリ。

説明を読ませず、**操作して予想し、結果とのズレを見る**ことで概念を獲得させる。
教材はJSONデータとして追加でき、学習エンジンのコードは変更しない。

公開URL: https://projectx1478.github.io/steam-kids/

## 開発

静的サイト（バニラ JavaScript + Tailwind CSS）。JSのビルドステップはない。

CSSのみ開発時にビルドし、生成物 `style.css` をコミットする。
実行時にCDNからTailwindを取得しないため、オフラインでも学習を継続できる。

```
npx tailwindcss@3.4.17 -i tailwind.src.css -o style.css --minify
```

`style.css` は自動生成物。直接編集せず `tailwind.src.css` を編集して再ビルドする。

### 動作確認

```
node .claude/verify/run.mjs
```

## ファイル構成

- **README.md** — プロジェクト説明（ユーザー向け）
- **PROJECT.md** — 要件定義・設計・開発ルール
- **SESSION.md** — 引き継ぎ情報
- **CLAUDE.md** — Claude Code 運用ルール（project-template から配布。本リポジトリで編集しない）
- **AGENTS.md** — OpenCode 向け行動規範（同上）
- **docs/** — 詳細ドキュメント（索引は PROJECT.md「7. 関連ドキュメント」）
- **lessons/** — レッスンJSON
- **.claude/** — Claude Code のフック・検証ハーネス・スクリプト
- **.devcontainer/** — Codespaces/OpenCode Web 用の開発コンテナ設定

## ライセンス

MIT
