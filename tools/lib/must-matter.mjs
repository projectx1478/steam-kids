// こおり・かぎの必須性の判定。validate-lessons と盤の生成ツールで同じ判定を使う。
// 戻り値: { matters, dist }
//   matters: true なら必須（外した盤の最短が maxCommands を超える。または対象のギミックが無い）
//   dist: 外した盤の最短（対象のギミックが無いときは null）
import { shortestSteps, shortestChips, boardSpec } from '../../js/engine-grid.js';

function shortest(play, spec) {
  return play.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
}

// 氷を壁扱いにしても到達できるなら、氷を踏まずにクリアできてしまう。
export function iceMustMatter(play) {
  if (!(Array.isArray(play.ice) && play.ice.length > 0)) return { matters: true, dist: null };
  const noIce = boardSpec({ ...play, walls: [...(play.walls || []), ...play.ice], ice: [] });
  const dist = shortest(play, noIce);
  return { matters: !(dist <= play.maxCommands), dist };
}

// ドアは壁扱いにしても到達できるなら、かぎを取らずにクリアできてしまう（ドアが飾り）。
export function keysMustMatter(play) {
  if (!(Array.isArray(play.doors) && play.doors.length > 0)) return { matters: true, dist: null };
  const noDoor = boardSpec({ ...play, walls: [...(play.walls || []), ...play.doors], doors: [], keys: [] });
  const dist = shortest(play, noDoor);
  return { matters: !(dist <= play.maxCommands), dist };
}
