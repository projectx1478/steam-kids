// grid-runtimeの純粋関数。DOMに触れない。命令列と盤面仕様から経路と到達判定を返す。
import { GIMMICKS } from './gimmicks/index.js';

const MOVES = {
  up: (p) => ({ x: p.x, y: p.y - 1 }),
  down: (p) => ({ x: p.x, y: p.y + 1 }),
  left: (p) => ({ x: p.x - 1, y: p.y }),
  right: (p) => ({ x: p.x + 1, y: p.y }),
};
const COMMANDS = Object.keys(MOVES);

// step（play/tutorial/intro.demo相当のオブジェクト）から盤面specを組み立てる。grid/walls/items/ice
// を既定値で補う。未知のフィールド（将来のギミック用データ）もそのまま通す（Issue #123）。
export function boardSpec(step) {
  return {
    ...step,
    grid: step.grid || {},
    walls: Array.isArray(step.walls) ? step.walls : [],
    items: Array.isArray(step.items) ? step.items : [],
    ice: Array.isArray(step.ice) ? step.ice : [],
  };
}

// 各ギミックの初期状態をspecから組み立てる（GIMMICKS.keyごとに1つ）。
function initGimmickStates(spec) {
  const states = {};
  for (const g of GIMMICKS) states[g.key] = g.initState(spec);
  return states;
}

// posへ進んだ直後の全ギミック状態を返す（不変更新。既存statesは書き換えない）。
function enterAll(states, spec, pos) {
  const next = {};
  for (const g of GIMMICKS) next[g.key] = g.enter(states[g.key], pos, spec);
  return next;
}

function allCleared(states) {
  return GIMMICKS.every((g) => g.isCleared(states[g.key]));
}

// 全ギミックのstateKeyを連結する。BFS（shortestSteps/shortestChips）の重複排除キーに使う
// （Issue #60のitemMaskAtを一般化。Issue #123）。
function gimmicksKey(states) {
  return GIMMICKS.map((g) => g.stateKey(states[g.key])).join('|');
}

// 移動1手（方向1つ）を解決するmoverをspecから作る。返り値の関数 move(pos, dir, states) は
// 通過した各マスの[{pos, states}]を返す（空配列＝最初の1マスが壁・盤外・blocksで動けない）。
// 最初の1マスへ入った後、ギミックのredirect（こおりの滑り・将来のワープ）が返す先が空いていれば
// 続けて1マスずつ進める（同一の1手として扱う。redirectの第5引数chainedは2マス目以降でtrue）。redirectの連鎖はcols*rows回で打ち切る
// （Issue #61。フックIFはdocs/gimmicks.md）。
function makeMover(spec) {
  const { grid, walls } = spec;
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const limit = grid.cols * grid.rows;
  const isOpen = (p, states) =>
    p.x >= 0 &&
    p.x < grid.cols &&
    p.y >= 0 &&
    p.y < grid.rows &&
    !wallSet.has(`${p.x},${p.y}`) &&
    !GIMMICKS.some((g) => g.blocks?.(states[g.key], p, spec));

  return (pos, dir, states) => {
    const steps = [];
    let next = MOVES[dir](pos);
    let curDir = dir;
    let cur = states;
    let chained = false;
    for (let n = 0; n <= limit && isOpen(next, cur); n += 1) {
      cur = enterAll(cur, spec, next);
      steps.push({ pos: next, states: cur });
      let redirect = null;
      for (const g of GIMMICKS) {
        redirect = g.redirect?.(cur[g.key], next, curDir, spec, chained) ?? null;
        if (redirect) break;
      }
      if (!redirect) break;
      next = redirect.pos;
      curDir = redirect.dir;
      chained = true;
    }
    return steps;
  };
}

// simulate(commands, spec) -> { path, blockedAt, reachedGoal, stepOwner, pickups, remainingItems }
// spec: { grid: {cols, rows}, start: {x,y}, goal: {x,y}, walls: [{x,y}], items?: [{x,y}], … }
// commandsの各要素は方向文字列、または{dir, times}（同方向をまとめた命令）。
// 壁・盤外に進もうとした手はその場に留まり、blockedAtにその命令の元インデックスを記録する。
// stepOwnerはpath[i+1]がcommandsの何番目の要素に属するかを表す（まとめ命令の実行ハイライト用）。
// pickups[i]はpath[i+1]で新たに回収したitemsのインデックス配列（Issue #60。js/gimmicks/items.js）。
// remainingItemsは最終位置までに回収されなかったitem座標（reachedGoalとの併用でクリア判定に使う）。
export function simulate(commands, rawSpec) {
  const spec = boardSpec(rawSpec);
  const { start, goal } = spec;
  const move = makeMover(spec);

  const path = [{ ...start }];
  const blockedAt = [];
  const stepOwner = [];
  const pickups = [];
  let pos = { ...start };
  let states = enterAll(initGimmickStates(spec), spec, pos);

  commands.forEach((entry, i) => {
    const { dir, times } = typeof entry === 'string' ? { dir: entry, times: 1 } : entry;
    for (let n = 0; n < times; n += 1) {
      const steps = move(pos, dir, states);
      if (steps.length === 0) {
        blockedAt.push(i);
        path.push({ ...pos });
        stepOwner.push(i);
        states = enterAll(states, spec, pos);
        pickups.push(states.items?.collected ?? []);
        continue;
      }
      // 滑走などで複数マス進んだ手は1マスずつpathへ展開する（同一stepOwner）。
      for (const step of steps) {
        pos = step.pos;
        states = step.states;
        path.push({ ...pos });
        stepOwner.push(i);
        pickups.push(states.items?.collected ?? []);
      }
    }
  });

  const reachedGoal = pos.x === goal.x && pos.y === goal.y;
  const remainingItems = [...(states.items?.remaining ?? [])].map((idx) => spec.items[idx]);
  return { path, blockedAt, reachedGoal, stepOwner, pickups, remainingItems };
}

// BFSでstart→goal（かつ全ギミックisCleared）の最短手数を求める（到達不能ならInfinity）。
// ギミックが無ければ従来通りの挙動になる。tools/validate-lessons.mjs（ゴール到達可能性の検証）
// とjs/ui-summary.js（できたことの「いちばん みじかい めいれい」判定）の双方が使う
// （Issue #91でvalidate-lessons.mjsから移設。Issue #123でitemMaskAt直書きを一般化）。
export function shortestSteps(rawSpec) {
  const spec = boardSpec(rawSpec);
  const key = (p, states) => `${p.x},${p.y}|${gimmicksKey(states)}`;
  const move = makeMover(spec);
  const startStates = enterAll(initGimmickStates(spec), spec, spec.start);
  const queue = [{ pos: spec.start, states: startStates, dist: 0 }];
  const seen = new Set([key(spec.start, startStates)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y && allCleared(cur.states)) return cur.dist;
    for (const cmd of COMMANDS) {
      const steps = move(cur.pos, cmd, cur.states);
      if (steps.length === 0) continue;
      const { pos: next, states: nextStates } = steps[steps.length - 1];
      const k = key(next, nextStates);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: next, states: nextStates, dist: cur.dist + 1 });
    }
  }
  return Infinity;
}

// groupRepeats:true向け。同方向を連続させれば1チップにまとめられる前提で、
// start→goal（かつ全ギミックisCleared）に必要な最小チップ数を0-1 BFSで求める（到達不能なら
// Infinity）。同方向への移動はコスト0（直前と同じチップに乗る）、方向転換はコスト1（新しいチップ）。
export function shortestChips(rawSpec) {
  const spec = boardSpec(rawSpec);
  const key = (p, dir, states) => `${p.x},${p.y}|${dir ?? '-'}|${gimmicksKey(states)}`;
  const move = makeMover(spec);
  const startStates = enterAll(initGimmickStates(spec), spec, spec.start);
  // dist: key -> { d: チップ数, states }。最終スキャンでのクリア判定にstatesを使う（Issue #123）。
  const dist = new Map([[key(spec.start, null, startStates), { d: 0, states: startStates }]]);
  const deque = [{ pos: spec.start, dir: null, states: startStates }];
  while (deque.length > 0) {
    const cur = deque.shift();
    const curDist = dist.get(key(cur.pos, cur.dir, cur.states)).d;
    for (const cmd of COMMANDS) {
      const steps = move(cur.pos, cmd, cur.states);
      if (steps.length === 0) continue;
      const { pos: next, states: nextStates } = steps[steps.length - 1];
      const cost = cmd === cur.dir ? 0 : 1;
      const nextDist = curDist + cost;
      const nk = key(next, cmd, nextStates);
      if (dist.has(nk) && dist.get(nk).d <= nextDist) continue;
      dist.set(nk, { d: nextDist, states: nextStates });
      if (cost === 0) deque.unshift({ pos: next, dir: cmd, states: nextStates });
      else deque.push({ pos: next, dir: cmd, states: nextStates });
    }
  }
  let best = Infinity;
  for (const [k, entry] of dist) {
    const [xy] = k.split('|');
    const [x, y] = xy.split(',').map(Number);
    if (x === spec.goal.x && y === spec.goal.y && allCleared(entry.states)) best = Math.min(best, entry.d);
  }
  return best;
}
