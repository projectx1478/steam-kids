// 「れんしゅう」のばんごう（Issue #69・#398）。'000'〜'999'の3桁＝1000通り。DOMに触れない部分（変換）だけを持つ。
// 学習ログのpayload.seedにもこの文字列（例: '123'）を記録する。同じばんごうなら誰でも同じマップになる。
export const CODE_LENGTH = 3;

// ばんごう（Issue #398）。'000'〜'999'の0埋め3桁文字列。絵のコード（旧4桁・8進）は廃止。
// SEED_VER＝番号→盤面の対応の版（内部のみ。ログには出さない）。
export const SEED_VER = 1;
const NUMBER_COUNT = 1000;

// codeToSeed(code, opts): '123'形式の文字列→generateMapへ渡す32bitシード。10進の数値へ拡散をかけ、
// 隣り合うコードで似た盤面にならないようにする。opts.ver/size/difficultyは #405 用の口
// （size・difficultyは未使用。省略時は現行と同じ盤面）。
export function codeToSeed(code, opts = {}) {
  const { ver = SEED_VER } = opts;
  if (ver !== SEED_VER) throw new Error(`未対応のSEED_VER: ${ver}`);
  return Math.imul(parseInt(code, 10) + 1, 0x9e3779b1) >>> 0;
}

export function isValidCode(code) {
  return typeof code === 'string' && /^\d{3}$/.test(code);
}

// randomNumberCode(rand): 「おまかせ」用。0〜999を選んで3桁に0埋めする。randはテスト用の差し替え口。
export function randomNumberCode(rand = Math.random) {
  return String(Math.floor(rand() * NUMBER_COUNT)).padStart(3, '0');
}
