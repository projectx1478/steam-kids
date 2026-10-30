// predict-slider（シーソー）の純粋関数。DOMに触れない。てこの原理（おもさ×きょり）を整数だけで計算する。
// spec: { notches, left: [{robots, pos}], mover: {robots, start} }。pos・startは支点からの刻み数（1〜notches）。

// balance(spec, pos, robots = spec.mover.robots) -> { torqueL, torqueR, tilt }。tiltは-1=左がさがる／0=つりあう／1=右がさがる。
export function balance(spec, pos, robots = spec.mover.robots) {
  const torqueL = spec.left.reduce((sum, w) => sum + w.robots * w.pos, 0);
  const torqueR = robots * pos;
  const tilt = torqueL > torqueR ? -1 : torqueL < torqueR ? 1 : 0;
  return { torqueL, torqueR, tilt };
}

// solutions(spec) -> つりあう刻みの昇順配列（教材検証用。位置だけ動く面の解の確認に使う。重さも動く面は solutionPairs）。
export function solutions(spec) {
  const found = [];
  for (let pos = 1; pos <= spec.notches; pos += 1) {
    if (balance(spec, pos).tilt === 0) found.push(pos);
  }
  return found;
}

// solutionPairs(spec) -> つりあう [{pos, robots}]（pos昇順→robots昇順）。posはmover.fixedPosがあればそれだけ、無ければ1〜notches。
// robotsはmover.maxRobotsがあれば1〜maxRobots、無ければmover.robotsだけ。
export function solutionPairs(spec) {
  const { fixedPos, maxRobots } = spec.mover;
  const poses = fixedPos ? [fixedPos] : Array.from({ length: spec.notches }, (_, i) => i + 1);
  const robotsList = maxRobots ? Array.from({ length: maxRobots }, (_, i) => i + 1) : [spec.mover.robots];
  const found = [];
  for (const pos of poses) {
    for (const robots of robotsList) {
      if (balance(spec, pos, robots).tilt === 0) found.push({ pos, robots });
    }
  }
  return found;
}

// difficulty(spec) -> 左側のおもさ合計（robots×pos）。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  return spec.left.reduce((sum, w) => sum + w.robots * w.pos, 0);
}
