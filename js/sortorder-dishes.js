// sort-order（レシピの順番）の成功の料理の絵（Issue #712）。
// キー・料理名・絵（dishSvg）。validate（tools/）は DISH_KEYS だけを import する（DOM に触れない）。
// 絵は「コック帽ロボットが料理を両手で頭上に掲げる」1枚（viewBox 0 0 360 300）。画風は既存のロボット・鍋と同じ
// フラット塗り・線 #1e293b。新キャラは作らない。動くのは湯気・キラキラだけ（CSS の so-steam・so-sparkle）。
export const DISH_KEYS = ['tamagoyaki', 'hotcake', 'curry', 'sandwich', 'shokutaku', 'ramen', 'bento', 'pizza'];

export const DISH_NAMES = {
  tamagoyaki: 'たまごやき',
  hotcake: 'ホットケーキ',
  curry: 'カレー',
  sandwich: 'サンドイッチ',
  shokutaku: 'しょくたく',
  ramen: 'ラーメン',
  bento: 'おべんとう',
  pizza: 'ピザ',
};

const INK = '#1e293b';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;

// 背景：放射線・枠・星・キラキラ。
function backdrop() {
  const cx = 180;
  const cy = 130;
  const rays = [];
  for (let i = 0; i < 12; i += 2) {
    const a1 = (i * Math.PI) / 6;
    const a2 = ((i + 1) * Math.PI) / 6;
    const r = 400;
    rays.push(`<path d="M${cx} ${cy}L${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}L${(cx + r * Math.cos(a2)).toFixed(1)} ${(cy + r * Math.sin(a2)).toFixed(1)}Z" fill="#fef9c3"/>`);
  }
  const spark = (x, y, k, d) =>
    `<path class="so-sparkle" style="animation-delay:${d}s" d="M${x} ${y - 14 * k}Q${x} ${y} ${x + 14 * k} ${y}Q${x} ${y} ${x} ${y + 14 * k}Q${x} ${y} ${x - 14 * k} ${y}Q${x} ${y} ${x} ${y - 14 * k}Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5"/>`;
  return (
    `<defs><clipPath id="so-dish-clip"><rect x="3" y="3" width="354" height="294" rx="22"/></clipPath></defs>` +
    `<rect x="3" y="3" width="354" height="294" rx="22" fill="#fde68a"/>` +
    `<g clip-path="url(#so-dish-clip)">${rays.join('')}</g>` +
    `<rect x="3" y="3" width="354" height="294" rx="22" fill="none" stroke="#f97316" stroke-width="6"/>` +
    spark(40, 52, 1, 0) + spark(320, 46, 1.2, 0.3) + spark(300, 150, 0.8, 0.6) + spark(56, 160, 0.9, 0.9) +
    `<rect x="24" y="258" width="312" height="16" rx="8" fill="#f97316" opacity="0.25"/>`
  );
}

// コック帽ロボット（ui-sortorder.js の robotHtml と同じ形）。robot＝shapeSvg('player') の文字列（呼び出し側が渡す）。
// 両腕は箱型の体の左右から皿の縁へ。
function robotFigure(robot) {
  const arm = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>`;
  return (
    arm('M146 196Q112 176 124 134') + arm('M214 196Q248 176 236 134') +
    `<svg x="125" y="128" width="110" height="124" viewBox="0 -8 64 72" overflow="visible">${robot}` +
    `<path d="M18 8c-6-2-4-12 4-11 3-6 17-6 20 0 8-1 10 9 4 11z" fill="#fff" stroke="${INK}" stroke-width="2"/></svg>`
  );
}

const steam = (x, y, d) =>
  `<path class="so-steam" style="animation-delay:${d}s" d="M${x} ${y}c-8-8 8-14 0-24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.9"/>` +
  `<path class="so-steam" style="animation-delay:${d}s" d="M${x} ${y}c-8-8 8-14 0-24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" opacity="0.5" transform="translate(2 0)"/>`;

const plate = (rx = 78) =>
  `<ellipse cx="0" cy="12" rx="${rx}" ry="17" fill="#cbd5e1" ${S}/>` +
  `<ellipse cx="0" cy="6" rx="${rx}" ry="17" fill="#fff" ${S}/>` +
  `<ellipse cx="0" cy="6" rx="${rx - 14}" ry="11" fill="#f1f5f9"/>`;

// 皿の中心を (180, 112) に置く。
const onPlate = (inner) => `<g transform="translate(180 112)">${inner}</g>`;

const DISHES = {
  tamagoyaki: () =>
    plate() +
    `<ellipse cx="-46" cy="2" rx="14" ry="7" fill="#fff" ${S}/>` +
    `<path d="M-60 -4q8-12 16-4" fill="none" stroke="#e2e8f0" stroke-width="2"/>` +
    `<path d="M38 -8q6-20 14-8 6-12 12 2 4 8-4 14z" fill="#86efac" ${S}/>` +
    `<circle cx="56" cy="2" r="9" fill="#ef4444" ${S}/><path d="M52 -6l4 2 4-2" fill="none" stroke="#16a34a" stroke-width="2"/>` +
    `<rect x="-36" y="-26" width="68" height="30" rx="11" fill="#fbbf24" ${S}/>` +
    `<path d="M-36 -6h68" stroke="#d97706" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="32" cy="-11" rx="9" ry="15" fill="#fde68a" ${S}/>` +
    `<path d="M32 -20q-6 3-1 7 5 3 1 8" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>` +
    steam(-10, -34, 0) + steam(12, -34, 0.4),
  hotcake: () =>
    plate() +
    [-4, -16, -28]
      .map((y) => `<rect x="-52" y="${y}" width="104" height="14" rx="7" fill="#f59e0b" ${S}/><path d="M-44 ${y + 9}h88" stroke="#fcd34d" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`)
      .join('') +
    `<ellipse cx="0" cy="-28" rx="52" ry="9" fill="#fcd34d" ${S}/>` +
    `<path d="M-40 -28q40 16 80 0v6q-8 14-10 4-3-3-6 8-5 6-8-4-2-3-6 6-4 8-8-2-3-6-8 4-6 6-8-2-5-12-10-2z" fill="#b45309" opacity="0.95"/>` +
    `<rect x="-11" y="-44" width="22" height="12" rx="3" fill="#fef08a" ${S}/>` +
    steam(-24, -48, 0.1) + steam(26, -48, 0.5),
  curry: () =>
    plate(82) +
    `<path d="M-72 4q2-26 34-26 30 0 36 14l-6 12q-24 8-52 6z" fill="#fff" ${S}/>` +
    `<circle cx="-50" cy="-12" r="2" fill="#e2e8f0"/><circle cx="-34" cy="-16" r="2" fill="#e2e8f0"/><circle cx="-24" cy="-6" r="2" fill="#e2e8f0"/>` +
    `<path d="M-4 2q-2-22 28-24 34-2 50 14 4 8-6 12-26 8-64 2z" fill="#92400e" ${S}/>` +
    `<circle cx="22" cy="-8" r="7" fill="#f97316" ${S}/><rect x="40" y="-14" width="14" height="12" rx="5" fill="#fde68a" ${S}/>` +
    `<circle cx="14" cy="-14" r="5" fill="#fde68a" ${S}/>` +
    `<ellipse cx="-14" cy="14" rx="10" ry="4" fill="#9f1239" ${S}/>` +
    steam(30, -30, 0.2) + steam(-30, -32, 0.6),
  sandwich: () =>
    plate() +
    // 断面を見せた2切れ（奥と手前）。パン・ハム・レタス・トマト・卵・耳
    [[-30, -2], [26, 4]]
      .map(([x, y]) =>
        `<g transform="translate(${x} ${y})">` +
        `<rect x="-36" y="-30" width="72" height="14" rx="5" fill="#fcd34d" ${S}/>` +
        `<rect x="-34" y="-17" width="68" height="6" rx="3" fill="#fb7185" ${S}/>` +
        `<path d="M-38 -11q8 7 14 0t14 0 14 0 14 0 14 0v6h-70z" fill="#86efac" ${S}/>` +
        `<circle cx="-14" cy="-1" r="6" fill="#ef4444" ${S}/><ellipse cx="12" cy="-1" rx="9" ry="6" fill="#fde68a" ${S}/><circle cx="12" cy="-1" r="3.5" fill="#f59e0b"/>` +
        `<rect x="-36" y="4" width="72" height="14" rx="5" fill="#fcd34d" ${S}/>` +
        `<path d="M-36 11h72" stroke="#b45309" stroke-width="3" opacity="0.6"/></g>`)
      .join('') +
    steam(-4, -38, 0.2),
  shokutaku: () =>
    `<rect x="-92" y="-2" width="184" height="26" rx="10" fill="#92400e" ${S}/><rect x="-92" y="-2" width="184" height="9" rx="6" fill="#b45309" ${S}/>` +
    // ごはん茶碗（左）
    `<path d="M-76 -10h56q-2 26-28 26t-28-26z" fill="#fff" ${S}/><path d="M-72 -10q20-24 48 0z" fill="#fff" ${S}/>` +
    `<circle cx="-60" cy="-14" r="2" fill="#e2e8f0"/><circle cx="-46" cy="-18" r="2" fill="#e2e8f0"/><circle cx="-34" cy="-13" r="2" fill="#e2e8f0"/>` +
    // みそしる椀（中央・湯気）
    `<path d="M-16 -8h50q-2 26-25 26t-25-26z" fill="#ef4444" ${S}/><ellipse cx="9" cy="-8" rx="25" ry="6" fill="#d97706" ${S}/>` +
    // 漬物の小皿（右）
    `<ellipse cx="58" cy="6" rx="22" ry="9" fill="#fff" ${S}/><circle cx="52" cy="2" r="6" fill="#f472b6" ${S}/><circle cx="64" cy="3" r="5" fill="#fde68a" ${S}/>` +
    // おはし
    `<path d="M-84 20l50-6M-84 25l50-6" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>` +
    steam(-48, -24, 0.1) + steam(8, -22, 0.5),
  ramen: () =>
    // 深い器：帽子に重ならないよう少し高く掲げる
    `<g transform="translate(0 -14)">` +
    `<path d="M-74 -4h148q-2 44-74 44t-74-44z" fill="#ef4444" ${S}/><path d="M-62 14h124" stroke="#fff" stroke-width="4" stroke-dasharray="14 8" opacity="0.8"/>` +
    `<ellipse cx="0" cy="-4" rx="74" ry="16" fill="#fde68a" ${S}/>` +
    `<path d="M-60 -6q12-8 24 0t24 0 24 0 24 0" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M-56 0q12-8 24 0t24 0 24 0 22 0" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="-34" cy="-6" r="10" fill="#fff" ${S}/><path d="M-40 -6q6-6 12 0" fill="none" stroke="#f472b6" stroke-width="3"/>` +
    `<ellipse cx="6" cy="-8" rx="14" ry="8" fill="#fff" ${S}/><circle cx="6" cy="-8" r="5" fill="#f59e0b"/>` +
    `<ellipse cx="38" cy="-4" rx="16" ry="8" fill="#b45309" ${S}/><rect x="52" y="-20" width="9" height="22" rx="2" fill="#1e293b" transform="rotate(12 56 -9)"/>` +
    `<circle cx="-14" cy="2" r="2.5" fill="#16a34a"/><circle cx="20" cy="2" r="2.5" fill="#16a34a"/><circle cx="-6" cy="-14" r="2.5" fill="#16a34a"/>` +
    `</g>` +
    steam(-20, -50, 0.1) + steam(24, -50, 0.5),
  bento: () =>
    `<rect x="-84" y="-26" width="168" height="62" rx="12" fill="#f59e0b" ${S}/><rect x="-76" y="-18" width="152" height="46" rx="8" fill="#fef3c7" ${S}/>` +
    `<path d="M0 -18v46" stroke="${INK}" stroke-width="3"/>` +
    // 左：おにぎり（のり）・ブロッコリー
    `<path d="M-46 -12l-22 30h44z" fill="#fff" ${S}/><path d="M-52 4h12v14h-12z" fill="#1e293b"/>` +
    `<circle cx="-18" cy="6" r="8" fill="#22c55e" ${S}/><circle cx="-10" cy="10" r="6" fill="#22c55e" ${S}/><rect x="-16" y="12" width="4" height="8" fill="#16a34a"/>` +
    // 右：たまごやき・ミニトマト・ウインナー
    `<rect x="10" y="-12" width="30" height="18" rx="6" fill="#fbbf24" ${S}/><path d="M10 -3h30" stroke="#d97706" stroke-width="3"/>` +
    `<circle cx="56" cy="-2" r="8" fill="#ef4444" ${S}/>` +
    `<rect x="12" y="12" width="52" height="11" rx="5" fill="#f87171" ${S}/><path d="M24 14l4 7M38 14l4 7M52 14l4 7" stroke="#b91c1c" stroke-width="2"/>`,
  pizza: () =>
    `<ellipse cx="0" cy="14" rx="82" ry="22" fill="#b45309" ${S}/>` +
    `<ellipse cx="0" cy="8" rx="82" ry="22" fill="#fbbf24" ${S}/><ellipse cx="0" cy="8" rx="68" ry="16" fill="#ef4444" opacity="0.9"/>` +
    `<ellipse cx="0" cy="8" rx="62" ry="14" fill="#fde68a" opacity="0.9"/>` +
    // 持ち上がる1切れ（右）と伸びるチーズ
    `<path d="M10 8L66 -2q22 -26 10 -34L6 -22z" fill="#fde68a" ${S}/><path d="M10 8L66 -2" stroke="#b45309" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M10 8q-2 12 2 18M24 4q-2 14 2 22" fill="none" stroke="#fde68a" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="-40" cy="8" r="8" fill="#9f1239" ${S}/><circle cx="-14" cy="14" r="7" fill="#9f1239" ${S}/><circle cx="-26" cy="0" r="6" fill="#9f1239" ${S}/>` +
    `<path d="M-52 12q4-8 10-2" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round"/><path d="M-4 0q4-6 10-1" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M28 -16q4-8 12-4" fill="none" stroke="#9f1239" stroke-width="5" stroke-linecap="round"/>` +
    steam(-30, -14, 0.2),
};

// dishSvg(key, { robot })：未実装のキーは null。robot は shapeSvg('player') の文字列（省略時はロボットなし）。
export function dishSvg(key, { robot = '' } = {}) {
  const draw = DISHES[key];
  if (!draw) return null;
  return (
    `<svg class="so-dish-svg" viewBox="0 0 360 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    backdrop() + robotFigure(robot) + onPlate(draw()) +
    `</svg>`
  );
}
