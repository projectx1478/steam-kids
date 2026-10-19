// 小鳥（js/ui-bird.js）のヒント文言（Issue #468 段2）。承認済みの review/design/468/phrases-v2.md の③「とめる」・②失敗後から採用。
// 事実の手がかりだけを返す（答え・手順・個数は言わない。#340）。1文20字以内（空白を数えない）・かな／カタカナのみ。
// 段3で口調・ギミック別の文言テーブル（js/bird-phrases.js）に置き換える予定。

export const STOP_HINTS = [
  'とちゅうで とめられるよ',
  '「とめる」を おすと ようすが みられる',
  'うごきが きになったら とめてみよう',
  'とめてから もういちど かんがえよう',
  'とまった ところで よく みよう',
  '「とめる」は いつでも おせるよ',
];

export const FAIL_HINTS = [
  'もういちど ようすを みてみよう',
  'とまった ところを みてみよう',
  'ロボットの まわりに なにが あるかな',
  'ゆびで みちを なぞってみよう',
  'ならべた ブロックを みなおしてみよう',
  'いちど ゆっくり みてみよう',
  'ブロックを じゅんに みてみよう',
  'うごきを もういちど みてみよう',
];

// 使い切るまで同じ文言を繰り返さず、使い切ったら一巡リセットする（#468-13fB）。同じ組み合わせごとに位置を覚える（メモリのみ）。
const cursors = new Map();

function nextFrom(list) {
  if (list.length === 0) return null;
  const key = list.join('|');
  const i = cursors.get(key) ?? 0;
  cursors.set(key, (i + 1) % list.length);
  return list[i];
}

// 「失敗の後の自動1回」用：失敗後の汎用ヒントから1つ。
export function nextFailHint() {
  return nextFrom(FAIL_HINTS);
}

// 顔アイコンのタップ用：その画面の状況に合う文言から1つ。状況に合う文言が無ければ null。
// maxPauses>0（「とめる」のあるステージ）なら「とめる」、失敗が1回以上なら失敗後の汎用ヒントを候補にする。
export function nextTapHint({ maxPauses = 0, fails = 0 }) {
  return nextFrom([...(maxPauses > 0 ? STOP_HINTS : []), ...(fails > 0 ? FAIL_HINTS : [])]);
}
