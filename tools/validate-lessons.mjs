#!/usr/bin/env node
// lessons/*.json のスキーマ検証。検証NGの場合は再生成する。手で通さない（docs/lesson-schema.md）。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMap, SHAPE_PRESETS } from '../js/engine-generate.js';
import { isValidCode, codeToSeed } from '../js/seed-code.js';
import { simulate, shortestSteps, shortestChips, boardSpec, chipCount, isRunCleared } from '../js/engine-grid.js';
import { iceMustMatter, keysMustMatter } from './lib/must-matter.mjs';
import { itemsMustMatter } from './gen/stage-gen.mjs';
import { balance, solutions, difficulty } from '../js/engine-seesaw.js';
import { GIMMICKS } from '../js/gimmicks/index.js';
import { unitsOf } from '../js/index-units.js';
import { plainSegmentsText, plainReading, parseSegments, rubyGrade, textKanjiMaxGrade, KANJI_RE } from '../js/text-render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// LESSONS_DIR環境変数は検証シナリオ（NG例の検出確認。test/validate-repeat-box.test.mjs）用の差し替え口。
const LESSONS_DIR = process.env.LESSONS_DIR || path.join(ROOT, 'lessons');

const REQUIRED_KEYS = ['lessonId', 'unitId', 'title', 'type', 'estimatedMinutes', 'steps'];
const KINDS = ['intro', 'predict', 'play', 'tutorial', 'summary', 'seedPick'];
const COMMANDS = ['up', 'down', 'left', 'right'];
const MIN_STEPS = 4;
const MAX_STEPS = 7;
const MIN_PLAY = 2;
const MAX_PLAY = 4;
// 長尺試作（lessons/index.json の longTrialIds。Issue #319）と、stageGen を持つレッスン（seedPick なし。Issue #369）だけに許す上限。MIN_*は共通。
const LONG_MAX_STEPS = 12;
const LONG_MAX_PLAY = 8;
const LONG_MINUTES = 8;
// docs/authoring-rules.md「禁止事項」で確定した否定語リスト。
const FORBIDDEN_WORDS = ['ちがう', 'まちがい', 'ざんねん'];

function inGrid(grid, p) {
  return p.x >= 0 && p.x < grid.cols && p.y >= 0 && p.y < grid.rows;
}

// play/tutorialに共通の盤面検証（allowedCommands・座標範囲・start/goal・壁重なり・item重複）。
// labelはエラー文言の頭に付ける識別子（play=''、tutorialは`stepId="…" の`）（Issue #81）。
function checkBoard(board, add, label) {
  const grid = board.grid || {};
  const walls = Array.isArray(board.walls) ? board.walls : [];
  const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const items = Array.isArray(board.items) ? board.items : [];
  const ice = Array.isArray(board.ice) ? board.ice : [];
  const cushion = Array.isArray(board.cushion) ? board.cushion : [];
  const waterList = Array.isArray(board.water) ? board.water : [];
  const bridgeList = Array.isArray(board.bridge) ? board.bridge : [];
  const keys = Array.isArray(board.keys) ? board.keys : [];
  const doors = Array.isArray(board.doors) ? board.doors : [];
  const switchList = Array.isArray(board.switches) ? board.switches : [];

  if (!Array.isArray(board.allowedCommands) || board.allowedCommands.some((c) => !COMMANDS.includes(c))) {
    add('命令語彙', `${label}allowedCommands=${JSON.stringify(board.allowedCommands)} が不正`);
  }

  const coordChecks = [
    ['start', board.start],
    ['goal', board.goal],
    ...walls.map((w, i) => [`walls[${i}]`, w]),
    ...items.map((it, i) => [`items[${i}]`, it]),
    ...ice.map((c, i) => [`ice[${i}]`, c]),
    ...cushion.map((c, i) => [`cushion[${i}]`, c]),
    ...waterList.map((c, i) => [`water[${i}]`, c]),
    ...bridgeList.map((c, i) => [`bridge[${i}]`, c]),
    ...keys.map((c, i) => [`keys[${i}]`, c]),
    ...doors.map((c, i) => [`doors[${i}]`, c]),
    ...switchList.flatMap((s, i) => [
      [`switches[${i}]`, s],
      ...(Array.isArray(s?.targets) ? s.targets : []).map((t, j) => [`switches[${i}].targets[${j}]`, t]),
    ]),
  ];
  for (const [coordLabel, p] of coordChecks) {
    if (!p || !inGrid(grid, p)) add('座標範囲', `${label}${coordLabel}=${JSON.stringify(p)} が盤外`);
  }

  if (board.start && board.goal) {
    if (board.start.x === board.goal.x && board.start.y === board.goal.y) {
      add('盤面の妥当性', `${label}start と goal が同一`);
    }
    if (wallKeySet.has(`${board.start.x},${board.start.y}`)) add('盤面の妥当性', `${label}start が壁と重なる`);
    if (wallKeySet.has(`${board.goal.x},${board.goal.y}`)) add('盤面の妥当性', `${label}goal が壁と重なる`);
  }

  for (const g of GIMMICKS) g.validate(board, add, label);
}

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

// 「れんしゅう」レッスン（seedPickとgenerator付きplayを持つ。Issue #69）の検証。盤面はシードから
// 生成されるためcheckBoard等は使わず、generatorが実際に盤面を作れることをサンプルのたねで確かめる。
const PRACTICE_SAMPLE_SEEDS = 40;
// generator.shape（形のプリセット。Issue #338）の検査。値・generator.grid（必須でプリセットの大きさと一致）・
// 同じplayの water/bridge/waterMode の直接指定との同時指定。NGがあれば false（例外にしない）。
function validateShape(play, add) {
  const { generator } = play;
  if (generator.shape === undefined) return true;
  const preset = Object.hasOwn(SHAPE_PRESETS, generator.shape) ? SHAPE_PRESETS[generator.shape] : null;
  if (!preset) {
    add('generator.shape', `shape=${JSON.stringify(generator.shape)} が不正（${Object.keys(SHAPE_PRESETS).join('/')}のいずれか）`);
    return false;
  }
  let ok = true;
  const grid = generator.grid;
  if (!grid || typeof grid !== 'object') {
    add('generator.grid', `shape="${generator.shape}" のときはgenerator.gridが必須（${preset.grid.cols}×${preset.grid.rows}）`);
    ok = false;
  } else if (grid.cols !== preset.grid.cols || grid.rows !== preset.grid.rows) {
    add('generator.grid', `shape="${generator.shape}" は${preset.grid.cols}×${preset.grid.rows}（grid=${grid.cols}×${grid.rows}と違う）`);
    ok = false;
  }
  for (const key of ['water', 'bridge', 'waterMode']) {
    if (play[key] !== undefined) {
      add('generator.shapeと直接指定', `generator.shapeと${key}は同時に置けない`);
      ok = false;
    }
  }
  return ok;
}
function validatePractice(steps, add) {
  const kinds = steps.map((s) => s.kind).join(',');
  if (kinds !== 'seedPick,play,summary') {
    add('れんしゅうの構成', `steps=${kinds}（seedPick,play,summaryの順である必要がある）`);
    return;
  }
  const play = steps[1];
  if (!play.generator || typeof play.generator !== 'object') {
    add('generator', 'playにgeneratorがない');
    return;
  }
  if (!validateShape(play, add)) return;
  for (let n = 0; n < PRACTICE_SAMPLE_SEEDS; n += 1) {
    const code = n.toString(8).padStart(4, '0');
    if (!isValidCode(code)) continue;
    const map = generateMap(play.generator, codeToSeed(code));
    if (map.fallback) add('generatorの生成失敗', `たね${code}で制約を満たす盤面が作れず予備盤面になる`);
    if (map.solution.length > map.maxCommands) add('generatorの手数', `たね${code}でsolution(${map.solution.length}手)がmaxCommands=${map.maxCommands}を超える`);
    const result = simulate(map.solution, boardSpec(map));
    if (!result.reachedGoal) add('generatorのsolution', `たね${code}でsolutionがゴールに届かない`);
  }
}

// predict-slider（シーソー）：playは2〜4個、座標が範囲内、solutionでつりあいstartでは傾く、
// 解がちょうど1つ、難易度（左のおもさ合計）が非減少（Issue #150）。
function validateSeesaw(playSteps, add, maxPlay = MAX_PLAY) {
  if (playSteps.length < MIN_PLAY || playSteps.length > maxPlay) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（${MIN_PLAY}〜${maxPlay}個である必要がある）`);
  }
  const isInt = (v) => Number.isInteger(v) && v >= 1;
  let prevDifficulty = 0;
  for (const play of playSteps) {
    const label = `stepId="${play.stepId}"`;
    const spec = play.seesaw;
    const ok =
      spec &&
      isInt(spec.notches) &&
      Array.isArray(spec.left) &&
      spec.left.length > 0 &&
      spec.left.every((w) => isInt(w.robots) && isInt(w.pos) && w.pos <= spec.notches) &&
      spec.mover &&
      isInt(spec.mover.robots) &&
      isInt(spec.mover.start) &&
      spec.mover.start <= spec.notches;
    if (!ok) {
      add('seesaw', `${label} のseesaw（notches・left・mover）が不正（robots・pos・startは1〜notchesの整数）`);
      continue;
    }
    const found = solutions(spec);
    if (found.length !== 1) add('解の個数', `${label} のつりあう位置が${found.length}個（ちょうど1つである必要がある）`);
    if (play.solution !== found[0]) add('solution', `${label} のsolution=${play.solution} がつりあう位置と一致しない`);
    if (balance(spec, spec.mover.start).tilt === 0) add('start', `${label} がstartの時点でつりあっている`);
    const d = difficulty(spec);
    if (d < prevDifficulty) add('難易度', `${label} の左のおもさ合計(${d})が前のステージ(${prevDifficulty})より小さい`);
    prevDifficulty = d;
  }
}

// stageGen・gen の検査（Issue #337。docs/lesson-schema.md）。実行時は読まない開発用の設定。
const SG_KEYS = ['ver', 'stages', 'keepHandwritten', 'grid', 'walls', 'gimmicks', 'teach', 'shortestPath', 'minTurns', 'allowedCommands', 'seedBase'];
const SG_GIMMICK_RANGES = { items: [1, 4], ice: [1, 4], keys: [1, 2], cushion: [1, 4], switches: [1, 2] };
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkStageGen(data, steps, add) {
  const sg = data.stageGen;
  const label = 'stageGen';
  const unknown = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) add('stageGen の未知のキー', `${where}の ${k} は受け付けない`);
  };
  // {min,max} の検査。範囲 [lo,hi] 内の整数で min<=max。形が正しければ true。
  const range = (v, lo, hi, where) => {
    if (!isObj(v)) { add(label, `${where} が {min,max} でない`); return false; }
    unknown(v, ['min', 'max'], where);
    if (!isInt(v.min) || !isInt(v.max) || v.min < lo || v.max > hi || v.min > v.max) {
      add(label, `${where}=${JSON.stringify(v)} が不正（整数の min<=max で ${lo}〜${hi}）`);
      return false;
    }
    return true;
  };
  if (isObj(sg) && steps.some((s) => s.kind === 'seedPick')) {
    add(label, 'れんしゅう型（seedPick）のレッスンには置けない');
  }
  if (sg !== undefined) {
    if (!isObj(sg)) {
      add(label, 'stageGen がオブジェクトでない');
    } else {
      unknown(sg, SG_KEYS, 'stageGen');
      if (!isInt(sg.ver) || sg.ver < 1) add(label, `ver=${JSON.stringify(sg.ver)} は 1 以上の整数でない`);
      const plays = steps.filter((s) => s.kind === 'play').map((s) => s.stepId);
      const keep = sg.keepHandwritten ?? [];
      let keepOk = Array.isArray(keep) && keep.every((k) => typeof k === 'string');
      if (!keepOk) add(label, 'keepHandwritten が stepId の配列でない');
      if (keepOk) {
        if (new Set(keep).size !== keep.length) add(label, 'keepHandwritten に重複がある');
        for (const k of keep) if (!plays.includes(k)) add(label, `keepHandwritten の ${k} は play の stepId にない`);
        if (!keep.every((k, i) => k === plays[i])) add(label, 'keepHandwritten が先頭の play から連続していない');
      }
      if (!isInt(sg.stages) || sg.stages < 2 || sg.stages > 8) {
        add(label, `stages=${JSON.stringify(sg.stages)} は 2〜8 の整数でない`);
      } else {
        if (keepOk && sg.stages < keep.length + 1) add(label, `stages=${sg.stages} が keepHandwritten.length+1 (${keep.length + 1}) 未満`);
      }
      if (!isObj(sg.grid)) {
        add(label, 'grid がオブジェクトでない');
      } else {
        unknown(sg.grid, ['cols', 'rows'], 'grid');
        range(sg.grid.cols, 3, 6, 'grid.cols');
        range(sg.grid.rows, 3, 6, 'grid.rows');
      }
      if ('walls' in sg) range(sg.walls, 0, 12, 'walls');
      const gim = sg.gimmicks ?? {};
      if (!isObj(gim)) {
        add(label, 'gimmicks がオブジェクトでない');
      } else {
        for (const [k, v] of Object.entries(gim)) {
          if (!(k in SG_GIMMICK_RANGES)) add('stageGen 未対応のギミック', `gimmicks の ${k} は未対応（items・ice・keys・cushion・switches のみ）`);
          else range(v, SG_GIMMICK_RANGES[k][0], SG_GIMMICK_RANGES[k][1], `gimmicks.${k}`);
        }
        const names = Object.keys(gim);
        if (names.length === 0 && 'teach' in sg) add(label, 'gimmicks が空なのに teach がある');
        else if (names.length > 0 && !('teach' in sg)) add(label, 'gimmicks があるのに teach がない');
        else if ('teach' in sg && !names.includes(sg.teach)) add(label, `teach=${JSON.stringify(sg.teach)} が gimmicks にない`);
        if ('switches' in gim && 'keys' in gim) add(label, 'switches と keys は併用できない');
        if (sg.teach === 'cushion' && !(isObj(gim.ice) && isInt(gim.ice.max) && gim.ice.max >= 1)) add(label, 'teach=cushion には gimmicks.ice（最大1以上）の併用が必要');
      }
      range(sg.shortestPath, 2, 16, 'shortestPath');
      if ('minTurns' in sg && (!isInt(sg.minTurns) || sg.minTurns < 0 || sg.minTurns > 8)) {
        add(label, `minTurns=${JSON.stringify(sg.minTurns)} は 0〜8 の整数でない`);
      }
      if ('allowedCommands' in sg) {
        const a = sg.allowedCommands;
        if (!Array.isArray(a) || a.length === 0 || a.some((c) => !COMMANDS.includes(c)) || new Set(a).size !== a.length) {
          add(label, `allowedCommands=${JSON.stringify(a)} は上下左右の部分集合（1個以上・重複なし）でない`);
        }
      }
      if ('seedBase' in sg && (!isInt(sg.seedBase) || sg.seedBase < 0)) {
        add(label, `seedBase=${JSON.stringify(sg.seedBase)} は 0 以上の整数でない`);
      }
    }
  }
  for (const step of steps) {
    if (!('gen' in step)) continue;
    const where = `stepId="${step.stepId}" の gen`;
    if (!isObj(step.gen)) { add('gen', `${where} がオブジェクトでない`); continue; }
    unknown(step.gen, ['seed', 'ver'], where);
    if (!isInt(step.gen.seed) || step.gen.seed < 0) add('gen', `${where}.seed=${JSON.stringify(step.gen.seed)} は 0 以上の整数でない`);
    if (!isObj(sg)) { add('gen', `${where} があるのに stageGen が無い`); continue; }
    if (step.gen.ver !== sg.ver) add('gen', `${where}.ver=${JSON.stringify(step.gen.ver)} が stageGen.ver=${JSON.stringify(sg.ver)} と違う`);
    if (Array.isArray(sg.keepHandwritten) && sg.keepHandwritten.includes(step.stepId)) {
      add('gen', `${where} が keepHandwritten の stepId にある`);
    }
  }
}

export function validateLesson(fileName, data, longTrialIds = []) {
  const errors = [];
  const add = (rule, detail) => errors.push(`${fileName}: ${rule}: ${detail}`);

  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) add('必須キー', `${key} がない`);
  }
  if (errors.length > 0) return errors;

  const idFromFile = path.basename(fileName, '.json');
  if (data.lessonId !== idFromFile) {
    add('ID一致', `lessonId="${data.lessonId}" はファイル名"${idFromFile}"と不一致`);
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  // 長尺試作＝ファイル名由来のidが longTrialIds に載るレッスン（lessonIdでは引かない）。
  const isLong = longTrialIds.includes(idFromFile);
  // stageGen の別枠（Issue #369）＝stageGen がオブジェクトで seedPick が無いレッスン。longTrialIds とは無関係で、あれば別枠を優先する。
  const isGenLong = isObj(data.stageGen) && !steps.some((s) => s.kind === 'seedPick');
  const wide = isLong || isGenLong;
  const minutes = wide ? LONG_MINUTES : 5;
  if (data.estimatedMinutes !== minutes) {
    add('所要時間', `estimatedMinutes=${data.estimatedMinutes}（${minutes}である必要がある）`);
  }
  const maxSteps = wide ? LONG_MAX_STEPS : MAX_STEPS;
  // 別枠の play 上限は stageGen.stages。stages が不正なときは検査せず、stageGen 自体の不合格に任せる。
  const sgStages = isGenLong ? data.stageGen.stages : undefined;
  const maxPlay = isGenLong
    ? (isInt(sgStages) && sgStages >= 2 && sgStages <= 8 ? sgStages : Infinity)
    : (isLong ? LONG_MAX_PLAY : MAX_PLAY);

  checkStageGen(data, steps, add);
  if (steps.some((s) => s.kind === 'seedPick')) {
    if (isLong) add('長尺試作とseedPick', 'longTrialIdsのレッスンはseedPick（れんしゅう）を持てない');
    validatePractice(steps, add);
    return errors;
  }
  if (steps.length < MIN_STEPS || steps.length > maxSteps) {
    add('ステップ数', `steps.length=${steps.length}（${MIN_STEPS}〜${maxSteps}である必要がある）`);
  }

  for (const step of steps) {
    if (!KINDS.includes(step.kind)) {
      add('kind', `stepId="${step.stepId}" の kind="${step.kind}" が不正`);
    }
    if (typeof step.text === 'string') {
      // ルビ記法 {漢字|よみ} 外に生の漢字・崩れた中括弧が残っていないか（地の文部分のみで判定）。
      const outside = plainSegmentsText(step.text);
      if (KANJI_RE.test(outside)) add('ルビ外の漢字', `stepId="${step.stepId}" の text にルビ記法外の漢字がある`);
      if (outside.includes('{') || outside.includes('}')) {
        add('ルビ記法', `stepId="${step.stepId}" の text の中括弧が壊れている（{漢字|よみ}の形式で書く）`);
      }
      // ルビ内の漢字が学年別漢字配当表（js/kanji-grades.js）に無ければNG。よみ側に漢字が
      // 混じっている（読み仮名になっていない）場合もNG。
      for (const seg of parseSegments(step.text)) {
        if (typeof seg === 'string') continue;
        if (rubyGrade(seg.kanji) === null) {
          add('配当表外の漢字', `stepId="${step.stepId}" の {${seg.kanji}|${seg.kana}} に配当表に無い漢字がある`);
        }
        if (KANJI_RE.test(seg.kana)) {
          add('ルビ記法', `stepId="${step.stepId}" の {${seg.kanji}|${seg.kana}} のよみに漢字が混じっている`);
        }
      }
      // 20字制限は全てひらがなに展開した表示（よみレベル0）で判定する（最長になる表示のため）。
      const reading = plainReading(step.text);
      if ([...reading].length > 20) add('文字数', `stepId="${step.stepId}" の text が展開後20字超`);
      for (const word of FORBIDDEN_WORDS) {
        if (reading.includes(word)) add('否定語', `stepId="${step.stepId}" の text に否定語「${word}」がある`);
      }
    }
  }

  // predictは0個でもよい（現行レッスンはIssue #104で全廃。将来の教材型のため語彙は残す）。
  const predictSteps = steps.filter((s) => s.kind === 'predict');

  // playは2〜4個（だんだん難易度を上げる複数ステージ構成。Issue #104）。長尺試作の一覧IDだけ2〜8個（Issue #319）。
  const playSteps = steps.filter((s) => s.kind === 'play');
  if (data.type === 'grid-runtime' && (playSteps.length < MIN_PLAY || playSteps.length > maxPlay)) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（${MIN_PLAY}〜${maxPlay}個である必要がある）`);
  }

  // チュートリアル（tutorial）は各単元1本目のみ・0〜1個（Issue #81）。
  const tutorialSteps = steps.filter((s) => s.kind === 'tutorial');
  if (tutorialSteps.length > 1) {
    add('チュートリアルの個数', `kind="tutorial" が${tutorialSteps.length}個（0〜1個である必要がある）`);
  }

  if (data.type === 'predict-slider') {
    validateSeesaw(playSteps, add, maxPlay);
    return errors;
  }
  if (data.type !== 'grid-runtime' || playSteps.length === 0) return errors;

  checkDemo(steps.find((s) => s.kind === 'intro'), playSteps, add);

  // 各ステージの最短距離（groupRepeatsはチップ数）。難易度がステージごとに非減少であることを
  // 後段でまとめて検証する（Issue #104）。
  const stageDistances = [];
  for (const play of playSteps) {
    const grid = play.grid || {};
    const label = `stepId="${play.stepId}" の`;

    checkBoard(play, add, label);

    if ('groupRepeats' in play && typeof play.groupRepeats !== 'boolean') {
      add('groupRepeatsの型', `${label}groupRepeats=${JSON.stringify(play.groupRepeats)} はboolean以外`);
    }

    if ('initialCommands' in play) {
      const initial = play.initialCommands;
      if (!Array.isArray(initial) || initial.some((c) => !COMMANDS.includes(c))) {
        add('命令語彙', `${label}initialCommands=${JSON.stringify(initial)} が不正`);
      } else if (typeof play.maxCommands === 'number' && initial.length > play.maxCommands) {
        add('なおすの初期状態', `${label}initialCommands.length=${initial.length} がmaxCommands=${play.maxCommands}を超える`);
      }
    }

    if ('repeatBox' in play && typeof play.repeatBox !== 'boolean') {
      add('repeatBoxの型', `${label}repeatBox=${JSON.stringify(play.repeatBox)} はboolean以外`);
    }
    if (play.repeatBox === true && play.groupRepeats === true) {
      add('repeatBoxとgroupRepeats', `${label}repeatBoxとgroupRepeatsは同時に指定できない`);
    }

    const solutionChips = checkSolution(play, add, label);

    let dist = null;
    if (play.repeatBox === true) {
      // 箱ステージ：最短性はBFSで求めない。箱なしの最短手数がmaxCommandsを超える（箱が必須）ことと、
      // solutionが必須であること（maxCommands判定の根拠）を検証する。難易度順序はsolutionのチップ数で比較。
      if (!('solution' in play)) add('solutionの必須', `${label}repeatBoxにはsolutionが必要`);
      if (play.start && play.goal && grid.cols && grid.rows) {
        const noBox = shortestSteps(boardSpec(play));
        if (noBox <= play.maxCommands) {
          add('箱の必須性', `${label}箱なしでmaxCommands=${play.maxCommands}以内に解ける（最短${noBox}手）`);
        }
      }
      dist = typeof solutionChips === 'number' ? solutionChips : null;
    } else if (play.start && play.goal && grid.cols && grid.rows) {
      const spec = boardSpec(play);
      // groupRepeatsありのレッスンは、同方向連続をまとめた最小チップ数で判定する
      // （まとめないと手数制限に収まらないレッスンを正しく通すため）。
      dist = play.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
      if (dist > play.maxCommands) {
        add(
          'ゴール到達可能性',
          `${label}最短${dist === Infinity ? '到達不能' : dist + (play.groupRepeats ? 'チップ' : '手')}` +
            `（maxCommands=${play.maxCommands}以内で到達できない）`
        );
      }
      // 氷ステージは氷を壁扱いにしても到達できるなら、氷を踏まずにクリアできてしまう。
      const iceCheck = iceMustMatter(play);
      if (!iceCheck.matters) {
        add('こおりの必須性', `${label}こおりを踏まずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${iceCheck.dist}）`);
      }
    }
    // ドアは壁扱いにしても到達できるなら、かぎを取らずにクリアできてしまう（ドアが飾り）。
    if (dist !== null) {
      const keysCheck = keysMustMatter(play);
      if (!keysCheck.matters) {
        add('かぎの必須性', `${label}かぎを取らずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${keysCheck.dist}）`);
      }
    }
    // 生成したステップ（gen 付き）で teach=items のとき、どんぐりを除いた盤の最短が実際の最短より短いこと（Issue #337）。
    if (dist !== null && dist !== Infinity && play.gen && data.stageGen?.teach === 'items' && !play.groupRepeats) {
      if (!itemsMustMatter(play, dist)) {
        add('どんぐりの必須性', `${label}どんぐりを除いても最短${dist}手のまま（どんぐりが最短経路に影響しない）`);
      }
    }
    // 周期ドアを「常に開」（ドアを無視）にした盤の最短と比べ、実際の最短が長くなければドアが飾り（待ち・寄り道が要らない）。
    // 「常に開の最短 <= maxCommands なら不合格」は、ドアは通行を狭めるだけで常に成立してしまうため、paintの必須性と同じ比較にした。
    if (dist !== null && dist !== Infinity && Array.isArray(play.periodic) && play.periodic.length > 0) {
      const alwaysOpen = boardSpec({ ...play, periodic: [] });
      const alwaysOpenDist = play.groupRepeats ? shortestChips(alwaysOpen) : shortestSteps(alwaysOpen);
      if (!(dist > alwaysOpenDist)) {
        add('周期ドアの必須性', `${label}周期ドアを常に開とみなした最短(${alwaysOpenDist})より最短(${dist})が長くない（待ち・寄り道が要らず、ドアが飾り）`);
      }
    }
    // paint：目標が最短経路（塗り無しの最短）より大きいこと（塗りが飾りでない）と、maxCommands＝最短ちょうど。
    if (dist !== null && Array.isArray(play.paint) && play.paint.length > 0) {
      const noPaintDist = shortestSteps(boardSpec({ ...play, paint: [] }));
      if (!(dist > noPaintDist)) add('paintの必須性', `${label}目標の塗りが最短経路より大きくない（塗り無しの最短${noPaintDist}、塗りありの最短${dist}）`);
      if (dist !== Infinity && play.maxCommands !== dist) add('paintの手数', `${label}maxCommands=${play.maxCommands} が最短${dist}手と一致しない`);
    }
    // 切替壁を静的な壁のまま（スイッチ無し）にしても届くなら、スイッチが飾り。
    const closeSwitches = Array.isArray(play.switches) && play.switches.length > 0 && play.switches.every((s) => s?.mode === 'close');
    // closeは罠：スイッチを無効化（踏んでも壁が出ない=スイッチ無し）した盤の最短より、実際の最短が長くなければ罠が無意味
    // （最短経路がスイッチを通らない、または出た壁が経路に効かない）。出現後の到達不能は上のゴール到達可能性で検出する。
    if (dist !== null && closeSwitches) {
      const disabled = boardSpec({ ...play, switches: [] });
      const disabledDist = play.groupRepeats ? shortestChips(disabled) : shortestSteps(disabled);
      if (!(dist > disabledDist)) {
        add('スイッチの罠の意味', `${label}スイッチ無効化盤の最短(${disabledDist})より最短(${dist})が長くない（出る壁が経路に効かない）`);
      }
    } else if (dist !== null && Array.isArray(play.switches) && play.switches.length > 0) {
      const targets = play.switches.flatMap((s) => (Array.isArray(s.targets) ? s.targets : []));
      const noSwitch = boardSpec({ ...play, walls: [...(play.walls || []), ...targets], switches: [] });
      const noSwitchDist = play.groupRepeats ? shortestChips(noSwitch) : shortestSteps(noSwitch);
      if (noSwitchDist <= play.maxCommands) {
        add('スイッチの必須性', `${label}スイッチを踏まずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${noSwitchDist}）`);
      }
    }
    // スイッチ→鍵の順序：スイッチが無効（対象は壁のまま）でも鍵に届くなら、順序が強制されていない。
    // かぎが1つの盤だけを対象にする（複数のとき、どのかぎを順序に使うかは未定義のため対象外）。
    if (
      dist !== null &&
      !closeSwitches &&
      Array.isArray(play.switches) &&
      play.switches.length > 0 &&
      Array.isArray(play.keys) &&
      play.keys.length === 1
    ) {
      const targets = play.switches.flatMap((s) => (Array.isArray(s.targets) ? s.targets : []));
      const toKey = boardSpec({
        ...play,
        walls: [...(play.walls || []), ...targets],
        switches: [],
        items: [],
        goal: { x: play.keys[0].x, y: play.keys[0].y },
      });
      const toKeyDist = play.groupRepeats ? shortestChips(toKey) : shortestSteps(toKey);
      if (toKeyDist <= play.maxCommands) {
        add('スイッチ→かぎの順序', `${label}スイッチを踏まずにmaxCommands=${play.maxCommands}以内でかぎに届く（最短${toKeyDist}）`);
      }
    }
    stageDistances.push(dist);

    if (
      Array.isArray(play.initialCommands) &&
      play.initialCommands.every((c) => COMMANDS.includes(c)) &&
      play.start &&
      play.goal
    ) {
      const result = simulate(play.initialCommands, boardSpec(play));
      if (result.reachedGoal && result.remainingItems.length === 0 && result.blockedAt.length === 0) {
        add('なおすの初期状態', `${label}initialCommandsがそのまま実行してもゴールに到達してしまう（直す必要が無い）`);
      }
    }
  }

  for (let i = 1; i < stageDistances.length; i += 1) {
    const prev = stageDistances[i - 1];
    const cur = stageDistances[i];
    if (prev !== null && cur !== null && cur !== Infinity && prev !== Infinity && cur < prev) {
      add(
        '難易度の順序',
        `stepId="${playSteps[i].stepId}" の最短(${cur})がstepId="${playSteps[i - 1].stepId}"の最短(${prev})より短い` +
          '（ステージが進むほど難易度は非減少である必要がある）'
      );
    }
  }

  // 予想向けの検証は最初のplayステージの盤面を基準にする（predictは現行レッスンでは未使用。Issue #104）。
  const referencePlay = playSteps[0];
  const refGrid = referencePlay.grid || {};

  if (tutorialSteps.length === 1) {
    const tutorial = tutorialSteps[0];
    const tutorialIdx = steps.indexOf(tutorial);
    const prevStep = steps[tutorialIdx - 1];
    if (!prevStep || prevStep.kind !== 'intro') {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" の直前がintroでない`);
    }
    const firstPlayIdx = steps.findIndex((s) => s.kind === 'play');
    if (firstPlayIdx !== -1 && tutorialIdx > firstPlayIdx) {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" が最初のplayより後にある`);
    }

    checkBoard(tutorial, add, `stepId="${tutorial.stepId}" の`);

    if ('groupRepeats' in tutorial && typeof tutorial.groupRepeats !== 'boolean') {
      add('groupRepeatsの型', `stepId="${tutorial.stepId}" のgroupRepeats=${JSON.stringify(tutorial.groupRepeats)} はboolean以外`);
    }
    if ('repeatBox' in tutorial && typeof tutorial.repeatBox !== 'boolean') {
      add('repeatBoxの型', `stepId="${tutorial.stepId}" のrepeatBox=${JSON.stringify(tutorial.repeatBox)} はboolean以外`);
    }
    if (tutorial.repeatBox === true && tutorial.groupRepeats === true) {
      add('repeatBoxの併用', `stepId="${tutorial.stepId}" のrepeatBoxとgroupRepeatsが同時にtrue`);
    }
    if ('initialCommands' in tutorial) {
      const initial = tutorial.initialCommands;
      if (!Array.isArray(initial) || initial.some((c) => !COMMANDS.includes(c))) {
        add('命令語彙', `stepId="${tutorial.stepId}" のinitialCommands=${JSON.stringify(initial)} が不正`);
      } else if (
        initial.every((c) => COMMANDS.includes(c)) &&
        tutorial.start &&
        tutorial.goal
      ) {
        const freshResult = simulate(initial, boardSpec(tutorial));
        if (freshResult.reachedGoal && freshResult.remainingItems.length === 0 && freshResult.blockedAt.length === 0) {
          add('なおすの初期状態', `stepId="${tutorial.stepId}" のinitialCommandsがそのまま実行してもゴールに到達してしまう（直す必要が無い）`);
        }
      }
    }

    if (!Array.isArray(tutorial.script) || tutorial.script.length === 0) {
      add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptが空`);
    } else {
      // tap語彙: allowedCommandsの方向・'run'（最後のみ）・'remove'（積んだチップのindexを消す。
      // initialCommands付きの「なおす」れんしゅう用。Issue #98）。
      // box/times/closeは箱のれんしゅう用（repeatBox時のみ。Issue #139）。
      const tapVocab = [...(Array.isArray(tutorial.allowedCommands) ? tutorial.allowedCommands : []), 'run', 'remove', 'box', 'times', 'close'];
      tutorial.script.forEach((entry, i) => {
        if (entry && 'text' in entry) {
          add(
            'チュートリアルのscript',
            `stepId="${tutorial.stepId}" のscript[${i}]にtextがある（文字を読ませない方針のため持たない）`
          );
        }
        if (!entry || !tapVocab.includes(entry.tap)) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}].tap=${JSON.stringify(entry?.tap)} が不正`);
        }
        if (entry?.tap === 'run' && i !== tutorial.script.length - 1) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}]がrunだが最後ではない`);
        }
        if (entry?.tap === 'remove' && !Number.isInteger(entry.index)) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}].index=${JSON.stringify(entry?.index)} が不正`);
        }
      });
      if (tutorial.script.at(-1)?.tap !== 'run') {
        add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptの最後がrunでない`);
      }

      // script（initialCommands→remove/tap（groupRepeats考慮）→run）を逐次再生し、最終的な
      // 命令列がゴール到達＋全item回収になるか確認する。removeのindexが範囲外なら消し過ぎとして
      // NGにする（Issue #98）。
      const initial = Array.isArray(tutorial.initialCommands) ? tutorial.initialCommands : [];
      let chips = initial.every((c) => COMMANDS.includes(c)) ? initial.map((dir) => ({ dir, times: 1 })) : null;
      let replayOk = chips !== null;
      let boxOpen = -1;
      const ngScript = (i, msg) => {
        add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}] ${msg}`);
        replayOk = false;
      };
      if (replayOk) {
        for (const [i, entry] of tutorial.script.entries()) {
          const tap = entry?.tap;
          if (['box', 'times', 'close'].includes(tap) && tutorial.repeatBox !== true) {
            ngScript(i, `のtap=${tap}はrepeatBox無しでは使えない`);
            break;
          }
          if (tap === 'run') {
            if (boxOpen >= 0) ngScript(i, 'のrunの時点で箱が開いたまま');
            break;
          }
          if (tap === 'box') {
            if (boxOpen >= 0) { ngScript(i, 'のboxが箱を開いている間に押される'); break; }
            chips.push({ box: [], times: 2 });
            boxOpen = chips.length - 1;
          } else if (tap === 'times') {
            if (boxOpen < 0) { ngScript(i, 'のtimesが箱の閉じている時に押される'); break; }
            const box = chips[boxOpen];
            box.times = box.times >= 4 ? 2 : box.times + 1;
          } else if (tap === 'close') {
            if (boxOpen < 0) { ngScript(i, 'のcloseが箱の閉じている時に押される'); break; }
            if (chips[boxOpen].box.length === 0) { ngScript(i, 'のcloseで空の箱を閉じている'); break; }
            boxOpen = -1;
          } else if (tap === 'remove') {
            if (boxOpen >= 0) { ngScript(i, 'のremoveが箱を開いている間に使われている'); break; }
            if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= chips.length) {
              add(
                'チュートリアルのscript',
                `stepId="${tutorial.stepId}" のscriptのremove.index=${entry.index} が範囲外（チップ${chips.length}個・消し過ぎ）`
              );
              replayOk = false;
              break;
            }
            chips.splice(entry.index, 1);
          } else if (COMMANDS.includes(tap)) {
            if (boxOpen >= 0) {
              chips[boxOpen].box.push(tap);
              continue;
            }
            const last = chips.at(-1);
            if (tutorial.groupRepeats && last && last.dir === tap) last.times += 1;
            else chips.push({ dir: tap, times: 1 });
          }
          if (!replayOk) break;
        }
      }

      if (replayOk && tutorial.start && tutorial.goal) {
        const result = simulate(chips, boardSpec(tutorial));
        if (!result.reachedGoal || result.remainingItems.length > 0 || result.blockedAt.length > 0) {
          add(
            'チュートリアルの到達可能性',
            `stepId="${tutorial.stepId}" のscriptを実行してもゴール到達＋全item回収にならない、または壁にぶつかる`
          );
        }
      }
    }
  }

  for (const predict of predictSteps) {
    const options = Array.isArray(predict.options) ? predict.options : [];
    const optionCells = Array.isArray(predict.optionCells) ? predict.optionCells : [];
    const optionIds = new Set(options);
    const cellIds = new Set(optionCells.map((c) => c.id));

    if (!optionIds.has(predict.answer)) {
      add('予想の選択肢', `stepId="${predict.stepId}" の answer="${predict.answer}" が options にない`);
    }
    if (optionIds.size !== cellIds.size || [...optionIds].some((id) => !cellIds.has(id))) {
      add('予想の選択肢', `stepId="${predict.stepId}" の optionCells の id が options と不一致`);
    }
    for (const cell of optionCells) {
      if (!inGrid(refGrid, cell)) add('座標範囲', `stepId="${predict.stepId}" optionCells id="${cell.id}" が盤外`);
    }

    const predictCommands = Array.isArray(predict.commands) ? predict.commands : [];
    if (predictCommands.some((c) => !COMMANDS.includes(c))) {
      add('命令語彙', `stepId="${predict.stepId}" の commands=${JSON.stringify(predictCommands)} が不正`);
    } else if (referencePlay?.start) {
      const result = simulate(predictCommands, boardSpec(referencePlay));
      const end = result.path[result.path.length - 1];
      const answerCell = optionCells.find((c) => c.id === predict.answer);
      if (answerCell && (end.x !== answerCell.x || end.y !== answerCell.y)) {
        add(
          '予想の整合',
          `stepId="${predict.stepId}" commandsの終点(${end.x},${end.y})がanswer="${predict.answer}"の座標(${answerCell.x},${answerCell.y})と不一致`
        );
      }
    }
  }

  return errors;
}

// index.jsonはレッスン選択画面（単元マップ）用の一覧ファイル。参照するlessonIdが実在し、
// unitIdがレッスン本体のunitIdと一致していることを確認する（Issue #58）。
function validateIndex(data, lessonById, fileIds = new Set()) {
  const errors = [];
  const add = (rule, detail) => errors.push(`index.json: ${rule}: ${detail}`);

  // 形の検査（Issue #374）。1件でも不合格なら平坦化以降の検査はせずに返す。
  if (!('tracks' in data) && !('units' in data)) {
    add('必須キー', 'tracks も units も無い');
    return errors;
  }
  if ('tracks' in data && 'units' in data) {
    add('tracksとunitsの併用', 'tracks と units（直下）を両方持っている');
    return errors;
  }
  if ('tracks' in data) {
    if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
      add('tracksの型', 'tracks が配列でない、または空配列');
      return errors;
    }
    const seenTrackIds = new Set();
    for (const [i, track] of data.tracks.entries()) {
      if (track === null || typeof track !== 'object' || Array.isArray(track)) {
        add('tracksの型', `tracks[${i}] がオブジェクトでない`);
        continue;
      }
      for (const key of ['trackId', 'title', 'units']) {
        if (!(key in track)) add('必須キー', `tracks[${i}] に ${key} がない`);
      }
      for (const key of ['trackId', 'title']) {
        if (key in track && (typeof track[key] !== 'string' || track[key] === '')) {
          add('tracksの型', `tracks[${i}].${key} が空文字か文字列でない`);
        }
      }
      if (typeof track.trackId === 'string' && track.trackId !== '') {
        if (seenTrackIds.has(track.trackId)) add('trackIdの重複', `trackId="${track.trackId}" が重複している`);
        seenTrackIds.add(track.trackId);
      }
      if ('units' in track) {
        if (!Array.isArray(track.units)) add('tracksの型', `tracks[${i}].units が配列でない`);
        else if (track.units.length === 0) add('unitsが空', `trackId="${track.trackId}" の units が空配列`);
      }
    }
    if (errors.length > 0) return errors;
  } else if (!Array.isArray(data.units)) {
    add('必須キー', 'units が配列でない');
    return errors;
  }

  const seenLessonIds = new Set();
  for (const unit of unitsOf(data)) {
    for (const key of ['unitId', 'title', 'lessonIds']) {
      if (!(key in unit)) add('必須キー', `unitId="${unit.unitId}" に ${key} がない`);
    }
    if (!Array.isArray(unit.lessonIds)) continue;

    // practiceIds＝れんしゅう（スタンプ・旗の対象外。Issue #69）。実在とunitIdの一致だけ確認する。
    // devOnlyIds＝開発者画面だけに出す教材（Issue #216）。同じく実在とunitIdの一致を確認する。
    for (const lessonId of [...unit.lessonIds, ...(unit.practiceIds ?? []), ...(unit.devOnlyIds ?? [])]) {
      if (seenLessonIds.has(lessonId)) {
        add('重複', `lessonId="${lessonId}" が複数のunitから参照されている`);
      }
      seenLessonIds.add(lessonId);

      const lesson = lessonById.get(lessonId);
      if (!lesson) {
        add('参照先の不在', `unitId="${unit.unitId}" が参照する lessonId="${lessonId}" のレッスンJSONが無い`);
      } else if (lesson.unitId !== unit.unitId) {
        add(
          'unitIdの不一致',
          `lessonId="${lessonId}" のunitId="${lesson.unitId}" がindex.json側のunitId="${unit.unitId}"と不一致`
        );
      }
    }
  }

  // longTrialIds＝長尺試作の一覧（Issue #319）。文字列配列・重複なし・lessons/<id>.json が実在すること。
  // 省略時は空。seedPickとの併用はvalidateLessonで見る。
  if ('longTrialIds' in data) {
    const ids = data.longTrialIds;
    if (!Array.isArray(ids)) {
      add('longTrialIds', 'longTrialIds が配列でない');
    } else {
      const seen = new Set();
      for (const id of ids) {
        if (typeof id !== 'string') {
          add('longTrialIds', `要素 ${JSON.stringify(id)} が文字列でない`);
          continue;
        }
        if (seen.has(id)) add('longTrialIds', `"${id}" が重複している`);
        seen.add(id);
        if (!fileIds.has(id)) add('longTrialIds', `"${id}" の lessons/${id}.json が無い`);
      }
    }
  }

  // どの一覧にも載らないレッスンは開発者画面からも辿れないため、掲載漏れをエラーにする（Issue #216）。
  for (const lessonId of lessonById.keys()) {
    if (!seenLessonIds.has(lessonId)) {
      add('掲載漏れ', `lessonId="${lessonId}" がlessonIds・practiceIds・devOnlyIdsのどれにも載っていない`);
    }
  }

  return errors;
}

// レッスン中で使われている漢字の最大配当学年（無ければnull）。失敗にはしない情報表示用（Issue #59）。
function lessonKanjiMaxGrade(data) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  let max = null;
  for (const step of steps) {
    if (typeof step.text !== 'string') continue;
    const g = textKanjiMaxGrade(step.text);
    if (g !== null) max = max === null ? g : Math.max(max, g);
  }
  return max;
}

// index.jsonのlongTrialIds（文字列だけ拾う。形の不正はvalidateIndexが不合格にする）。
async function readLongTrialIds() {
  try {
    const index = JSON.parse(await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8'));
    return Array.isArray(index.longTrialIds) ? index.longTrialIds.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function main() {
  const longTrialIds = await readLongTrialIds();
  const files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const allErrors = [];
  const infoLines = [];
  const lessonById = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(LESSONS_DIR, file), 'utf-8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      allErrors.push(`${file}: JSONパース: ${e.message}`);
      continue;
    }
    if (typeof data.lessonId === 'string') lessonById.set(data.lessonId, data);
    allErrors.push(...validateLesson(file, data, longTrialIds));
    const maxGrade = lessonKanjiMaxGrade(data);
    if (maxGrade !== null) infoLines.push(`INFO ${file}: kanjiMaxGrade=${maxGrade}`);
  }

  const indexRaw = await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8');
  try {
    allErrors.push(...validateIndex(JSON.parse(indexRaw), lessonById, new Set(files.map((f) => path.basename(f, '.json')))));
  } catch (e) {
    allErrors.push(`index.json: JSONパース: ${e.message}`);
  }

  if (allErrors.length > 0) {
    for (const e of allErrors) console.log(e);
    process.exit(1);
  }
  for (const line of infoLines) console.log(line);
  console.log(`OK: ${files.length}件`);
}

// 直接実行されたときだけ全レッスンを検査する（test/stagegen-validate.test.mjs は validateLesson を import して使う）。
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
