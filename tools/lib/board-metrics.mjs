// 盤の「考えどころ」K1〜K3 と、非 grid の面の候補数（Issue #720。合否には使わない）。
import {
  boardSpec, makeMover, shortestSteps, initGimmickStates, enterAll, isDead, allCleared, gimmicksKey,
} from '../../js/engine-grid.js';
import { moversOf, allowedPositions, solutionSets, solutionPairs, solutions as seesawSolutions } from '../../js/engine-seesaw.js';
import { enumerate } from '../../js/engine-buoyancy.js';
import { countSolutions as sortCount } from '../../js/engine-sortorder.js';
import { countSolutions as unfoldCount } from '../../js/engine-unfold.js';

export const K_TIMEOUT_MS = 15_000;
export const K_MAX_NODES = 300_000;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const FOUR = Object.keys(DIRS);

class Abort extends Error {}

// ノード数・時刻の打ち切りを数える。tick() は新しい状態を1つ作るたびに呼ぶ。
function budget(maxNodes, deadline, label) {
  let nodes = 0;
  return {
    get nodes() { return nodes; },
    tick() {
      nodes += 1;
      if (nodes > maxNodes) throw new Abort(maxNodes % 10000 === 0 ? `${maxNodes / 10000}万状態で打ち切り` : `${maxNodes}状態で打ち切り`);
      if ((nodes & 255) === 0 && Date.now() >= deadline) throw new Abort(label);
    },
  };
}
const timeoutLabel = (deadline) => (Number.isFinite(deadline) ? '時間切れで打ち切り' : '打ち切り');

const unknown = (reason, nodes, extra = {}) => ({ value: null, reason, nodes, ...extra });

function commandsOf(play) {
  const list = Array.isArray(play.allowedCommands) ? play.allowedCommands.filter((c) => FOUR.includes(c)) : FOUR;
  return list.length > 0 ? list : FOUR;
}

function setup(play) {
  const spec = boardSpec(play);
  const S = shortestSteps(spec);
  const move = makeMover(spec);
  const startStates = enterAll(initGimmickStates(spec), spec, spec.start);
  return { spec, S, move, startStates, cmds: commandsOf(play) };
}
const isClear = (spec, pos, states) => pos.x === spec.goal.x && pos.y === spec.goal.y && allCleared(states);
const lastPos = (steps, pos) => (steps.length > 0 ? steps[steps.length - 1].pos : pos);

// 壁だけの盤で goal から各マスへの距離（BFS）。
function plainDistances(spec) {
  const { cols, rows } = spec.grid;
  const wall = new Set(spec.walls.map((w) => `${w.x},${w.y}`));
  const dp = new Map([[`${spec.goal.x},${spec.goal.y}`, 0]]);
  const queue = [spec.goal];
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i];
    const d = dp.get(`${p.x},${p.y}`);
    for (const [dx, dy] of Object.values(DIRS)) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = `${n.x},${n.y}`;
      if (n.x < 0 || n.y < 0 || n.x >= cols || n.y >= rows || wall.has(k) || dp.has(k)) continue;
      dp.set(k, d + 1);
      queue.push(n);
    }
  }
  return dp;
}

// K1：ギミックを無視したゴールへの最短の命令列が、実際の盤ではどれもクリアにならないか。
export function checkK1(play, { deadline = Infinity, maxNodes = K_MAX_NODES } = {}) {
  const { spec, S, move, startStates, cmds } = setup(play);
  if (!Number.isFinite(S)) return unknown('クリアできない盤', 0);
  const bud = budget(maxNodes, deadline, timeoutLabel(deadline));
  const dp = plainDistances(spec);
  const L = dp.get(`${spec.start.x},${spec.start.y}`);
  if (L === undefined) return { value: true, reason: 'ギミックを無視するとゴールに届かない', nodes: 0 };
  try {
    const key = (pp, rp, st) => `${pp.x},${pp.y}#${rp.x},${rp.y}|${gimmicksKey(st)}`;
    let level = [{ pp: spec.start, rp: spec.start, st: startStates }];
    for (let d = 0; d < L; d += 1) {
      const seen = new Set();
      const next = [];
      for (const cur of level) {
        const dcur = dp.get(`${cur.pp.x},${cur.pp.y}`);
        for (const cmd of cmds) {
          const [dx, dy] = DIRS[cmd];
          const pn = { x: cur.pp.x + dx, y: cur.pp.y + dy };
          if (dp.get(`${pn.x},${pn.y}`) !== dcur - 1) continue;
          const { steps, bumped, after } = move(cur.rp, cmd, cur.st);
          if (bumped || isDead(after)) continue;
          const rn = lastPos(steps, cur.rp);
          const k = key(pn, rn, after);
          if (seen.has(k)) continue;
          seen.add(k);
          bud.tick();
          next.push({ pp: pn, rp: rn, st: after });
        }
      }
      level = next;
      if (level.length === 0) return { value: true, reason: null, nodes: bud.nodes };
    }
    const hit = level.some((c) => isClear(spec, c.rp, c.st));
    return { value: !hit, reason: null, nodes: bud.nodes };
  } catch (e) {
    if (e instanceof Abort) return unknown(e.message, bud.nodes);
    throw e;
  }
}

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

// K2：どんぐりを回る順のうち、最短＋2手以内でクリアできる順が全順序の半数以下か。
export function checkK2(play, { deadline = Infinity, maxNodes = K_MAX_NODES } = {}) {
  const items = Array.isArray(play.items) ? play.items : [];
  const n = items.length;
  const { spec, S, move, startStates, cmds } = setup(play);
  if (!Number.isFinite(S)) return unknown('クリアできない盤', 0, { goodOrders: null, totalOrders: null });
  if (n < 2) return { value: false, reason: 'どんぐり2個未満', nodes: 0, goodOrders: 0, totalOrders: null };
  const total = factorial(n);
  const idx = new Map(items.map((it, i) => [`${it.x},${it.y}`, i]));
  const bud = budget(maxNodes, deadline, timeoutLabel(deadline));
  const good = new Set();
  const visit = (order, p) => {
    const i = idx.get(`${p.x},${p.y}`);
    return i === undefined || order.includes(i) ? order : [...order, i];
  };
  try {
    const key = (p, st, order) => `${p.x},${p.y}|${gimmicksKey(st)}#${order.join(',')}`;
    const start = { pos: spec.start, st: startStates, order: visit([], spec.start) };
    let level = [start];
    const seen = new Set([key(start.pos, start.st, start.order)]);
    const count = (cur) => {
      if (isClear(spec, cur.pos, cur.st)) good.add(cur.order.join(','));
      return good.size * 2 > total;
    };
    if (count(start)) return { value: false, reason: null, nodes: bud.nodes, goodOrders: good.size, totalOrders: total };
    for (let d = 0; d < S + 2 && level.length > 0; d += 1) {
      const next = [];
      for (const cur of level) {
        for (const cmd of cmds) {
          const { steps, bumped, after } = move(cur.pos, cmd, cur.st);
          if (bumped || steps.length === 0 || isDead(after)) continue;
          let order = cur.order;
          for (const s of steps) order = visit(order, s.pos);
          const pos = steps[steps.length - 1].pos;
          const k = key(pos, after, order);
          if (seen.has(k)) continue;
          seen.add(k);
          bud.tick();
          const node = { pos, st: after, order };
          if (count(node)) return { value: false, reason: null, nodes: bud.nodes, goodOrders: good.size, totalOrders: total };
          next.push(node);
        }
      }
      level = next;
    }
    return { value: good.size * 2 <= total, reason: null, nodes: bud.nodes, goodOrders: good.size, totalOrders: total };
  } catch (e) {
    if (e instanceof Abort) return unknown(e.message, bud.nodes, { goodOrders: good.size, totalOrders: total });
    throw e;
  }
}

// K3：どの最短解も同じマスを2回以上通るか。
export function checkK3(play, { deadline = Infinity, maxNodes = K_MAX_NODES } = {}) {
  const { spec, S, move, startStates, cmds } = setup(play);
  if (!Number.isFinite(S)) return unknown('クリアできない盤', 0);
  const bud = budget(maxNodes, deadline, timeoutLabel(deadline));
  const nk = (p, st) => `${p.x},${p.y}|${gimmicksKey(st)}`;
  const cell = (p) => `${p.x},${p.y}`;
  try {
    const startKey = nk(spec.start, startStates);
    const nodes = new Map([[startKey, { pos: spec.start, st: startStates, edges: [] }]]);
    const seen = new Set([startKey]);
    let level = [startKey];
    for (let d = 0; d < S; d += 1) {
      const fresh = new Map();
      for (const fk of level) {
        const cur = nodes.get(fk);
        for (const cmd of cmds) {
          const { steps, bumped, after } = move(cur.pos, cmd, cur.st);
          if (bumped || steps.length === 0 || isDead(after)) continue;
          const pos = steps[steps.length - 1].pos;
          const tk = nk(pos, after);
          if (seen.has(tk) && !fresh.has(tk)) continue;
          if (!fresh.has(tk)) {
            bud.tick();
            fresh.set(tk, { pos, st: after, edges: [] });
          }
          cur.edges.push({ to: tk, cells: steps.map((s) => cell(s.pos)) });
        }
      }
      for (const [k, v] of fresh) { seen.add(k); nodes.set(k, v); }
      level = [...fresh.keys()];
    }
    // 最短解に乗る辺だけ残す（S 層のクリア状態から逆にたどる）。
    const layerOf = new Map([[startKey, 0]]);
    // 層番号を付け直す（前進のみ。edges は同じ層から次の層への辺だけ）。
    const order = [startKey];
    for (let i = 0; i < order.length; i += 1) {
      const k = order[i];
      for (const e of nodes.get(k).edges) if (!layerOf.has(e.to)) { layerOf.set(e.to, layerOf.get(k) + 1); order.push(e.to); }
    }
    const good = new Set(level.filter((k) => { const v = nodes.get(k); return isClear(spec, v.pos, v.st); }));
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const k = order[i];
      const v = nodes.get(k);
      v.edges = v.edges.filter((e) => good.has(e.to));
      if (v.edges.length > 0) good.add(k);
    }
    // 同じマスを2度通らない最短解があるか（深さ優先）。
    const used = new Set();
    const dfs = (k, last) => {
      bud.tick();
      const v = nodes.get(k);
      if (layerOf.get(k) === S) return true;
      for (const e of v.edges) {
        const added = [];
        let ok = true;
        let prev = last;
        for (const c of e.cells) {
          if (c === prev) continue;
          if (used.has(c)) { ok = false; break; }
          used.add(c);
          added.push(c);
          prev = c;
        }
        if (ok && dfs(e.to, prev)) return true;
        for (const c of added) used.delete(c);
      }
      return false;
    };
    used.add(cell(spec.start));
    const simple = good.has(startKey) && dfs(startKey, cell(spec.start));
    return { value: !simple, reason: null, nodes: bud.nodes };
  } catch (e) {
    if (e instanceof Abort) return unknown(e.message, bud.nodes);
    throw e;
  }
}

export function kangaedokoro(play, { timeoutMs = K_TIMEOUT_MS, maxNodes = K_MAX_NODES } = {}) {
  const deadline = Date.now() + timeoutMs;
  const opt = { deadline, maxNodes };
  return { k1: checkK1(play, opt), k2: checkK2(play, opt), k3: checkK3(play, opt) };
}

export function formatKangaeLines({ k1, k2, k3 }) {
  const ynu = (r) => (r.value === null ? `不明（${r.reason}）` : r.value ? 'はい' : 'いいえ');
  const l1 = r1(k1, ynu);
  const l2 = (() => {
    if (k2.value === null) return `不明（${k2.reason}）`;
    const head = k2.value ? 'はい' : 'いいえ';
    if (k2.totalOrders === null) return `${head}（${k2.reason}）`;
    return `${head}（よい順 ${k2.goodOrders}/${k2.totalOrders}）`;
  })();
  return [
    `考えどころ K1（素直な最短では解けない）: ${l1}`,
    `考えどころ K2（回る順が絞られる）: ${l2}`,
    `考えどころ K3（最短でも同じマスを通る）: ${ynu(k3)}`,
  ];
}
function r1(k1, ynu) {
  if (k1.value === true && k1.reason) return `はい（${k1.reason}）`;
  return ynu(k1);
}

// 非 grid の面の候補数と正解数。対象外（egg・generator の面）は null。
export function candidateCount(play) {
  if (play.seesaw) {
    const s = play.seesaw;
    const movers = moversOf(s);
    if (movers.length === 2) {
      let c = 0;
      for (const p1 of allowedPositions(s, 0)) c += allowedPositions(s, 1, [p1]).length;
      return { kind: 'seesaw', candidates: c, solutions: solutionSets(s).length };
    }
    const m = movers[0];
    const posCount = m.fixedPos ? 1 : allowedPositions(s, 0).length;
    const candidates = posCount * (m.maxRobots ?? 1);
    const sols = m.maxRobots || m.fixedPos ? solutionPairs(s).length : seesawSolutions(s).length;
    return { kind: 'seesaw', candidates, solutions: sols };
  }
  if (play.buoyancy) {
    const e = enumerate(play.buoyancy);
    return { kind: 'buoyancy', candidates: e.N, solutions: e.solutions.length };
  }
  if (play.sortOrder) {
    const { cards, before } = play.sortOrder;
    return { kind: 'sort', candidates: factorial(cards.length), solutions: sortCount(cards.map((c) => c.id), before) };
  }
  if (play.unfold) {
    const { cols, rows, preset = [] } = play.unfold;
    const choose = (a, b) => { let r = 1; for (let i = 1; i <= b; i += 1) r = (r * (a - b + i)) / i; return r; };
    return { kind: 'unfold', candidates: choose(cols * rows - preset.length, 6 - preset.length), solutions: unfoldCount(cols, rows, preset) };
  }
  return null;
}
