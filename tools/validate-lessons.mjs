#!/usr/bin/env node
// lessons/*.json のスキーマ検証。検証NGの場合は再生成する。手で通さない（docs/lesson-schema.md）。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../js/engine-grid.js';
import { plainSegmentsText, plainReading, parseSegments, rubyGrade, textKanjiMaxGrade, KANJI_RE } from '../js/text-render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LESSONS_DIR = path.join(ROOT, 'lessons');

const REQUIRED_KEYS = ['lessonId', 'unitId', 'title', 'type', 'estimatedMinutes', 'steps'];
const KINDS = ['intro', 'predict', 'play', 'tutorial', 'summary'];
const COMMANDS = ['up', 'down', 'left', 'right'];
const MIN_STEPS = 4;
const MAX_STEPS = 7;
// docs/authoring-rules.md「禁止事項」で確定した否定語リスト。
const FORBIDDEN_WORDS = ['ちがう', 'まちがい', 'ざんねん'];

// simulateを1手ずつ呼ぶことで、探索の移動ロジックをengine-grid.jsと二重に持たない。
function stepOnce(pos, cmd, spec) {
  const result = simulate([cmd], { ...spec, start: pos });
  return result.blockedAt.length > 0 ? null : result.path[result.path.length - 1];
}

// itemsのうちposで回収できるものをビットマスクにして返す（Issue #60）。
function itemMaskAt(pos, items) {
  let mask = 0;
  items.forEach((it, idx) => {
    if (it.x === pos.x && it.y === pos.y) mask |= 1 << idx;
  });
  return mask;
}

// BFSでstart→goal（かつitems全回収）の最短手数を求める（到達不能ならInfinity）。
// items未指定時はfullMask=0・startMask=0となり従来通りの挙動になる。
function shortestSteps(spec) {
  const items = spec.items ?? [];
  const fullMask = (1 << items.length) - 1;
  const key = (p, mask) => `${p.x},${p.y}|${mask}`;
  const startMask = itemMaskAt(spec.start, items);
  const queue = [{ pos: spec.start, mask: startMask, dist: 0 }];
  const seen = new Set([key(spec.start, startMask)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y && cur.mask === fullMask) return cur.dist;
    for (const cmd of COMMANDS) {
      const next = stepOnce(cur.pos, cmd, spec);
      if (!next) continue;
      const nextMask = cur.mask | itemMaskAt(next, items);
      const k = key(next, nextMask);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: next, mask: nextMask, dist: cur.dist + 1 });
    }
  }
  return Infinity;
}

// groupRepeats:true向け。同方向を連続させれば1チップにまとめられる前提で、
// start→goal（かつitems全回収）に必要な最小チップ数を0-1 BFSで求める（到達不能ならInfinity）。
// 同方向への移動はコスト0（直前と同じチップに乗る）、方向転換はコスト1（新しいチップ）。
function shortestChips(spec) {
  const items = spec.items ?? [];
  const fullMask = (1 << items.length) - 1;
  const key = (p, dir, mask) => `${p.x},${p.y}|${dir ?? '-'}|${mask}`;
  const startMask = itemMaskAt(spec.start, items);
  const dist = new Map([[key(spec.start, null, startMask), 0]]);
  const deque = [{ pos: spec.start, dir: null, mask: startMask }];
  while (deque.length > 0) {
    const cur = deque.shift();
    const curDist = dist.get(key(cur.pos, cur.dir, cur.mask));
    for (const cmd of COMMANDS) {
      const next = stepOnce(cur.pos, cmd, spec);
      if (!next) continue;
      const nextMask = cur.mask | itemMaskAt(next, items);
      const cost = cmd === cur.dir ? 0 : 1;
      const nextDist = curDist + cost;
      const nk = key(next, cmd, nextMask);
      if (dist.has(nk) && dist.get(nk) <= nextDist) continue;
      dist.set(nk, nextDist);
      if (cost === 0) deque.unshift({ pos: next, dir: cmd, mask: nextMask });
      else deque.push({ pos: next, dir: cmd, mask: nextMask });
    }
  }
  let best = Infinity;
  for (const [k, v] of dist) {
    const [xy, , mask] = k.split('|');
    const [x, y] = xy.split(',').map(Number);
    if (x === spec.goal.x && y === spec.goal.y && Number(mask) === fullMask) best = Math.min(best, v);
  }
  return best;
}

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

  const predictSteps = steps.filter((s) => s.kind === 'predict');
  if (predictSteps.length === 0) add('予想の必須', 'kind="predict" のステップがない');

  const playSteps = steps.filter((s) => s.kind === 'play');
  if (data.type === 'grid-runtime' && playSteps.length !== 1) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（ちょうど1個である必要がある）`);
  }

  // チュートリアル（tutorial）は各単元1本目のみ・0〜1個（Issue #81）。
  const tutorialSteps = steps.filter((s) => s.kind === 'tutorial');
  if (tutorialSteps.length > 1) {
    add('チュートリアルの個数', `kind="tutorial" が${tutorialSteps.length}個（0〜1個である必要がある）`);
  }

  if (data.type !== 'grid-runtime' || playSteps.length !== 1) return errors;

  const play = playSteps[0];
  const grid = play.grid || {};
  const walls = Array.isArray(play.walls) ? play.walls : [];
  const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const items = Array.isArray(play.items) ? play.items : [];

  checkBoard(play, add, '');

  if ('groupRepeats' in play && typeof play.groupRepeats !== 'boolean') {
    add('groupRepeatsの型', `play.groupRepeats=${JSON.stringify(play.groupRepeats)} はboolean以外`);
  }

  if ('initialCommands' in play) {
    const initial = play.initialCommands;
    if (!Array.isArray(initial) || initial.some((c) => !COMMANDS.includes(c))) {
      add('命令語彙', `play.initialCommands=${JSON.stringify(initial)} が不正`);
    } else if (typeof play.maxCommands === 'number' && initial.length > play.maxCommands) {
      add('なおすの初期状態', `initialCommands.length=${initial.length} がmaxCommands=${play.maxCommands}を超える`);
    }
  }

  if (play.start && play.goal && grid.cols && grid.rows) {
    const spec = { grid, start: play.start, goal: play.goal, walls, items };
    // groupRepeatsありのレッスンは、同方向連続をまとめた最小チップ数で判定する
    // （まとめないと手数制限に収まらないレッスンを正しく通すため）。
    const dist = play.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
    if (dist > play.maxCommands) {
      add(
        'ゴール到達可能性',
        `最短${dist === Infinity ? '到達不能' : dist + (play.groupRepeats ? 'チップ' : '手')}` +
          `（maxCommands=${play.maxCommands}以内で到達できない）`
      );
    }
  }

  if (
    Array.isArray(play.initialCommands) &&
    play.initialCommands.every((c) => COMMANDS.includes(c)) &&
    play.start &&
    play.goal
  ) {
    const result = simulate(play.initialCommands, { grid, start: play.start, goal: play.goal, walls, items });
    if (result.reachedGoal && result.remainingItems.length === 0) {
      add('なおすの初期状態', 'initialCommandsがそのまま実行してもゴールに到達してしまう（直す必要が無い）');
    }
  }

  if (tutorialSteps.length === 1) {
    const tutorial = tutorialSteps[0];
    const tutorialIdx = steps.indexOf(tutorial);
    const prevStep = steps[tutorialIdx - 1];
    if (!prevStep || prevStep.kind !== 'intro') {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" の直前がintroでない`);
    }
    const firstPredictIdx = steps.findIndex((s) => s.kind === 'predict');
    if (firstPredictIdx !== -1 && tutorialIdx > firstPredictIdx) {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" がpredictより後にある`);
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
      if (!inGrid(grid, cell)) add('座標範囲', `stepId="${predict.stepId}" optionCells id="${cell.id}" が盤外`);
    }

    const predictCommands = Array.isArray(predict.commands) ? predict.commands : [];
    if (predictCommands.some((c) => !COMMANDS.includes(c))) {
      add('命令語彙', `stepId="${predict.stepId}" の commands=${JSON.stringify(predictCommands)} が不正`);
    } else if (play.start) {
      const result = simulate(predictCommands, { grid, start: play.start, goal: play.goal, walls });
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
