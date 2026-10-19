# 小鳥の吹き出しでのヒント（js/ui-bird.js・js/bird-hints.js）

台帳は `docs/components.md`。禁止パターン・基準件数は「なし」（#468-19B）。文言は承認済みの固定文言（#468 設計で承認）。この表自身が正本。Issue #468 段2。

## 出し方

- 出先は小鳥の吹き出し（`bird.showBubble`）。1画面に1つ。後に出たもので置き換える。**タップでのみ消える**（顔アイコンまたは吹き出し自体。自動消去なし）。
- 失敗後のヒント：`showHint(null, { bird, kind, message, restore, extra })`（`js/ui-reaction.js`）。`data-hint="<kind>"` は吹き出し内のパネルに付く。play・predict・seesaw が使う。
- 顔アイコンのタップ：吹き出しが出ていれば消す。無ければ「問い文」と「ヒント」を交互に出す。ヒントは画面が `screen.setHintProvider(fn)`（`createOpScreen` の戻り値）で渡す。`fn` が `null` を返す（文言が無い）ときは問い文。ヒントの吹き出しには `data-tap-hint="true"`（`data-hint` は結果のヒントの印なので使わない）。現在はplayだけが渡す。
- 失敗2回目の自動1回（playのみ。predict・seesaw には出さない。#468-20A）：同じレッスンで2回目の失敗のとき、診断のヒントの下に汎用ヒントを1行足す（`extra`、`data-hint-extra="true"`）。回数はメモリのみ。paint盤は出さない（#468-14d）。

## 文言

- `js/bird-hints.js`：`STOP_HINTS`（「とめる」。`maxPauses>0` のステージのタップで候補）・`FAIL_HINTS`（失敗後の汎用。失敗が1回以上のタップと2回目の自動表示）。
- 事実の手がかりだけ（答え・手順・個数を言わない。#340）。1文20字以内（空白を数えない）・かな／カタカナのみ。使い切るまで繰り返さず、使い切ったら一巡する。
- 口調4種・ギミック別・静的チェックは段3（`js/bird-phrases.js`）で置き換える。
