// 盤面エディタの判定（worker_threads で実行し、呼び出し側が10秒で打ち切る）。開発者用・手元専用。
// 入力 workerData = { spec }。出力 postMessage({ clearable, shortest, matters, turns, messages })。
// 検査は tools/validate-lessons.mjs（checkBoard・checkSwitchMatters）と tools/lib/must-matter.mjs の関数をそのまま呼ぶ。
import { parentPort, workerData } from 'node:worker_threads';
import { shortestSteps, shortestChips, shortestPath, boardSpec } from '../../js/engine-grid.js';
import { checkBoard, checkSwitchMatters } from '../validate-lessons.mjs';
import { iceMustMatter, keysMustMatter, periodicMustMatter, paintMustMatter, itemsMustMatter } from '../lib/must-matter.mjs';

export const MATTER_KEYS = ['ice', 'keys', 'items', 'periodic', 'paint', 'switches'];
const DEFAULT_COMMANDS = ['up', 'down', 'left', 'right'];
const nonEmpty = (v) => Array.isArray(v) && v.length > 0;

// スイッチの必須性のラッパ（checkSwitchMatters は純関数化しないので、add に配列を渡して NG の有無を見る）。
export function switchesMustMatter(play, dist) {
  const messages = [];
  if (!nonEmpty(play.switches)) return { matters: null, messages };
  checkSwitchMatters(play, dist, (rule, detail) => messages.push(`${rule}: ${detail}`), '');
  return { matters: messages.length === 0, messages };
}

export function countTurns(cmds) {
  return cmds.filter((c, i) => i > 0 && c !== cmds[i - 1]).length;
}

const blank = () => Object.fromEntries(MATTER_KEYS.map((k) => [k, null]));

// spec（盤面 JSON 全体）を判定する。成り立たない盤は clearable:false + messages。
export function analyzeSpec(spec) {
  const matters = blank();
  const messages = [];
  const add = (rule, detail) => messages.push(`${rule}: ${detail}`);
  const ng = () => ({ clearable: false, shortest: null, matters, turns: null, messages });

  const board = { ...spec, allowedCommands: spec.allowedCommands ?? DEFAULT_COMMANDS };
  const groupNg = checkBoard(board, add, '');
  if (messages.length > 0) return ng();

  const dist = board.groupRepeats ? shortestChips(boardSpec(board)) : shortestSteps(boardSpec(board));
  if (dist === Infinity) {
    add('ゴール到達可能性', '到達不能（ゴールに着けない）');
    return ng();
  }
  // maxCommands が無い盤は、最短手数を maxCommands とみなす。
  const maxCommands = typeof board.maxCommands === 'number' ? board.maxCommands : dist;
  const play = { ...board, maxCommands };
  if (dist > maxCommands) {
    add('ゴール到達可能性', `最短${dist}（maxCommands=${maxCommands}以内で到達できない）`);
    return { clearable: false, shortest: dist, matters, turns: null, messages };
  }

  const ice = iceMustMatter(play);
  if (nonEmpty(play.ice)) {
    matters.ice = ice.matters;
    if (!ice.matters) add('こおりの必須性', `こおりを踏まずにmaxCommands=${maxCommands}以内でゴールできる（最短${ice.dist}）`);
  }
  const keys = keysMustMatter(play);
  if (nonEmpty(play.doors)) {
    matters.keys = keys.matters;
    if (!keys.matters) add('かぎの必須性', `かぎを取らずにmaxCommands=${maxCommands}以内でゴールできる（最短${keys.dist}）`);
  }
  if (play.stageGen?.teach === 'items' && !play.groupRepeats) {
    matters.items = itemsMustMatter(play, dist);
    if (!matters.items) add('どんぐりの必須性', `どんぐりを除いても最短${dist}手のまま（どんぐりが最短経路に影響しない）`);
  }
  const periodic = periodicMustMatter(play, dist);
  if (nonEmpty(play.periodic)) {
    matters.periodic = periodic.matters;
    if (!periodic.matters) add('周期ドアの必須性', `周期ドアを常に開とみなした最短(${periodic.dist})より最短(${dist})が長くない`);
  }
  const paint = paintMustMatter(play, dist);
  if (nonEmpty(play.paint)) {
    matters.paint = paint.matters;
    if (!paint.matters) add('paintの必須性', `目標の塗りが最短経路より大きくない（塗り無しの最短${paint.dist}、塗りありの最短${dist}）`);
  }
  if (!groupNg) {
    const sw = switchesMustMatter(play, dist);
    matters.switches = sw.matters;
    messages.push(...sw.messages);
  }

  const path1 = shortestPath(boardSpec(play));
  return { clearable: true, shortest: dist, matters, turns: path1 ? countTurns(path1) : null, messages };
}

if (parentPort && workerData && workerData.spec) {
  try {
    parentPort.postMessage({ ok: true, result: analyzeSpec(workerData.spec) });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
