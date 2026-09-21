#!/usr/bin/env node
// lessons/*.json のスキーマ検証。検証NGの場合は再生成する。手で通さない（docs/lesson-schema.md）。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../js/engine-grid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LESSONS_DIR = path.join(ROOT, 'lessons');

const REQUIRED_KEYS = ['lessonId', 'unitId', 'title', 'type', 'estimatedMinutes', 'steps'];
const KINDS = ['intro', 'predict', 'play', 'summary'];
const COMMANDS = ['up', 'down', 'left', 'right'];
const KANJI_RE = /[㐀-䶿一-鿿]/;
const MIN_STEPS = 4;
const MAX_STEPS = 7;

// simulateを1手ずつ呼ぶことで、探索の移動ロジックをengine-grid.jsと二重に持たない。
function stepOnce(pos, cmd, spec) {
  const result = simulate([cmd], { ...spec, start: pos });
  return result.blockedAt.length > 0 ? null : result.path[result.path.length - 1];
}

// BFSでstart→goalの最短手数を求める（到達不能ならInfinity）。
function shortestSteps(spec) {
  const key = (p) => `${p.x},${p.y}`;
  const queue = [{ pos: spec.start, dist: 0 }];
  const seen = new Set([key(spec.start)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.pos.x === spec.goal.x && cur.pos.y === spec.goal.y) return cur.dist;
    for (const cmd of COMMANDS) {
      const next = stepOnce(cur.pos, cmd, spec);
      if (!next) continue;
      const k = key(next);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: next, dist: cur.dist + 1 });
    }
  }
  return Infinity;
}

function inGrid(grid, p) {
  return p.x >= 0 && p.x < grid.cols && p.y >= 0 && p.y < grid.rows;
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
      if ([...step.text].length > 20) add('文字数', `stepId="${step.stepId}" の text が20字超`);
      if (KANJI_RE.test(step.text)) add('漢字ゼロ', `stepId="${step.stepId}" の text に漢字がある`);
    }
  }

  const predictSteps = steps.filter((s) => s.kind === 'predict');
  if (predictSteps.length === 0) add('予想の必須', 'kind="predict" のステップがない');

  const playSteps = steps.filter((s) => s.kind === 'play');
  if (data.type === 'grid-runtime' && playSteps.length !== 1) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（ちょうど1個である必要がある）`);
  }

  if (data.type !== 'grid-runtime' || playSteps.length !== 1) return errors;

  const play = playSteps[0];
  const grid = play.grid || {};
  const walls = Array.isArray(play.walls) ? play.walls : [];
  const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));

  if (!Array.isArray(play.allowedCommands) || play.allowedCommands.some((c) => !COMMANDS.includes(c))) {
    add('命令語彙', `play.allowedCommands=${JSON.stringify(play.allowedCommands)} が不正`);
  }

  if ('groupRepeats' in play && typeof play.groupRepeats !== 'boolean') {
    add('groupRepeatsの型', `play.groupRepeats=${JSON.stringify(play.groupRepeats)} はboolean以外`);
  }

  const coordChecks = [
    ['start', play.start],
    ['goal', play.goal],
    ...walls.map((w, i) => [`walls[${i}]`, w]),
  ];
  for (const [label, p] of coordChecks) {
    if (!p || !inGrid(grid, p)) add('座標範囲', `${label}=${JSON.stringify(p)} が盤外`);
  }

  if (play.start && play.goal) {
    if (play.start.x === play.goal.x && play.start.y === play.goal.y) {
      add('盤面の妥当性', 'start と goal が同一');
    }
    if (wallKeySet.has(`${play.start.x},${play.start.y}`)) add('盤面の妥当性', 'start が壁と重なる');
    if (wallKeySet.has(`${play.goal.x},${play.goal.y}`)) add('盤面の妥当性', 'goal が壁と重なる');
  }

  if (play.start && play.goal && grid.cols && grid.rows) {
    const dist = shortestSteps({ grid, start: play.start, goal: play.goal, walls });
    if (dist > play.maxCommands) {
      add(
        'ゴール到達可能性',
        `最短${dist === Infinity ? '到達不能' : dist + '手'}（maxCommands=${play.maxCommands}以内で到達できない）`
      );
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

async function main() {
  const files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith('.json'));
  const allErrors = [];
  for (const file of files) {
    const raw = await readFile(path.join(LESSONS_DIR, file), 'utf-8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      allErrors.push(`${file}: JSONパース: ${e.message}`);
      continue;
    }
    allErrors.push(...validateLesson(file, data));
  }

  if (allErrors.length > 0) {
    for (const e of allErrors) console.log(e);
    process.exit(1);
  }
  console.log(`OK: ${files.length}件`);
}

main();
