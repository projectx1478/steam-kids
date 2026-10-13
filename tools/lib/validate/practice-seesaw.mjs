// 「れんしゅう」レッスン（seedPickとgenerator付きplay）とpredict-slider（シーソー）の検証。
// tools/lib/validate/ からの分割（Issue #448）。
import { generateMap, SHAPE_PRESETS } from '../../../js/engine-generate.js';
import { isValidCode, codeToSeed } from '../../../js/seed-code.js';
import { simulate, boardSpec } from '../../../js/engine-grid.js';
import { balance, solutions, difficulty } from '../../../js/engine-seesaw.js';
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

export { validatePractice, validateSeesaw };
