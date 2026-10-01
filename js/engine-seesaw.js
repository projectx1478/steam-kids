// predict-slider（シーソー）の純粋関数。DOMに触れない。てこの原理（おもさ×きょり）を整数だけで計算する。
// spec: { notches, left: [{robots, pos}], mover: {robots, start} }。pos・startは支点からの刻み数（1〜notches）。

// balance(spec, pos) -> { torqueL, torqueR, tilt }。tiltは-1=左がさがる／0=つりあう／1=右がさがる。
export function balance(spec, pos) {
  const torqueL = spec.left.reduce((sum, w) => sum + w.robots * w.pos, 0);
  const torqueR = spec.mover.robots * pos;
  const tilt = torqueL > torqueR ? -1 : torqueL < torqueR ? 1 : 0;
  return { torqueL, torqueR, tilt };
}

// solutions(spec) -> つりあう刻みの昇順配列（教材検証用。解がちょうど1つであることの確認に使う）。
export function solutions(spec) {
  const found = [];
  for (let pos = 1; pos <= spec.notches; pos += 1) {
    if (balance(spec, pos).tilt === 0) found.push(pos);
  }
  return found;
}

// difficulty(spec) -> 左側のおもさ合計（robots×pos）。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  return spec.left.reduce((sum, w) => sum + w.robots * w.pos, 0);
}
