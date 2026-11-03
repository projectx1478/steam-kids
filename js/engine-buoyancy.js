// predict-slider（うかぶ・しずむ）の純粋関数。DOMに触れない。整数だけで浮力を計算する（Issue #288）。
// spec: { base, mass?=1, lift?=1, weights?: {start, max}, balloons?: {start, max} }。
// net = base + balloons×lift − weights×mass。net>0=浮く／0=ぴたり／<0=沈む。

// buoyancy(spec, weights, balloons) -> { net, dir }。dirは 1=浮く／0=ぴたり／-1=沈む。
export function buoyancy(spec, weights, balloons) {
  const mass = spec.mass ?? 1;
  const lift = spec.lift ?? 1;
  const net = spec.base + balloons * lift - weights * mass;
  return { net, dir: net > 0 ? 1 : net < 0 ? -1 : 0 };
}

// solutionPairs(spec) -> つりあう [{weights, balloons}]（weights昇順→balloons昇順）。軸が無ければ個数0固定。
export function solutionPairs(spec) {
  const wMax = spec.weights ? spec.weights.max : 0;
  const bMax = spec.balloons ? spec.balloons.max : 0;
  const found = [];
  for (let w = 0; w <= wMax; w += 1) {
    for (let b = 0; b <= bMax; b += 1) {
      if (buoyancy(spec, w, b).dir === 0) found.push({ weights: w, balloons: b });
    }
  }
  return found;
}

// difficulty(spec) -> つりあう組の「おもり＋ふうせん」の最大値。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  return solutionPairs(spec).reduce((max, p) => Math.max(max, p.weights + p.balloons), 0);
}
