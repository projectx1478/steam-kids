// sort-order（レシピの順番）の順序制約エンジン（純関数。DOM・保存に触れない。Issue #292）。
// order＝カード id の並び（左から順）。before＝[{a,b,fail?}]（a が b より前）。cards は id の配列か {id} の配列。

const idsOf = (cards) => cards.map((c) => (typeof c === 'string' ? c : c.id));

// 並びが破っている最初の before（配列順で先頭）。全部満たせば null。
// order に無い id を含む制約（未配置）は違反に数えない。
export function firstViolation(order, before) {
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const rule of before) {
    const pa = pos.get(rule.a);
    const pb = pos.get(rule.b);
    if (pa === undefined || pb === undefined) continue;
    if (pa > pb) return rule;
  }
  return null;
}

// 並びが全 before を満たすか。
export function isSolved(order, before) {
  return firstViolation(order, before) === null;
}

// 全順列のうち全 before を満たす並びを、cards の配列順を基準にした辞書順で返す。
export function solutionsOf(cards, before) {
  const ids = idsOf(cards);
  const out = [];
  const used = new Array(ids.length).fill(false);
  const cur = [];
  const walk = () => {
    if (cur.length === ids.length) {
      if (isSolved(cur, before)) out.push([...cur]);
      return;
    }
    for (let i = 0; i < ids.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(ids[i]);
      walk();
      cur.pop();
      used[i] = false;
    }
  };
  walk();
  return out;
}

// 正解の並びの数。
export function countSolutions(cards, before) {
  return solutionsOf(cards, before).length;
}
