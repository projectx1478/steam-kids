// 「素直な手」＝ゴールへまっすぐ向かう手（Issue #766。docs/plan/judgment-guide.md 1章2の機械の代わり）。DOMに触れない。
import { simulate, isRunCleared } from '../../js/engine-grid.js';

const HORIZ = (dx) => (dx > 0 ? 'right' : 'left');
const VERT = (dy) => (dy > 0 ? 'down' : 'up');

// order: 'xy'（横→縦）か 'yx'（縦→横）。使えない方向・start/goal 無し・空の結果は null。
export function naiveCommands(step, order) {
  const { start, goal } = step ?? {};
  if (!start || !goal) return null;
  const dx = goal.x - start.x;
  const dy = goal.y - start.y;
  const h = dx === 0 ? [] : Array(Math.abs(dx)).fill(HORIZ(dx));
  const v = dy === 0 ? [] : Array(Math.abs(dy)).fill(VERT(dy));
  let cmds = order === 'yx' ? [...v, ...h] : [...h, ...v];
  if (cmds.length === 0) return null;
  if (Array.isArray(step.allowedCommands) && cmds.some((c) => !step.allowedCommands.includes(c))) return null;
  if (typeof step.maxCommands === 'number') cmds = cmds.slice(0, step.maxCommands);
  return cmds;
}

// 横→縦でも縦→横でも解けない最初の面。無ければ { index: -1, commands: null }。
export function pickNaiveFailPlay(plays) {
  for (let index = 0; index < plays.length; index += 1) {
    const p = plays[index];
    const xy = naiveCommands(p, 'xy');
    if (xy === null || isRunCleared(simulate(xy, p))) continue;
    const yx = naiveCommands(p, 'yx');
    if (yx === null || !isRunCleared(simulate(yx, p))) return { index, commands: xy };
  }
  return { index: -1, commands: null };
}
