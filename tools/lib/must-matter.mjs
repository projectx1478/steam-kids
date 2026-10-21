// こおり・かぎの必須性の判定。validate-lessons と盤の生成ツールで同じ判定を使う。
// 戻り値: { matters, dist }
//   matters: true なら必須（外した盤の最短が maxCommands を超える。または対象のギミックが無い）
//   dist: 外した盤の最短（対象のギミックが無いときは null）
import { shortestSteps, shortestChips, boardSpec } from '../../js/engine-grid.js';
import { GIMMICKS } from '../../js/gimmicks/index.js';

function shortest(play, spec) {
  return play.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
}

// 壁にしたマス（ドア・ワープの穴）は通れないので、ぬりの目標に残すと外した盤が解けず「必須」と誤判定する
// （偽の合格）。壁にしたマスを目標から除いた paint を返す。氷はぬりの目標と重ねられない（validate）ので対象外。
function paintWithout(play, cells) {
  if (!Array.isArray(play.paint) || play.paint.length === 0) return play.paint;
  const wall = new Set(cells.map(({ x, y }) => `${x},${y}`));
  return play.paint.filter(({ x, y }) => !wall.has(`${x},${y}`));
}

// 氷を壁扱いにしても到達できるなら、氷を踏まずにクリアできてしまう。
export function iceMustMatter(play) {
  if (!(Array.isArray(play.ice) && play.ice.length > 0)) return { matters: true, dist: null };
  const noIce = boardSpec({ ...play, walls: [...(play.walls || []), ...play.ice], ice: [] });
  const dist = shortest(play, noIce);
  return { matters: !(dist <= play.maxCommands), dist };
}

// ワープの穴を壁扱いにしても到達できるなら、ワープを使わずにクリアできてしまう（ワープが飾り）。氷と同形。
export function warpsMustMatter(play) {
  if (!(Array.isArray(play.warps) && play.warps.length > 0)) return { matters: true, dist: null };
  const noWarp = boardSpec({ ...play, walls: [...(play.walls || []), ...play.warps.map(({ x, y }) => ({ x, y }))], warps: [], paint: paintWithout(play, play.warps) });
  const dist = shortest(play, noWarp);
  return { matters: !(dist <= play.maxCommands), dist };
}

// ドアは壁扱いにしても到達できるなら、かぎを取らずにクリアできてしまう（ドアが飾り）。
export function keysMustMatter(play) {
  if (!(Array.isArray(play.doors) && play.doors.length > 0)) return { matters: true, dist: null };
  const noDoor = boardSpec({ ...play, walls: [...(play.walls || []), ...play.doors], doors: [], keys: [], paint: paintWithout(play, play.doors) });
  const dist = shortest(play, noDoor);
  return { matters: !(dist <= play.maxCommands), dist };
}

// 周期ドアを「常に開」にした盤の最短より、実際の最短（dist）が長くなければドアが飾り。
// dist が null / Infinity、または周期ドアが無いときは判定しない（matters: true, dist: null）。
export function periodicMustMatter(play, dist) {
  if (dist === null || dist === Infinity || !(Array.isArray(play.periodic) && play.periodic.length > 0)) return { matters: true, dist: null };
  const alwaysOpen = boardSpec({ ...play, periodic: [] });
  const alwaysOpenDist = shortest(play, alwaysOpen);
  return { matters: dist > alwaysOpenDist, dist: alwaysOpenDist };
}

// paint の塗りを外した盤の最短より、実際の最短（dist）が長くなければ塗りが飾り。
// dist が null、または paint が無いときは判定しない。
export function paintMustMatter(play, dist) {
  if (dist === null || !(Array.isArray(play.paint) && play.paint.length > 0)) return { matters: true, dist: null };
  const noPaintDist = shortest(play, boardSpec({ ...play, paint: [] }));
  return { matters: dist > noPaintDist, dist: noPaintDist };
}

// 水と橋を外した盤の最短より、実際の最短（dist）が長くなければ水が飾り（生成側 teachMatters のみで使う。js/ の MATTER には載せない）。
// dist が null / Infinity、または水が無いときは判定しない。
export function waterMustMatter(play, dist) {
  if (dist === null || dist === Infinity || !(Array.isArray(play.water) && play.water.length > 0)) return { matters: true, dist: null };
  const noWaterDist = shortestSteps(boardSpec({ ...play, water: [], bridge: [] }));
  return { matters: dist > noWaterDist, dist: noWaterDist };
}

// どんぐりの必須性：どんぐりを除いた盤の最短 < 実際の最短 (generateMap の itemsMustMatter と同じ向き)
export function itemsMustMatter(spec, dist) {
  const strip = GIMMICKS.find((g) => g.key === 'items').strip(spec);
  return shortestSteps(strip) < dist;
}
