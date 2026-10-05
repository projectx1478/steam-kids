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

// 任意フックdead?(state)：真ならその状態から二度とクリアできない（BFSはその遷移を捨てる。枝刈りのみで最短手数は変わらない）。
function isDead(states) {
  return GIMMICKS.some((g) => g.dead?.(states[g.key]));
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
// {steps, bumped, cushioned}を返す。stepsは通過した各マスの[{pos, states}]（空配列＝最初の1マスが
// 壁・盤外・blocksで動けない）。壁・盤外・soft以外のblocksで止まったらbumped（失敗）、
// softなギミック（クッション）で止まったらcushioned（失敗ではない）。
// 最初の1マスへ入った後、ギミックのredirect（こおりの滑り・将来のワープ）が返す先が空いていれば
// 続けて1マスずつ進める（同一の1手として扱う。2マス目以降のstepはslid: true）。redirectの連鎖は
// cols*rows回で打ち切る（Issue #61。フックIFはdocs/gimmicks.md）。
function makeMover(spec) {
  const { grid, walls } = spec;
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const limit = grid.cols * grid.rows;
  const inBoard = (p) => p.x >= 0 && p.x < grid.cols && p.y >= 0 && p.y < grid.rows;
  const blockers = (p, states) => GIMMICKS.filter((g) => g.blocks?.(states[g.key], p, spec));
  const isOpen = (p, states) => inBoard(p) && !wallSet.has(`${p.x},${p.y}`) && blockers(p, states).length === 0;
  const isSoft = (p, states) => {
    if (!inBoard(p) || wallSet.has(`${p.x},${p.y}`)) return false;
    const list = blockers(p, states);
    return list.length > 0 && list.every((g) => g.soft);
  };

  return (pos, dir, states) => {
    const steps = [];
    let next = MOVES[dir](pos);
    let curDir = dir;
    let cur = states;
    let bumped = false;
    let cushioned = false;
    for (let n = 0; n <= limit; n += 1) {
      if (!isOpen(next, cur)) {
        cushioned = isSoft(next, cur);
        bumped = !cushioned;
        break;
      }
      cur = enterAll(cur, spec, next);
      steps.push({ pos: next, states: cur, slid: steps.length > 0 });
      let redirect = null;
      for (const g of GIMMICKS) {
        redirect = g.redirect?.(cur[g.key], next, curDir, spec) ?? null;
        if (redirect) break;
      }
      if (!redirect) break;
      next = redirect.pos;
      curDir = redirect.dir;
    }
    // 手の終わりに1度だけ、tickを持つギミック（周期ドア）の状態を進める（氷の各マスでは進めない。壁衝突・クッションで止まる手も1手）。
    const after = {};
    for (const g of GIMMICKS) after[g.key] = g.tick ? g.tick(cur[g.key]) : cur[g.key];
    return { steps, bumped, cushioned, after };
  };
}

// simulate(commands, spec) -> { path, blockedAt, reachedGoal, stepOwner, innerOwner, roundOwner, pickups,
// slid, bumped, remainingItems }
// spec: { grid: {cols, rows}, start: {x,y}, goal: {x,y}, walls: [{x,y}], items?: [{x,y}], … }
// commandsの各要素は方向文字列、{dir, times}（同方向をまとめた命令）、または{box:[dir…], times}
// （くりかえしの箱。boxをtimes回繰り返す。Issue #66）。
// 壁・盤外に進もうとした手（滑走の途中で当たった場合も）は、そこで止まり、blockedAtにその命令の元
// インデックスを記録する（失敗）。クッションに当たった手はblockedAtに入れず止まるだけ（失敗ではない）。
// どちらも衝突したstepはpathへ現在位置を重複で1つ積む。bumped[i]はpath[i+1]が失敗の衝突ならtrue。
// stepOwnerはpath[i+1]がcommandsの何番目の要素に属するかを表す（まとめ命令の実行ハイライト用）。
// innerOwner[i]はpath[i+1]が箱の中の何番目の方向か（箱の外なら-1。箱内ハイライト用）。
// pickups[i]はpath[i+1]で新たに回収したitemsのインデックス配列（Issue #60。js/gimmicks/items.js）。
// turnAt[k]は展開後のk番目の手（move1回）の開始時の手番（周期ドア。Issue #310）。
// slid[i]はpath[i+1]が滑走（redirect）で進んだマスならtrue（効果音の切替用）。
// remainingItemsは最終位置までに回収されなかったitem座標（reachedGoalとの併用でクリア判定に使う）。
// unmetはitems以外でクリア条件を満たしていないギミックのkey配列（paint＝塗りが目標と不一致）。
// paintOverは目標外を塗ったマス（{x,y}の配列。paint無しは[]）。クリア判定はisRunCleared。
// roundOwner[i]はpath[i+1]が箱のくりかえしの何周目か（0始まり。箱の外は-1。周回の点表示用。Issue #167。
// innerOwnerからの逆算は不可：氷の滑走・クッションで1命令が複数tick（または0+重複1tick）に展開され、
// 同じ箱内indexが連続するため）。
// entryを[方向, 箱内index, 周回]の列へ展開する（箱の外は箱内index=-1・周回=-1）。
function expandEntry(entry) {
  if (typeof entry === 'string') return [[entry, -1, -1]];
  if (entry.box) {
    const seq = [];
    for (let n = 0; n < entry.times; n += 1) entry.box.forEach((dir, j) => seq.push([dir, j, n]));
    return seq;
  }
  return Array.from({ length: entry.times }, () => [entry.dir, -1, -1]);
}

// 命令列のチップ数。箱は「箱1＋中の命令数」、それ以外は1要素=1チップ（Issue #66）。
export function chipCount(commands) {
  return commands.reduce((sum, e) => sum + (typeof e !== 'string' && e.box ? 1 + e.box.length : 1), 0);
}

export function simulate(commands, rawSpec) {
  const spec = boardSpec(rawSpec);
  const { start, goal } = spec;
  const move = makeMover(spec);

  const path = [{ ...start }];
  const blockedAt = [];
  const stepOwner = [];
  const innerOwner = [];
  const roundOwner = [];
  const pickups = [];
  const slid = [];
  const bumpedList = [];
  const turnAt = [];
  let pos = { ...start };
  let states = enterAll(initGimmickStates(spec), spec, pos);

  commands.forEach((entry, i) => {
    for (const [dir, inner, round] of expandEntry(entry)) {
      turnAt.push(states.periodic?.turn ?? 0);
      const { steps, bumped, cushioned, after } = move(pos, dir, states);
      // 滑走などで複数マス進んだ手は1マスずつpathへ展開する（同一stepOwner）。
      for (const step of steps) {
        pos = step.pos;
        states = step.states;
        path.push({ ...pos });
        stepOwner.push(i);
        innerOwner.push(inner);
        roundOwner.push(round);
        pickups.push(states.items?.collected ?? []);
        slid.push(step.slid);
        bumpedList.push(false);
      }
      states = after;
      if (bumped || cushioned) {
        if (bumped) blockedAt.push(i);
        path.push({ ...pos });
        stepOwner.push(i);
        innerOwner.push(inner);
        roundOwner.push(round);
        states = enterAll(states, spec, pos);
        pickups.push(states.items?.collected ?? []);
        slid.push(false);
        bumpedList.push(bumped);
      }
    }
  });

  const reachedGoal = pos.x === goal.x && pos.y === goal.y;
  const remainingItems = [...(states.items?.remaining ?? [])].map((idx) => spec.items[idx]);
  // items以外でクリア条件を満たしていないギミックのkey（items以外は現状paintのみ。remainingItemsは別途返す）。
  const unmet = GIMMICKS.filter((g) => g.key !== 'items' && !g.isCleared(states[g.key])).map((g) => g.key);
  const paintOver = GIMMICKS.find((g) => g.key === 'paint')?.overCells(states.paint) ?? [];
  return { path, blockedAt, reachedGoal, stepOwner, innerOwner, roundOwner, pickups, slid, bumped: bumpedList, remainingItems, unmet, paintOver, turnAt };
}

// simulate()の結果がクリアか（ゴール到達・item全回収・壁衝突なし・他ギミックの条件達成）。
// ui-play・ui-tutorial・tools/validate-lessons.mjsが共通で使う。
export function isRunCleared(result) {
  return result.reachedGoal && result.remainingItems.length === 0 && result.blockedAt.length === 0 && result.unmet.length === 0;
}

// BFSでstart→goal（かつ全ギミックisCleared）の最短手数を求める（到達不能ならInfinity）。
// ギミックが無ければ従来通りの挙動になる。tools/validate-lessons.mjs（ゴール到達可能性の検証）
// とjs/ui-summary.js（できたことの「いちばん みじかい めいれい」判定）の双方が使う
// （Issue #91でvalidate-lessons.mjsから移設。Issue #123でitemMaskAt直書きを一般化）。
// statsを渡すと、返す時点の訪問済み状態数をstats.visitedに入れる（tools/analyze-board.mjs用。結果は不変）。
export function shortestSteps(rawSpec, stats) {
  const spec = boardSpec(rawSpec);
  const key = (p, states) => `${p.x},${p.y}|${gimmicksKey(states)}`;
  const move = makeMover(spec);
  const startStates = enterAll(initGimmickStates(spec), spec, spec.start);
  const queue = [{ pos: spec.start, states: startStates, dist: 0 }];
  const seen = new Set([key(spec.start, startStates)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y && allCleared(cur.states)) {
      if (stats) stats.visited = seen.size;
      return cur.dist;
    }
    for (const cmd of COMMANDS) {
      const { steps, bumped, after } = move(cur.pos, cmd, cur.states);
      if (bumped || steps.length === 0) continue;
      const { pos: next } = steps[steps.length - 1];
      const nextStates = after;
      if (isDead(nextStates)) continue;
      const k = key(next, nextStates);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: next, states: nextStates, dist: cur.dist + 1 });
    }
  }
  if (stats) stats.visited = seen.size;
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
      const { steps, bumped, after } = move(cur.pos, cmd, cur.states);
      if (bumped || steps.length === 0) continue;
      const { pos: next } = steps[steps.length - 1];
      const nextStates = after;
      if (isDead(nextStates)) continue;
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

// start→goal（かつ全ギミックisCleared）の最短経路を命令（方向文字列）の配列で返す。到達不能ならnull。
// 手数はshortestStepsと一致する。最短手数の経路のうち曲がり角（方向転換）が最少のものを返す（Issue #142）。
// 状態は「位置＋ギミック状態＋直前の向き」で、手数の層ごとに曲がり角数の少ない到達を残す。
// 生成（Issue #68）で曲がり角数・solutionの算出に使う。
export function shortestPath(rawSpec) {
  const spec = boardSpec(rawSpec);
  const key = (p, dir, states) => `${p.x},${p.y}|${dir ?? '-'}|${gimmicksKey(states)}`;
  const move = makeMover(spec);
  const startStates = enterAll(initGimmickStates(spec), spec, spec.start);
  const seen = new Set([key(spec.start, null, startStates)]);
  let level = [{ pos: spec.start, dir: null, states: startStates, turns: 0, cmds: [] }];
  while (level.length > 0) {
    let best = null;
    for (const cur of level) {
      if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y && allCleared(cur.states) && (!best || cur.turns < best.turns)) best = cur;
    }
    if (best) return best.cmds;
    const next = new Map();
    for (const cur of level) {
      for (const cmd of COMMANDS) {
        const { steps, bumped, after } = move(cur.pos, cmd, cur.states);
        if (bumped || steps.length === 0) continue;
        const { pos } = steps[steps.length - 1];
        const states = after;
        if (isDead(states)) continue;
        const k = key(pos, cmd, states);
        if (seen.has(k)) continue;
        const turns = cur.turns + (cur.dir !== null && cmd !== cur.dir ? 1 : 0);
        const prev = next.get(k);
        if (!prev || turns < prev.turns) next.set(k, { pos, dir: cmd, states, turns, cmds: [...cur.cmds, cmd] });
      }
    }
    for (const k of next.keys()) seen.add(k);
    level = [...next.values()];
  }
  return null;
}
