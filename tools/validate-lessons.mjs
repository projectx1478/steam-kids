#!/usr/bin/env node
// lessons/*.json のスキーマ検証。検証NGの場合は再生成する。手で通さない（docs/lesson-schema.md）。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, shortestSteps, shortestChips } from '../js/engine-grid.js';
import { plainSegmentsText, plainReading, parseSegments, rubyGrade, textKanjiMaxGrade, KANJI_RE } from '../js/text-render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LESSONS_DIR = path.join(ROOT, 'lessons');

const REQUIRED_KEYS = ['lessonId', 'unitId', 'title', 'type', 'estimatedMinutes', 'steps'];
const KINDS = ['intro', 'predict', 'play', 'tutorial', 'summary'];
const COMMANDS = ['up', 'down', 'left', 'right'];
const MIN_STEPS = 4;
const MAX_STEPS = 7;
const MIN_PLAY = 2;
const MAX_PLAY = 4;
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

  if (!Array.isArray(board.allowedCommands) || board.allowedCommands.some((c) => !COMMANDS.includes(c))) {
    add('命令語彙', `${label}allowedCommands=${JSON.stringify(board.allowedCommands)} が不正`);
  }

  const coordChecks = [
    ['start', board.start],
    ['goal', board.goal],
    ...walls.map((w, i) => [`walls[${i}]`, w]),
    ...items.map((it, i) => [`items[${i}]`, it]),
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

  items.forEach((it, i) => {
    if (wallKeySet.has(`${it.x},${it.y}`)) add('盤面の妥当性', `${label}items[${i}] が壁と重なる`);
  });
  const itemKeySet = new Set();
  items.forEach((it, i) => {
    const k = `${it.x},${it.y}`;
    if (itemKeySet.has(k)) add('盤面の妥当性', `${label}items[${i}] が他のitemsと座標重複`);
    itemKeySet.add(k);
  });
}

// demo.commands/demo.fixFromの各要素は方向文字列、または{dir, times}（cmd-02のまとめ表示。Issue #104）。
function demoEntryDir(entry) {
  return typeof entry === 'string' ? entry : entry?.dir;
}
function demoEntryTimes(entry) {
  return typeof entry === 'string' ? 1 : entry?.times;
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
    } else if (list.some((c) => !Number.isInteger(demoEntryTimes(c)) || demoEntryTimes(c) < 1)) {
      add('命令語彙', `${label} ${key}のtimesが不正`);
      vocabOk = false;
    }
  }
  if (!vocabOk || !demo.start || !demo.goal || !grid.cols || !grid.rows) return;

  const result = simulate(demo.commands, { grid, start: demo.start, goal: demo.goal, walls, items });
  if (!result.reachedGoal || result.remainingItems.length > 0 || result.blockedAt.length > 0) {
    add('デモの到達可能性', `${label} のcommandsを実行してもゴール到達＋全item回収にならない、または壁にぶつかる`);
  }

  if (demo.fixFrom) {
    const fixResult = simulate(demo.fixFrom, { grid, start: demo.start, goal: demo.goal, walls, items });
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

function validateLesson(fileName, data) {
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

  if (data.estimatedMinutes !== 5) {
    add('所要時間', `estimatedMinutes=${data.estimatedMinutes}（5である必要がある）`);
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
    add('ステップ数', `steps.length=${steps.length}（${MIN_STEPS}〜${MAX_STEPS}である必要がある）`);
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

  // playは2〜4個（だんだん難易度を上げる複数ステージ構成。Issue #104）。
  const playSteps = steps.filter((s) => s.kind === 'play');
  if (data.type === 'grid-runtime' && (playSteps.length < MIN_PLAY || playSteps.length > MAX_PLAY)) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（${MIN_PLAY}〜${MAX_PLAY}個である必要がある）`);
  }

  // チュートリアル（tutorial）は各単元1本目のみ・0〜1個（Issue #81）。
  const tutorialSteps = steps.filter((s) => s.kind === 'tutorial');
  if (tutorialSteps.length > 1) {
    add('チュートリアルの個数', `kind="tutorial" が${tutorialSteps.length}個（0〜1個である必要がある）`);
  }

  if (data.type !== 'grid-runtime' || playSteps.length === 0) return errors;

  checkDemo(steps.find((s) => s.kind === 'intro'), playSteps, add);

  // 各ステージの最短距離（groupRepeatsはチップ数）。難易度がステージごとに非減少であることを
  // 後段でまとめて検証する（Issue #104）。
  const stageDistances = [];
  for (const play of playSteps) {
    const grid = play.grid || {};
    const walls = Array.isArray(play.walls) ? play.walls : [];
    const items = Array.isArray(play.items) ? play.items : [];
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

    let dist = null;
    if (play.start && play.goal && grid.cols && grid.rows) {
      const spec = { grid, start: play.start, goal: play.goal, walls, items };
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
    }
    stageDistances.push(dist);

    if (
      Array.isArray(play.initialCommands) &&
      play.initialCommands.every((c) => COMMANDS.includes(c)) &&
      play.start &&
      play.goal
    ) {
      const result = simulate(play.initialCommands, { grid, start: play.start, goal: play.goal, walls, items });
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
  const refWalls = Array.isArray(referencePlay.walls) ? referencePlay.walls : [];

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

    if (!Array.isArray(tutorial.script) || tutorial.script.length === 0) {
      add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptが空`);
    } else {
      const tapVocab = [...(Array.isArray(tutorial.allowedCommands) ? tutorial.allowedCommands : []), 'run'];
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
      });
      if (tutorial.script.at(-1)?.tap !== 'run') {
        add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptの最後がrunでない`);
      }

      const dirs = tutorial.script.filter((e) => e?.tap !== 'run').map((e) => e.tap);
      if (dirs.every((d) => COMMANDS.includes(d)) && tutorial.start && tutorial.goal) {
        const result = simulate(dirs, {
          grid: tutorial.grid,
          start: tutorial.start,
          goal: tutorial.goal,
          walls: Array.isArray(tutorial.walls) ? tutorial.walls : [],
          items: Array.isArray(tutorial.items) ? tutorial.items : [],
        });
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
      const result = simulate(predictCommands, { grid: refGrid, start: referencePlay.start, goal: referencePlay.goal, walls: refWalls });
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
function validateIndex(data, lessonById) {
  const errors = [];
  const add = (rule, detail) => errors.push(`index.json: ${rule}: ${detail}`);

  if (!Array.isArray(data.units)) {
    add('必須キー', 'units が配列でない');
    return errors;
  }

  const seenLessonIds = new Set();
  for (const unit of data.units) {
    for (const key of ['unitId', 'title', 'lessonIds']) {
      if (!(key in unit)) add('必須キー', `unitId="${unit.unitId}" に ${key} がない`);
    }
    if (!Array.isArray(unit.lessonIds)) continue;

    for (const lessonId of unit.lessonIds) {
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

async function main() {
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
    allErrors.push(...validateLesson(file, data));
    const maxGrade = lessonKanjiMaxGrade(data);
    if (maxGrade !== null) infoLines.push(`INFO ${file}: kanjiMaxGrade=${maxGrade}`);
  }

  const indexRaw = await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8');
  try {
    allErrors.push(...validateIndex(JSON.parse(indexRaw), lessonById));
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

main();
