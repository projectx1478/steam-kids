// rough-judge.mjs: あばれ役（.claude/verify/scenarios/rough-grid.mjs）の判定の純関数（Issue #729）。
// ブラウザに依存しない。入力は数値・矩形・文字列だけ。規則R1〜R10は docs/testing-guidelines.md。

// R1 はみ出し：scrollWidth が clientWidth を1px超えて上回る要素。
export function overflowItems(items) {
  return items.filter((i) => i.scrollWidth > i.clientWidth + 1);
}

// R2 重なり：交差面積が1px²以上の組（受け入れ条件の (0,0)と(9,9) の10×10＝面積1 を1組とするため以上）。呼び出し側で祖先・子孫の組は除いて渡す。
export function overlapPairs(rects) {
  const pairs = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 0 && h > 0 && w * h >= 1) pairs.push([a, b]);
    }
  }
  return pairs;
}

// R3 小さすぎ：短辺が min（既定48px＝ui-rules のボタン下限）未満。
export function smallTargets(rects, min = 48) {
  return rects.filter((r) => Math.min(r.w, r.h) < min);
}

// R4 結果表示（[data-result]＋[data-hint]）の同時表示数が2以上。
export function doubleResult(count) {
  return count >= 2;
}

// R5 クリア前後で盤の幅か高さが1割を超えて変わった。
export function boardResized(before, after) {
  return Math.abs(after.w - before.w) / before.w > 0.1 || Math.abs(after.h - before.h) / before.h > 0.1;
}

// R6 0.1秒おきの隣り合う2点の距離が cell 以上になる添字（後ろの点）。
export function jumps(samples, cell) {
  const out = [];
  for (let i = 1; i < samples.length; i += 1) {
    const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    if (d >= cell) out.push(i);
  }
  return out;
}

// R10 内部ID（s1・t3・p12）。空白区切りの語で判定する。
export function internalIds(text) {
  return String(text)
    .split(/\s+/)
    .filter((w) => /^[stp]\d+$/.test(w));
}

// 既知リスト（{rule, where}[]）と rule・where が一致するものを除く。
export function filterKnown(findings, known) {
  return findings.filter((f) => !known.some((k) => k.rule === f.rule && k.where === f.where));
}

// 出力1件の形（.verify/rough/*.json と check のラベル）。solution など答えを含めない：rule・where・detail だけを写す。
export function formatFinding({ rule, where, detail }) {
  return { rule, where, detail: detail ?? '' };
}
