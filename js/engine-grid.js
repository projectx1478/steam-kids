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
