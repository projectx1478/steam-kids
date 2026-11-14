# 落とし穴集

実装・試作を始める前に読む。1件1行：症状／原因／見分け方／出典。上限4,000字（`docs/agents/dev-flow.md`）。新しく踏んだら1行足す。

- 新しい見た目がつぶれる・効かない／JS に書いた新しい Tailwind クラスが `style.css` に無い（`tailwind.src.css` を変えていなくても再ビルドが要る）／`npx tailwindcss@3.4.19 -i tailwind.src.css -o style.css --minify` の後に `git diff --stat style.css` が出る／#722
- `check:static` が赤／新しい `js/*.js` を `service-worker.js` の APP_SHELL に足していない／`npm run check:static`／#722
- `validate:lessons` が赤（レッスン追加時）／`lessons/index.json` の `devOnlyIds`・`longTrialIds` への登録漏れ、`estimatedMinutes` が8でない、画面の文が20字超／`npm run validate:lessons`／#722
- 新しいキーを足したのに検査が黙って通る／intro のデモと play がキー一覧を共有している／デモ側に同じキーを書いて検査が落ちるか試す／#722
- 遊ぶスクリプトが途中で止まる／保護者ゲート（`steamkids.gateDate` を当日にする）、`?dev=1`、面の開始の「スタート！」が消えるまで約2.5秒、クリア画面まで実行時間＋約2秒／`tools/playtest/walk-read.cjs` を写して始める／#723・#722
- 成功なのに「おしい！」が付く／失敗用の `showHint` を成功の途中経過に流用している（浮力の `find` に残っている）／見つけた直後の吹き出しの文字を読む／#722
- クリアの約2秒後に結果が隠れる／`showClearSequence` のダイアログと暗幕が、grid 以外の型では盤・水そうを覆う／クリア後2秒の画面で盤とダイアログの矩形の重なりを測る／2026-11-14 実操作レビュー
- 1024×600 で画面の下が欠ける／固定の下バーの下に中身が入る／`scrollHeight > clientHeight`。測る大きさに 1024×600（Fire 7）を入れる／2026-11-14 実操作レビュー
- 画像の読みすぎで枠を使い切る／1コマずつ Read している／複数コマを1枚に並べ、1試作6枚まで。寸法・文字は数値で確かめる／#722
