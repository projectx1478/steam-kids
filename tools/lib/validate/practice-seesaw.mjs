// 「れんしゅう」レッスン（seedPickとgenerator付きplay）とpredict-slider（シーソー）の検証。
// tools/lib/validate/ からの分割（Issue #448）。
import { generateMap, SHAPE_PRESETS } from '../../../js/engine-generate.js';
import { isValidCode, codeToSeed } from '../../../js/seed-code.js';
import { simulate, boardSpec } from '../../../js/engine-grid.js';
import { balance, solutions, solutionPairs, difficulty } from '../../../js/engine-seesaw.js';
import { generateSeesawRun, SEESAW_STAGES, SEESAW_RUN_STAGES } from '../../../js/engine-seesaw-gen.js';
import { KEY_MODES } from '../../../js/gimmicks/keys.js';
import { MIN_PLAY, MAX_PLAY, UNIT_GIMMICKS, isObj } from './common.mjs';

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
// シーソーのれんしゅう（predict-slider＋seedPick。Issue #611）。構成は seedPick, play×5, summary。
// playの generator は { seesawStage: 'A'|'B'|'C' } だけ（seesaw・solution は書かない）。段の並びは A,A,B,B,C。
// 面は全1000番号で generateSeesawRun を回して確かめる（解ちょうど1つ・開始で傾く・段のd範囲内・d非減少・盤の重複なし）。
function validateSeesawPractice(steps, add) {
  const expected = ['seedPick', ...SEESAW_RUN_STAGES.map(() => 'play'), 'summary'];
  const kinds = steps.map((s) => s.kind).join(',');
  if (kinds !== expected.join(',')) {
    add('れんしゅうの構成', `steps=${kinds}（${expected.join(',')}の順である必要がある）`);
    return;
  }
  const plays = steps.filter((s) => s.kind === 'play');
  let ok = true;
  plays.forEach((play, i) => {
    const label = `stepId="${play.stepId}"`;
    const g = play.generator;
    if (!isObj(g) || Object.keys(g).length !== 1 || !('seesawStage' in g)) {
      add('generator', `${label} のgeneratorは { "seesawStage": "A"|"B"|"C" } だけ（他のキーは受け付けない）`);
      ok = false;
    } else if (g.seesawStage !== SEESAW_RUN_STAGES[i]) {
      add('generator', `${label} のseesawStage=${JSON.stringify(g.seesawStage)} が不正（${i + 1}面目は"${SEESAW_RUN_STAGES[i]}"。並びは${SEESAW_RUN_STAGES.join(',')}）`);
      ok = false;
    }
    for (const key of ['seesaw', 'solution']) {
      if (play[key] !== undefined) {
        add('generator', `${label} に${key}は書けない（面は番号から生成される）`);
        ok = false;
      }
    }
  });
  if (!ok) return;
  const stages = plays.map((p) => p.generator.seesawStage);
  const boardKey = (s) => JSON.stringify([s.notches, s.left.map((w) => [w.robots, w.pos]), s.mover.robots]);
  for (let n = 0; n < 1000; n += 1) {
    const code = String(n).padStart(3, '0');
    const run = generateSeesawRun(stages, code);
    let prevD = 0;
    run.forEach((spec, i) => {
      const label = `番号${code}の${i + 1}面目`;
      const cond = SEESAW_STAGES[stages[i]];
      const found = solutions(spec);
      if (found.length !== 1) add('解の個数', `${label}の解が${found.length}個（ちょうど1つ必要）`);
      if (balance(spec, spec.mover.start).tilt === 0) add('start', `${label}がstartの時点でつりあっている`);
      const d = difficulty(spec);
      if (d < cond.d[0] || d > cond.d[1]) add('難易度', `${label}のd=${d}が段${stages[i]}の範囲外`);
      if (d < prevD) add('難易度', `${label}のd=${d}が前の面(${prevD})より小さい`);
      prevD = d;
    });
    if (new Set(run.map(boardKey)).size !== run.length) add('盤の重複', `番号${code}の面に同じ盤がある`);
  }
}

function validatePractice(steps, add, type) {
  if (type === 'predict-slider') {
    validateSeesawPractice(steps, add);
    return;
  }
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
  // gimmickMix＝種類名（items・ice・keys）→追加の生成指定（空でないオブジェクト）。空・未知の種類・配列は不合格（Issue #266）。
  const mix = play.generator.gimmickMix;
  if (mix !== undefined) {
    // keyMode（Issue #391）は種類名ではなく、keys 用の指定。値は remote／carry、gimmickMix.keys が要る。
    const hasKeyMode = isObj(mix) && 'keyMode' in mix;
    if (hasKeyMode) {
      if (!KEY_MODES.includes(mix.keyMode)) add('generator.gimmickMix', `keyMode=${JSON.stringify(mix.keyMode)} が不正（${KEY_MODES.join('・')}のどちらか）`);
      if (!('keys' in mix)) add('generator.gimmickMix', 'keyMode は gimmickMix.keys があるときだけ指定できる');
    }
    const kinds = isObj(mix) ? Object.keys(mix).filter((k) => k !== 'keyMode') : [];
    if (kinds.length === 0) {
      add('generator.gimmickMix', 'gimmickMixが空、またはオブジェクトでない');
      return;
    }
    const bad = kinds.filter((k) => !UNIT_GIMMICKS.includes(k) || !isObj(mix[k]) || Object.keys(mix[k]).length === 0);
    if (bad.length > 0) {
      add('generator.gimmickMix', `${bad.join('・')} が不正（キーはitems・ice・keysのいずれかで、値は空でないオブジェクト）`);
      return;
    }
  }
  for (let n = 0; n < PRACTICE_SAMPLE_SEEDS; n += 1) {
    const code = String(n).padStart(3, '0');
    if (!isValidCode(code)) continue;
    const map = generateMap(play.generator, codeToSeed(code));
    if (map.fallback) add('generatorの生成失敗', `たね${code}で制約を満たす盤面が作れず予備盤面になる`);
    if (map.solution.length > map.maxCommands) add('generatorの手数', `たね${code}でsolution(${map.solution.length}手)がmaxCommands=${map.maxCommands}を超える`);
    const result = simulate(map.solution, boardSpec(map));
    if (!result.reachedGoal) add('generatorのsolution', `たね${code}でsolutionがゴールに届かない`);
  }
}

// predict-slider（シーソー）：playは2〜4個、座標が範囲内、solutionでつりあいstartでは傾く、
// 解が1つ以上、難易度（左のおもさ合計）が非減少（Issue #150）。
// 面の種類で solution の形が変わる（Issue #612）：位置だけ＝整数（位置）／重さだけ（fixedPos あり）＝整数（重さ）／両方＝[pos, robots]。
function solutionPair(play, spec) {
  const { fixedPos, maxRobots } = spec.mover;
  const s = play.solution;
  if (fixedPos !== undefined) return Number.isInteger(s) ? { pos: fixedPos, robots: s } : null;
  if (maxRobots !== undefined) return Array.isArray(s) && s.length === 2 && s.every(Number.isInteger) ? { pos: s[0], robots: s[1] } : null;
  return Number.isInteger(s) ? { pos: s, robots: spec.mover.robots } : null;
}
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
    const { maxRobots, fixedPos } = ok ? spec.mover : {};
    const newOk =
      ok &&
      (maxRobots === undefined || (Number.isInteger(maxRobots) && maxRobots >= 2 && maxRobots <= 3 && spec.mover.robots <= maxRobots)) &&
      (fixedPos === undefined || (maxRobots !== undefined && isInt(fixedPos) && fixedPos <= spec.notches && fixedPos === spec.mover.start));
    if (!newOk) {
      add('seesaw', `${label} のseesaw（notches・left・mover）が不正（robots・pos・startは1〜notchesの整数、maxRobotsは2〜3でrobots以上、fixedPosはmaxRobotsがあるときだけでstartと同じ）`);
      continue;
    }
    const found = solutionPairs(spec);
    if (found.length === 0) add('解の個数', `${label} のつりあう組が0個（1つ以上必要）`);
    const given = solutionPair(play, spec);
    if (!given || !found.some((f) => f.pos === given.pos && f.robots === given.robots)) {
      add('solution', `${label} のsolution=${JSON.stringify(play.solution)} がつりあう組と一致しない（面の種類に合う形か）`);
    }
    if (balance(spec, spec.mover.start).tilt === 0) add('start', `${label} がstartの時点でつりあっている`);
    const d = difficulty(spec);
    if (d < prevDifficulty) add('難易度', `${label} の左のおもさ合計(${d})が前のステージ(${prevDifficulty})より小さい`);
    prevDifficulty = d;
  }
}

export { validatePractice, validateSeesaw };
