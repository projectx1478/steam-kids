// sort-order（レシピの順番）の成功の料理の絵（Issue #712）。
// 段1：キーと名前だけ。絵（dishSvg）は段4・5で足す（未実装のキーは null）。
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

// 料理の絵（SVG文字列）。未実装のキーは null。
export function dishSvg(key) {
  void key;
  return null;
}
