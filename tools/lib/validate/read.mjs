// 「めいれいを よむ」面（play.read。Issue #723 の試作）の検証。エンジンは js/engine-grid.js と共有する。
// 命令列は3本。どれも壁にぶつからず、止まるマスが互いに違い、スタートとも違う。1本目の止まるマス＝goal。
import { simulate, boardSpec } from '../../../js/engine-grid.js';
import { COMMANDS, isObj } from './common.mjs';

export const READ_PROGRAMS = 3;
export const READ_MIN_LEN = 3;
export const READ_MAX_LEN = 10;

export function checkRead(play, add, label = '') {
  const r = play.read;
  if (!isObj(r) || !Array.isArray(r.programs) || r.programs.length !== READ_PROGRAMS) {
    add('readの形', `${label}read.programs は命令列${READ_PROGRAMS}本の配列である必要がある`);
    return;
  }
  const stops = [];
  r.programs.forEach((prog, i) => {
    const name = `${label}read.programs[${i}]`;
    if (!Array.isArray(prog) || prog.some((c) => !COMMANDS.includes(c))) {
      add('命令語彙', `${name} が不正`);
      return;
    }
    if (prog.length < READ_MIN_LEN || prog.length > READ_MAX_LEN) {
      add('readの長さ', `${name} が${prog.length}手（${READ_MIN_LEN}〜${READ_MAX_LEN}手である必要がある）`);
      return;
    }
    const result = simulate(prog.map((dir) => ({ dir, times: 1 })), boardSpec(play));
    if (result.blockedAt.length > 0) add('readの衝突', `${name} が壁にぶつかる`);
    const stop = result.path.at(-1) ?? play.start;
    if (stop.x === play.start.x && stop.y === play.start.y) add('readの止まるマス', `${name} がスタートで止まる`);
    stops.push(`${stop.x},${stop.y}`);
  });
  if (stops.length !== READ_PROGRAMS) return;
  if (new Set(stops).size !== stops.length) add('readの止まるマス', `${label}命令列の止まるマスが重なっている（${stops.join(' / ')}）`);
  if (stops[0] !== `${play.goal?.x},${play.goal?.y}`) add('readの止まるマス', `${label}1本目の止まるマス(${stops[0]})が goal と違う`);
  if (play.initialCommands || play.groupRepeats || play.maxPauses) add('readの併用', `${label}read は initialCommands・groupRepeats・maxPauses と併用できない`);
}
