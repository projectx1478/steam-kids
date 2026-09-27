// grid-runtimeの純粋関数。DOMに触れない。命令列と盤面仕様から経路と到達判定を返す。
const MOVES = {
  up: (p) => ({ x: p.x, y: p.y - 1 }),
  down: (p) => ({ x: p.x, y: p.y + 1 }),
  left: (p) => ({ x: p.x - 1, y: p.y }),
  right: (p) => ({ x: p.x + 1, y: p.y }),
};

// simulate(commands, spec) -> { path, blockedAt, reachedGoal, stepOwner, pickups, remainingItems }
// spec: { grid: {cols, rows}, start: {x,y}, goal: {x,y}, walls: [{x,y}], items?: [{x,y}] }
// commandsの各要素は方向文字列、または{dir, times}（同方向をまとめた命令）。
// 壁・盤外に進もうとした手はその場に留まり、blockedAtにその命令の元インデックスを記録する。
// stepOwnerはpath[i+1]がcommandsの何番目の要素に属するかを表す（まとめ命令の実行ハイライト用）。
// pickups[i]はpath[i+1]で新たに回収したitemsのインデックス配列（Issue #60）。
// remainingItemsは最終位置までに回収されなかったitem座標（reachedGoalとの併用でクリア判定に使う）。
export function simulate(commands, spec) {
  const { grid, start, goal, walls, items = [] } = spec;
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const remaining = new Set(items.map((_, idx) => idx));

  function collectAt(p) {
    const found = [];
    for (const idx of remaining) {
      if (items[idx].x === p.x && items[idx].y === p.y) found.push(idx);
    }
    found.forEach((idx) => remaining.delete(idx));
    return found;
  }

  const path = [{ ...start }];
  const blockedAt = [];
  const stepOwner = [];
  const pickups = [];
  let pos = { ...start };
  collectAt(pos);

  commands.forEach((entry, i) => {
    const { dir, times } = typeof entry === 'string' ? { dir: entry, times: 1 } : entry;
    for (let n = 0; n < times; n += 1) {
      const next = MOVES[dir](pos);
      const inBounds = next.x >= 0 && next.x < grid.cols && next.y >= 0 && next.y < grid.rows;
      const hitsWall = wallSet.has(`${next.x},${next.y}`);
      if (inBounds && !hitsWall) {
        pos = next;
      } else {
        blockedAt.push(i);
      }
      path.push({ ...pos });
      stepOwner.push(i);
      pickups.push(collectAt(pos));
    }
  });

  const reachedGoal = pos.x === goal.x && pos.y === goal.y;
  const remainingItems = [...remaining].map((idx) => items[idx]);
  return { path, blockedAt, reachedGoal, stepOwner, pickups, remainingItems };
}

const COMMANDS = Object.keys(MOVES);

// simulateを1手ずつ呼ぶことで、探索の移動ロジックを二重に持たない。
function stepOnce(pos, cmd, spec) {
  const result = simulate([cmd], { ...spec, start: pos });
  return result.blockedAt.length > 0 ? null : result.path[result.path.length - 1];
}

// itemsのうちposで回収できるものをビットマスクにして返す（Issue #60）。
function itemMaskAt(pos, items) {
  let mask = 0;
  items.forEach((it, idx) => {
    if (it.x === pos.x && it.y === pos.y) mask |= 1 << idx;
  });
  return mask;
}

// BFSでstart→goal（かつitems全回収）の最短手数を求める（到達不能ならInfinity）。
// items未指定時はfullMask=0・startMask=0となり従来通りの挙動になる。
// tools/validate-lessons.mjs（ゴール到達可能性の検証）とjs/ui-summary.js（できたことの
// 「いちばん みじかい めいれい」判定）の双方が使う（Issue #91でvalidate-lessons.mjsから移設）。
export function shortestSteps(spec) {
  const items = spec.items ?? [];
  const fullMask = (1 << items.length) - 1;
  const key = (p, mask) => `${p.x},${p.y}|${mask}`;
  const startMask = itemMaskAt(spec.start, items);
  const queue = [{ pos: spec.start, mask: startMask, dist: 0 }];
  const seen = new Set([key(spec.start, startMask)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y && cur.mask === fullMask) return cur.dist;
    for (const cmd of COMMANDS) {
      const next = stepOnce(cur.pos, cmd, spec);
      if (!next) continue;
      const nextMask = cur.mask | itemMaskAt(next, items);
      const k = key(next, nextMask);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: next, mask: nextMask, dist: cur.dist + 1 });
    }
  }
  return Infinity;
}

// groupRepeats:true向け。同方向を連続させれば1チップにまとめられる前提で、
// start→goal（かつitems全回収）に必要な最小チップ数を0-1 BFSで求める（到達不能ならInfinity）。
// 同方向への移動はコスト0（直前と同じチップに乗る）、方向転換はコスト1（新しいチップ）。
export function shortestChips(spec) {
  const items = spec.items ?? [];
  const fullMask = (1 << items.length) - 1;
  const key = (p, dir, mask) => `${p.x},${p.y}|${dir ?? '-'}|${mask}`;
  const startMask = itemMaskAt(spec.start, items);
  const dist = new Map([[key(spec.start, null, startMask), 0]]);
  const deque = [{ pos: spec.start, dir: null, mask: startMask }];
  while (deque.length > 0) {
    const cur = deque.shift();
    const curDist = dist.get(key(cur.pos, cur.dir, cur.mask));
    for (const cmd of COMMANDS) {
      const next = stepOnce(cur.pos, cmd, spec);
      if (!next) continue;
      const nextMask = cur.mask | itemMaskAt(next, items);
      const cost = cmd === cur.dir ? 0 : 1;
      const nextDist = curDist + cost;
      const nk = key(next, cmd, nextMask);
      if (dist.has(nk) && dist.get(nk) <= nextDist) continue;
      dist.set(nk, nextDist);
      if (cost === 0) deque.unshift({ pos: next, dir: cmd, mask: nextMask });
      else deque.push({ pos: next, dir: cmd, mask: nextMask });
    }
  }
  let best = Infinity;
  for (const [k, v] of dist) {
    const [xy, , mask] = k.split('|');
    const [x, y] = xy.split(',').map(Number);
    if (x === spec.goal.x && y === spec.goal.y && Number(mask) === fullMask) best = Math.min(best, v);
  }
  return best;
}
