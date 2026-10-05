# 開発用ツール

## analyze-board（盤面解析）
盤面の最短手数・別解の本数・探索規模を測る。設計・実装で盤面を作るとき、使い捨てスクリプトを書かずにこれを使う。

```
node tools/analyze-board.mjs <レッスンID> <ステージ番号|stepId> [--timeout 秒] [--limit 本数]
node tools/analyze-board.mjs --board <盤のJSONファイル>        [--timeout 秒] [--limit 本数]
```
- ステージ番号は、そのレッスンの play を 1 から数える（stepId でも指定できる）。`--board` は play ステージ1つ分のJSON。
- 出力：最短手数（groupRepeats はチップ数、repeatBox は箱なし）、訪問状態数（BFSの状態数＝検証コストの目安）、maxCommands 以内の別解の本数、所要時間。
- 既定は timeout 60秒・別解 1000本まで。打ち切ったときは「打ち切り」と理由を出す（別解は「これ以上」の意味）。
- 別解は、壁衝突・塗りはみ出しの枝を切った全列挙。repeatBox/groupRepeats は対象外。
- 探索は js/engine-grid.js の `shortestSteps`/`shortestChips` を使う。ここでは複製しない。

例（paint-01）：p1＝最短6手・訪問34・別解2本、p2＝10手・102・2本、p3＝12手・221・4本。
