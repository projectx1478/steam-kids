// predict-slider（うかぶ・しずむ）の純粋関数。DOMに触れない。整数だけで浮力を計算する（Issue #288・#710）。
// spec: { bodies: [{ ring: 2|4|6, box?: { v: 1〜6, hidden? } }], tools: ['w1','w2','w3','b1','b2','b3'の2〜4個], dots? }。
// 道具 id＝おもり w＋値／ふうせん b＋値。値は面を通して固定（大きさに比例して描く）。
// net = ring − box.v + Σ付けたふうせん − Σ付けたおもり。net>0=浮く／0=ぴたり／<0=沈む。

const TOOL_RE = /^([wb])([1-3])$/;

// toolOf(id) -> { kind: 'w'|'b', v } | null
export function toolOf(id) {
  const m = typeof id === 'string' ? TOOL_RE.exec(id) : null;
  return m ? { kind: m[1], v: Number(m[2]) } : null;
}

// netOf(body, ids) -> 1体の net（付けた道具 id の配列 ids から）。
export function netOf(body, ids) {
  let net = body.ring - (body.box ? body.box.v : 0);
  for (const id of ids) {
    const t = toolOf(id);
    if (t) net += t.kind === 'b' ? t.v : -t.v;
  }
  return net;
}

// buoyancy(spec, ids) -> { net, dir }。dirは 1=浮く／0=ぴたり／-1=沈む（1体の面）。
export function buoyancy(spec, ids) {
  const net = netOf(spec.bodies[0], ids);
  return { net, dir: net > 0 ? 1 : net < 0 ? -1 : 0 };
}

// enumerate(spec) -> { N, solutions }。tools の全部分集合（N＝2^n）を調べ、net が0になる組（tools の並び順の id 配列）を返す。
export function enumerate(spec) {
  const tools = spec.tools;
  const N = 2 ** tools.length;
  const solutions = [];
  for (let mask = 0; mask < N; mask += 1) {
    const ids = tools.filter((_, i) => mask & (1 << i));
    if (buoyancy(spec, ids).dir === 0) solutions.push(ids);
  }
  return { N, solutions };
}

// difficulty(spec) -> 全組合せの数 N。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  return enumerate(spec).N;
}
