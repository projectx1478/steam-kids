// grid-runtimeの純粋関数。DOMに触れない。命令列と盤面仕様から経路と到達判定を返す。
const MOVES = {
  up: (p) => ({ x: p.x, y: p.y - 1 }),
  down: (p) => ({ x: p.x, y: p.y + 1 }),
  left: (p) => ({ x: p.x - 1, y: p.y }),
  right: (p) => ({ x: p.x + 1, y: p.y }),
};

// simulate(commands, spec) -> { path, blockedAt, reachedGoal }
// spec: { grid: {cols, rows}, start: {x,y}, goal: {x,y}, walls: [{x,y}] }
// 壁・盤外に進もうとした手はその場に留まり、blockedAtにその命令のインデックスを記録する。
export function simulate(commands, spec) {
  const { grid, start, goal, walls } = spec;
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));

  const path = [{ ...start }];
  const blockedAt = [];
  let pos = { ...start };

  commands.forEach((cmd, i) => {
    const next = MOVES[cmd](pos);
    const inBounds = next.x >= 0 && next.x < grid.cols && next.y >= 0 && next.y < grid.rows;
    const hitsWall = wallSet.has(`${next.x},${next.y}`);
    if (inBounds && !hitsWall) {
      pos = next;
    } else {
      blockedAt.push(i);
    }
    path.push({ ...pos });
  });

  const reachedGoal = pos.x === goal.x && pos.y === goal.y;
  return { path, blockedAt, reachedGoal };
}
