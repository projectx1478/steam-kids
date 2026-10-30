# 小鳥の吹き出しでのヒント（js/ui-bird.js・js/bird-phrases.js）

台帳は `docs/components.md`。禁止パターン・基準件数は「なし」（#468-19B）。文言は承認済み（#468 設計。正本は js/bird-phrases.js のテーブル）。Issue #468 段2・3。

## 出し方

- 出先は小鳥の吹き出し（`bird.showBubble`）。1画面に1つ。後に出たもので置き換える。**タップでのみ消える**（顔アイコンまたは吹き出し自体。自動消去なし）。
- 失敗後のヒント：`showHint(null, { bird, kind, message, restore, extra })`（`js/ui-reaction.js`）。`data-hint="<kind>"` は吹き出し内のパネルに付く。play・predict・seesaw が使う。
- 顔アイコンのタップ：吹き出しが出ていれば消す。無ければ「問い文」と「ヒント」を交互に出す。ヒントは画面が `screen.setHintProvider(fn)`（`createOpScreen` の戻り値）で渡す。`fn` が `null` を返す（文言が無い）ときは問い文。ヒントの吹き出しには `data-tap-hint="true"`（`data-hint` は結果のヒントの印なので使わない）。現在はplayだけが渡す。
- 失敗2回目の自動1回（playのみ。predict・seesaw には出さない。#468-20A）：同じレッスンで2回目の失敗のとき、診断のヒントの下に汎用ヒントを1行足す（`extra`、`data-hint-extra="true"`）。回数はメモリのみで、クリアでリセットする。paint盤は出さない（#468-14d）。

## 文言（段3）

- `js/bird-phrases.js`：`PHRASES`（id・scene・gimmick・tone・topic・when・text）。場面は start・fail・stop・clear・go。いま画面につないでいるのは fail（失敗2回目の自動1回・タップ）と stop（「とめる」のあるステージのタップ）。start・clear・go は呼び出し側が未接続（テーブルのみ）。
- 口調は4種（gentle・genki・mono・ask）。同じ topic の文言は口調違い。fail と stop は genki を使わない。
- 文言台帳（clear 専用行・Issue #491）：`SH1`（clear・口調 a・only:'shorter'）「もっと みじかく できる？」。最短超過でクリアしたときだけ、結果ダイアログが出てから `shorterPhrase()` で小鳥が言う。`pickPhrase` の通常の clear には混ざらない。
- 選び方 `pickPhrase({ scene, facts, state, rng })`：失敗後は盤にあるギミック（items・ice・cushion・keys・switches・repeatBox）の文言を70%で優先し、残りと該当なしは汎用。同セッションで同じ文言は使い切るまで出さず、使い切ったらそのプールだけ一巡リセット。直前と同じ口調・topic は続けない。`facts = boardFacts(step)`（`when` の判定用）。paint 盤は fail で出さない（#468-14d）。
- 事実の手がかりだけ（答え・方向・手順・個数を言わない。#340）。1文20字以内（空白を数えない）・ひらがな／カタカナのみ（例外：`only` 付きの専用行は末尾の「？」と比較語を許す。#491-4A。現在は `SH1` のみ）。文言の追加・変更は `test/bird-phrases.test.mjs`（静的チェック）で検査される。
- 表示回数・使用済みの記録はメモリのみ（端末に保存しない）。
