// 盤面エディタのパレット項目の生成（DOM 非依存。test/editor-palette.test.mjs で検査）。
// 開発者用・手元専用。子ども向け画面（APP_SHELL）には載せない。
// 登録表 GIMMICKS は呼び出し側（editor.js・テスト）から渡す（ブラウザとノードで import パスが違うため）。

// 固定項目（かべ・スタート・ゴール・消しゴム）。GIMMICKS の前に並べる。
export const FIXED_ITEMS = [
  { key: 'wall', label: 'かべ', kind: 'fixed' },
  { key: 'start', label: 'スタート', kind: 'fixed' },
  { key: 'goal', label: 'ゴール', kind: 'fixed' },
  { key: 'eraser', label: '消しゴム', kind: 'fixed' },
];

// パレット項目 { key, label, kind } の配列。ギミックは登録表 GIMMICKS の key・label から自動生成（登録順）。
export function buildPalette(gimmicks) {
  return [
    ...FIXED_ITEMS.map((p) => ({ ...p })),
    ...gimmicks.flatMap((g) => (g.key === 'warps'
      ? [1, 2].map((n) => ({ key: `warps${n}`, label: `${g.label}${n}`, kind: 'gimmick' })) // ワープは組ごとに1個ずつ置く（#488）
      : [{ key: g.key, label: g.label, kind: 'gimmick' }])),
  ];
}

// アイコン用の 1×1 盤面（drawBoard で描く）。消しゴムは盤面部品に無いので null（editor.js 側で専用 SVG）。
// 登録表に足した新しいギミックの既定は、その key の配列に {x:0,y:0} を1つ入れた盤面。
const ICON_EXTRA = {
  keys: { keys: [{ x: 0, y: 0, color: 'red' }] },
  switches: { switches: [{ x: 0, y: 0, color: 'blue', targets: [] }] },
  periodic: { periodic: [{ x: 0, y: 0, period: 3 }] },
};

export function iconSpec(key) {
  if (key === 'eraser') return null;
  const base = { grid: { cols: 1, rows: 1 }, walls: [], start: { x: 0, y: 0 } };
  const cell = { x: 0, y: 0 };
  if (key === 'wall') return { ...base, walls: [cell] };
  if (key === 'goal') return { ...base, goal: cell };
  if (key === 'start') return base;
  if (key === 'warps1' || key === 'warps2') return { ...base, warps: [{ ...cell, pair: key === 'warps1' ? 1 : 2 }] };
  return { ...base, [key]: [cell], ...ICON_EXTRA[key] };
}
