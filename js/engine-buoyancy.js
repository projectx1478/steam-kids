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

// netsOf(spec, assign) -> 体ごとの net の配列。assign は 1体なら道具 id の配列、2体なら [{ tool, body: 0|1 }] の配列。
export function netsOf(spec, assign) {
  if (spec.bodies.length === 1) return [netOf(spec.bodies[0], assign)];
  return spec.bodies.map((b, i) =>
    netOf(
      b,
      assign.filter((a) => a.body === i).map((a) => a.tool)
    )
  );
}

// buoyancy(spec, assign) -> { net, nets, dir }。dirは 1=浮く／0=ぴたり／-1=沈む。
// 2体は全体がぴたりのとき0。そうでなければ、最初にぴたりでない体の net・向きを返す。
export function buoyancy(spec, assign) {
  const nets = netsOf(spec, assign);
  const net = nets.find((n) => n !== 0) ?? 0;
  return { net, nets, dir: net > 0 ? 1 : net < 0 ? -1 : 0 };
}

// enumerate(spec) -> { N, solutions }。1体は tools の全部分集合（N＝2^n）、2体は各道具を なし／左／右 に置く全部（N＝3^n）を調べ、
// 全体が0になる組を返す。組は 1体なら tools の並び順の id 配列、2体なら tools の並び順の { tool, body } 配列。
export function enumerate(spec) {
  const tools = spec.tools;
  const two = spec.bodies.length === 2;
  const base = two ? 3 : 2;
  const N = base ** tools.length;
  const solutions = [];
  for (let code = 0; code < N; code += 1) {
    const assign = [];
    let c = code;
    for (const id of tools) {
      const d = c % base;
      c = Math.floor(c / base);
      if (d > 0) assign.push(two ? { tool: id, body: d - 1 } : id);
    }
    if (buoyancy(spec, assign).dir === 0) solutions.push(assign);
  }
  return { N, solutions };
}

// difficulty(spec) -> 全組合せの数 N。ステージごとに非減少であることを検証する。
export function difficulty(spec) {
  return enumerate(spec).N;
}
