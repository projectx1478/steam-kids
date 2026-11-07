// predict-slider（シーソー）の純粋関数。DOMに触れない。てこの原理（おもさ×きょり）を整数だけで計算する。
// spec: { notches, left: [{robots, pos}], mover: {robots, start, side?} }。pos・startは支点からの刻み数（1〜notches）。
// mover.side:"both" のときだけ負（−notches〜−1。支点の左）も使える。0は使えない。

// balance(spec, pos, robots = spec.mover.robots) -> { torqueL, torqueR, tilt }。tiltは-1=左がさがる／0=つりあう／1=右がさがる。
// spec.right（任意。leftと同形）があれば右の固定ロボットのトルクをtorqueRに足す。
export function balance(spec, pos, robots = spec.mover.robots) {
  // posが負（支点の左）なら、moverのトルクはtorqueLへ足す（符号付きトルク）。
  const torqueL = spec.left.reduce((sum, w) => sum + w.robots * w.pos, 0) + (pos < 0 ? robots * -pos : 0);
  const torqueR = (spec.right ?? []).reduce((sum, w) => sum + w.robots * w.pos, 0) + (pos > 0 ? robots * pos : 0);
  const tilt = torqueL > torqueR ? -1 : torqueL < torqueR ? 1 : 0;
  return { torqueL, torqueR, tilt };
}

// solutions(spec) -> つりあう刻みの昇順配列（教材検証用。位置だけ動く面の解の確認に使う。重さも動く面は solutionPairs）。
export function solutions(spec) {
  return allowedPositions(spec).filter((pos) => balance(spec, pos).tilt === 0);
}

// allowedPositions(spec) -> moverが置ける刻みの昇順配列。sideが省略か"right"なら1〜notches、"both"なら−notches〜−1と1〜notches（0は除く）。
// 固定ロボットがいる刻み（rightは+pos、leftは−pos）は除く。◀▶・ドラッグ・解の列挙・validateが共有する。
export function allowedPositions(spec) {
  const taken = new Set([...(spec.right ?? []).map((w) => w.pos), ...spec.left.map((w) => -w.pos)]);
  const from = spec.mover?.side === 'both' ? -spec.notches : 1;
  const out = [];
  for (let pos = from; pos <= spec.notches; pos += 1) {
    if (pos !== 0 && !taken.has(pos)) out.push(pos);
  }
  return out;
}

// solutionPairs(spec) -> つりあう [{pos, robots}]（pos昇順→robots昇順）。posはmover.fixedPosがあればそれだけ、無ければ1〜notches。
// robotsはmover.maxRobotsがあれば1〜maxRobots、無ければmover.robotsだけ。
export function solutionPairs(spec) {
  const { fixedPos, maxRobots } = spec.mover;
  const poses = fixedPos ? [fixedPos] : allowedPositions(spec);
  const robotsList = maxRobots ? Array.from({ length: maxRobots }, (_, i) => i + 1) : [spec.mover.robots];
  const found = [];
  for (const pos of poses) {
    for (const robots of robotsList) {
      if (balance(spec, pos, robots).tilt === 0) found.push({ pos, robots });
    }
  }
  return found;
}

// difficulty(spec) -> |左のおもさ合計 − 右のおもさ合計|（robots×pos。rightが無ければ左の合計）。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  const sum = (list) => (list ?? []).reduce((s, w) => s + w.robots * w.pos, 0);
  return Math.abs(sum(spec.left) - sum(spec.right));
}
