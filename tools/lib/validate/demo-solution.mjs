// intro.demo・play.solution の検証。tools/lib/validate/ からの分割（Issue #448）。
import { simulate, boardSpec, chipCount, isRunCleared } from '../../../js/engine-grid.js';
import { COMMANDS, inGrid } from './common.mjs';

// demo.commands/demo.fixFromの各要素は方向文字列、または{dir, times}（cmd-02のまとめ表示。Issue #104）。
// くりかえしの箱{box:[dir…], times}も許可する（Issue #66）。
function demoEntryDir(entry) {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry?.box)) return entry.box.length > 0 && entry.box.every((d) => COMMANDS.includes(d)) ? COMMANDS[0] : undefined;
  return entry?.dir;
}
function demoEntryTimes(entry) {
  return typeof entry === 'string' ? 1 : entry?.times;
}

// くりかえしの箱の形式検証。問題があれば[rule, 詳細]の配列を返す（空なら正常）。
// 箱の中は方向のみ（入れ子なし）・空の箱不可・回数は2〜4の整数（Issue #66）。
const BOX_TIMES_MIN = 2;
const BOX_TIMES_MAX = 4;
function boxProblems(entry) {
  const problems = [];
  if (!Array.isArray(entry.box) || entry.box.length === 0) {
    problems.push(['空の箱', `box=${JSON.stringify(entry.box)} が空、または配列でない`]);
  } else if (entry.box.some((d) => typeof d !== 'string' || !COMMANDS.includes(d))) {
    const nested = entry.box.some((d) => d && typeof d === 'object');
    problems.push([nested ? '箱の入れ子' : '命令語彙', `box=${JSON.stringify(entry.box)} の中は方向文字列のみ（入れ子不可）`]);
  }
  if (!Number.isInteger(entry.times) || entry.times < BOX_TIMES_MIN || entry.times > BOX_TIMES_MAX) {
    problems.push(['箱の回数', `times=${JSON.stringify(entry.times)} が${BOX_TIMES_MIN}〜${BOX_TIMES_MAX}の整数でない`]);
  }
  return problems;
}

// introのdemo（Issue #97:「はじめに」画面でロボットがゴールへ到達する完成イメージ。本番playとは
// 別のstart/goal）を検証する。demoが無ければ何もしない（現状は任意項目）。
// showCommands（命令チップ列を表示）・fixFrom（先に誤った命令列を実行してから正しい commands へ
// 差し替える「なおす」デモ。Issue #104）は任意項目。playStepsは本番のplay全ステージ（ネタバレ防止の
// 比較対象）。
function checkDemo(intro, playSteps, add) {
  const demo = intro?.demo;
  if (!demo) return;
  const grid = demo.grid || {};
  const walls = Array.isArray(demo.walls) ? demo.walls : [];
  const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const items = Array.isArray(demo.items) ? demo.items : [];
  const label = `stepId="${intro.stepId}" のdemo`;

  if (!Number.isInteger(grid.cols) || !Number.isInteger(grid.rows) || grid.cols < 1 || grid.cols > 20 || grid.rows < 1 || grid.rows > 20) {
    add('盤面の妥当性', `${label} 盤面の大きさは20×20以内（${grid.cols}×${grid.rows}）`);
  }

  if ('showCommands' in demo && typeof demo.showCommands !== 'boolean') {
    add('demoの型', `${label} showCommands=${JSON.stringify(demo.showCommands)} はboolean以外`);
  }

  const coordChecks = [
    ['start', demo.start],
    ['goal', demo.goal],
    ...walls.map((w, i) => [`walls[${i}]`, w]),
    ...items.map((it, i) => [`items[${i}]`, it]),
  ];
  for (const [coordLabel, p] of coordChecks) {
    if (!p || !inGrid(grid, p)) add('座標範囲', `${label} ${coordLabel}=${JSON.stringify(p)} が盤外`);
  }
  if (demo.start && demo.goal) {
    if (demo.start.x === demo.goal.x && demo.start.y === demo.goal.y) {
      add('盤面の妥当性', `${label} start と goal が同一`);
    }
    if (wallKeySet.has(`${demo.start.x},${demo.start.y}`)) add('盤面の妥当性', `${label} start が壁と重なる`);
    if (wallKeySet.has(`${demo.goal.x},${demo.goal.y}`)) add('盤面の妥当性', `${label} goal が壁と重なる`);
  }

  const commandLists = [['commands', demo.commands]];
  if ('fixFrom' in demo) commandLists.push(['fixFrom', demo.fixFrom]);
  let vocabOk = true;
  for (const [key, list] of commandLists) {
    if (!Array.isArray(list) || list.length === 0) {
      add('命令語彙', `${label} ${key}=${JSON.stringify(list)} が空、または配列でない`);
      vocabOk = false;
      continue;
    }
    if (list.some((c) => !COMMANDS.includes(demoEntryDir(c)))) {
      add('命令語彙', `${label} ${key}=${JSON.stringify(list)} が不正`);
      vocabOk = false;
    } else if (list.some((c) => typeof c === 'object' && c.box && boxProblems(c).length > 0)) {
      add('命令語彙', `${label} ${key}の箱が不正（${list.flatMap((c) => (c.box ? boxProblems(c).map((p) => p[0]) : [])).join('・')}）`);
      vocabOk = false;
    } else if (list.some((c) => !Number.isInteger(demoEntryTimes(c)) || demoEntryTimes(c) < 1)) {
      add('命令語彙', `${label} ${key}のtimesが不正`);
      vocabOk = false;
    }
  }
  if (!vocabOk || !demo.start || !demo.goal || !grid.cols || !grid.rows) return;

  const result = simulate(demo.commands, boardSpec(demo));
  if (!isRunCleared(result)) {
    add('デモの到達可能性', `${label} のcommandsを実行してもゴール到達＋全item回収にならない、または壁にぶつかる（paintは目標一致も必要）`);
  }

  if (demo.fixFrom) {
    const fixResult = simulate(demo.fixFrom, boardSpec(demo));
    if (fixResult.reachedGoal && fixResult.remainingItems.length === 0 && fixResult.blockedAt.length === 0) {
      add('デモの到達可能性', `${label} のfixFromがそのままゴールに到達してしまう（直す必要が無い）`);
    }
  }

  // ネタバレ防止: 本番playのいずれかのステージと同じ(start,goal)の組を答えの経路として見せない
  // （Issue #97・#104で全ステージへ拡張）。
  for (const play of playSteps) {
    if (
      play?.start &&
      play?.goal &&
      demo.start.x === play.start.x &&
      demo.start.y === play.start.y &&
      demo.goal.x === play.goal.x &&
      demo.goal.y === play.goal.y
    ) {
      add('デモのネタバレ', `${label} のstart/goalが本番play(stepId="${play.stepId}")と同一（答えのネタバレになる）`);
    }
  }
}

// play.solution（任意。検証ハーネスが正解手順として使う）の検証。
// 形式: 方向文字列の配列（initialCommandsの後ろへ積む命令）、または{ removeIndex?, commands? }
// （initialCommandsのremoveIndex番目を消してからcommandsを積む）。最終キューがクリアすること。
function checkSolution(play, add, label) {
  if (!('solution' in play)) return;
  const sol = play.solution;
  const initial = Array.isArray(play.initialCommands) ? play.initialCommands : [];
  const obj = Array.isArray(sol) ? { commands: sol } : sol;
  const commands = obj && obj.commands !== undefined ? obj.commands : [];
  const isBox = (c) => c && typeof c === 'object' && 'box' in c;
  const valid =
    obj &&
    typeof obj === 'object' &&
    Array.isArray(commands) &&
    commands.every((c) => COMMANDS.includes(c) || (play.repeatBox === true && isBox(c)));
  if (!valid || (obj.removeIndex !== undefined && !Number.isInteger(obj.removeIndex))) {
    add('solutionの形式', `${label}solution=${JSON.stringify(sol)} が不正（方向文字列の配列か{removeIndex,commands}。箱{box,times}はrepeatBox時のみ）`);
    return;
  }
  const boxes = commands.filter(isBox);
  for (const b of boxes) for (const [rule, detail] of boxProblems(b)) add(rule, `${label}solution ${detail}`);
  if (boxes.some((b) => boxProblems(b).length > 0)) return;
  const queue = [...initial];
  if (obj.removeIndex !== undefined) {
    if (obj.removeIndex < 0 || obj.removeIndex >= queue.length) {
      add('solutionの形式', `${label}solution.removeIndex=${obj.removeIndex} がinitialCommandsの範囲外`);
      return;
    }
    queue.splice(obj.removeIndex, 1);
  }
  queue.push(...commands);
  if (!play.start || !play.goal || !play.grid) return;
  const result = simulate(queue, boardSpec(play));
  if (!isRunCleared(result)) {
    add('solutionのクリア', `${label}solutionを実行してもクリアしない（到達=${result.reachedGoal}、未回収=${result.remainingItems.length}、壁・盤外=${result.blockedAt.length}、未達ギミック=${result.unmet.join('・') || 'なし'}）`);
  }
  // groupRepeatsは同方向の連続が1チップにまとまる（ui-commands.js）ためチップ数で数える。
  // repeatBoxは箱1＋中の命令数（chipCount）で数える（Issue #66）。
  const chips = play.repeatBox ? chipCount(queue) : play.groupRepeats ? queue.filter((c, i) => c !== queue[i - 1]).length : queue.length;
  if (typeof play.maxCommands === 'number' && chips > play.maxCommands) {
    add('solutionの手数', `${label}solutionが${chips}${play.groupRepeats || play.repeatBox ? 'チップ' : '手'}でmaxCommands=${play.maxCommands}を超える`);
  }
  return chips;
}

export { checkDemo, checkSolution };
