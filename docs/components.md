# 共通部品の台帳

画面をまたいで使う部品の索引。新しい画面で同じ演出・見た目が要るときは自前で組まず、ここにある部品を呼ぶ。部品を足す・直すときは、この表と禁止パターンも更新する（Issue #347 以降）。

## 部品の一覧

| 部品 | 置き場 | 個別の説明 | 禁止パターン（部品の外で自前で組まない） |
| --- | --- | --- | --- |
| クリア演出（星のトースト→間→結果ダイアログ＋紙吹雪） | `js/ui-clear.js` | `docs/clear-component.md` | ダイアログの自前生成、待ち時間の直書き、星サイズの直書き |

## 禁止パターンの検査

`test/forbidden-patterns.test.mjs`（`npm run test:unit` に含まれる）。ファイル単位の正規表現で、部品の置き場（上の表）を除いた `js/`（`js/vendor/` は対象外）と `tailwind.src.css` を調べる。

- 例外は、該当行の末尾に `// allow-clear: 理由` を書く（CSS は `/* allow-clear: 理由 */`）。理由は必須。
- 誤検知を例外で逃がすのは、自分が編集してよいファイルに限る。

| 部品 | 項目 | 定義 |
| --- | --- | --- |
| クリア演出 | ダイアログの自前生成 | `js/ui-clear.js` 以外で、`createElement('dialog')`・`.showModal(`・`.show(`・`result-row`・`result-dialog` |
| クリア演出 | 待ち時間の直書き | `js/ui-clear.js` を import するファイルで、`setTimeout(…, 1500)`・`setTimeout(…, 1000)`、`const RESULT_GAP…` の再定義 |
| クリア演出 | 星サイズの直書き | `tailwind.src.css` の `.sk-clear-` を含まないルールの `width/height: 20px`、`js/` の `style.width/height = '20px'` |

## 部品を足すとき

1. 部品の説明を `docs/<部品名>.md` に書き、上の一覧に1行足す。
2. 部品の中身を外で自前で組ませない検査を `test/forbidden-patterns.test.mjs` に足す。違反するダミー（赤）と `allow-clear` 付きのダミー（緑）も同じテストに入れる。
3. `docs/file-structure.md` の索引にファイルを足す。
