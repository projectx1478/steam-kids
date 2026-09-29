// 「れんしゅう」のたねコード（Issue #69）。8種類の絵×4マス＝4096通り。DOMに触れない部分（変換）と
// 絵のSVG（自作。画像素材・外部取得なし）を持つ。コードは'0'〜'7'の4桁文字列（例: '0417'）で、
// 学習ログのpayload.seedにもこの文字列を記録する。同じコードなら誰でも同じマップになる。
export const CODE_LENGTH = 4;
export const PICTURE_COUNT = 8;

const svg = (body) => `<svg viewBox="0 0 48 48" class="w-full h-full" aria-hidden="true">${body}</svg>`;

// 形と色の両方で見分けられるようにする（色だけに頼らない）。
export const PICTURES = [
  { name: 'ねこ', svg: svg(
    '<path d="M8 20 L12 4 L22 12 Z M40 20 L36 4 L26 12 Z" fill="#fb923c" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="24" cy="28" r="16" fill="#fdba74" stroke="#c2410c" stroke-width="2"/>' +
    '<circle cx="18" cy="26" r="2.5" fill="#1f2937"/><circle cx="30" cy="26" r="2.5" fill="#1f2937"/>' +
    '<path d="M22 32 L26 32 L24 35 Z" fill="#be185d"/>') },
  { name: 'うさぎ', svg: svg(
    '<ellipse cx="17" cy="12" rx="5" ry="11" fill="#f5f5f4" stroke="#78716c" stroke-width="2"/>' +
    '<ellipse cx="31" cy="12" rx="5" ry="11" fill="#f5f5f4" stroke="#78716c" stroke-width="2"/>' +
    '<circle cx="24" cy="32" r="13" fill="#f5f5f4" stroke="#78716c" stroke-width="2"/>' +
    '<circle cx="19" cy="30" r="2" fill="#dc2626"/><circle cx="29" cy="30" r="2" fill="#dc2626"/>') },
  { name: 'さかな', svg: svg(
    '<path d="M6 24 C14 10 30 10 36 24 C30 38 14 38 6 24 Z" fill="#38bdf8" stroke="#0369a1" stroke-width="2"/>' +
    '<path d="M36 24 L45 15 L45 33 Z" fill="#0ea5e9" stroke="#0369a1" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="15" cy="22" r="2.5" fill="#1f2937"/>') },
  { name: 'とり', svg: svg(
    '<circle cx="22" cy="26" r="15" fill="#fde047" stroke="#a16207" stroke-width="2"/>' +
    '<path d="M36 22 L46 26 L36 30 Z" fill="#f97316" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="26" cy="21" r="2.5" fill="#1f2937"/>') },
  { name: 'りんご', svg: svg(
    '<path d="M24 14 C10 6 4 24 12 36 C16 42 20 40 24 40 C28 40 32 42 36 36 C44 24 38 6 24 14 Z" fill="#ef4444" stroke="#991b1b" stroke-width="2"/>' +
    '<path d="M24 14 C24 8 26 5 29 4" fill="none" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M27 9 C32 4 38 6 38 6 C36 12 30 12 27 9 Z" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>') },
  { name: 'バナナ', svg: svg(
    '<path d="M8 12 C10 34 26 44 42 34 C34 36 20 32 16 10 Z" fill="#facc15" stroke="#a16207" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M8 12 L12 6 L16 10" fill="#a16207" stroke="#78350f" stroke-width="2" stroke-linejoin="round"/>') },
  { name: 'いちご', svg: svg(
    '<path d="M24 42 C10 32 6 18 10 14 C16 10 32 10 38 14 C42 18 38 32 24 42 Z" fill="#f43f5e" stroke="#9f1239" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M14 12 L24 6 L34 12 L24 16 Z" fill="#22c55e" stroke="#15803d" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="18" cy="24" r="1.6" fill="#fde68a"/><circle cx="28" cy="22" r="1.6" fill="#fde68a"/>' +
    '<circle cx="24" cy="31" r="1.6" fill="#fde68a"/>') },
  { name: 'ぶどう', svg: svg(
    '<circle cx="16" cy="20" r="7" fill="#a855f7" stroke="#6b21a8" stroke-width="2"/>' +
    '<circle cx="32" cy="20" r="7" fill="#a855f7" stroke="#6b21a8" stroke-width="2"/>' +
    '<circle cx="24" cy="30" r="7" fill="#a855f7" stroke="#6b21a8" stroke-width="2"/>' +
    '<circle cx="24" cy="40" r="5" fill="#a855f7" stroke="#6b21a8" stroke-width="2"/>' +
    '<path d="M24 14 L24 5 L30 3" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round"/>') },
];

// codeToSeed(code): '0417'形式の文字列→generateMapへ渡す32bitシード。8進4桁の数値へ拡散をかけ、
// 隣り合うコードで似た盤面にならないようにする。
export function codeToSeed(code) {
  return Math.imul(parseInt(code, 8) + 1, 0x9e3779b1) >>> 0;
}

export function isValidCode(code) {
  return typeof code === 'string' && new RegExp(`^[0-${PICTURE_COUNT - 1}]{${CODE_LENGTH}}$`).test(code);
}

// randomCode(rand): 「ちがう マップ」用のランダムなコード。randはテスト用の差し替え口。
export function randomCode(rand = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += Math.floor(rand() * PICTURE_COUNT);
  return code;
}

// codeStripHtml(code): コードの絵を横に並べたHTML（summaryの「この マップの たね」用）。
export function codeStripHtml(code) {
  return [...code]
    .map((d) => `<span class="inline-block w-10 h-10" data-picture="${d}">${PICTURES[Number(d)].svg}</span>`)
    .join('');
}
