// 「れんしゅう」レッスン（seedPickとgenerator付きplay）とpredict-slider（シーソー）の検証。
// tools/lib/validate/ からの分割（Issue #448）。
import { generateMap, SHAPE_PRESETS } from '../../../js/engine-generate.js';
import { isValidCode, codeToSeed } from '../../../js/seed-code.js';
import { simulate, boardSpec } from '../../../js/engine-grid.js';
import { balance, solutions, solutionPairs, solutionSets, allowedPositions, moversOf, MAX_MULTI_SOLUTIONS, difficulty } from '../../../js/engine-seesaw.js';
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
// シーソーのれんしゅう（predict-slider＋seedPick。Issue #611）。構成は seedPick, play×8, summary（SEESAW_RUN_STAGES から導く）。
// playの generator は { seesawStage: 'A'|'B'|'R'|'X' } だけ（seesaw・solution は書かない）。段の並びは A,A,B,R,R,X,X,X（Issue #676）。
// 面は全1000番号で generateSeesawRun を回して確かめる（解の個数・開始で傾く・段のd範囲内・d非減少・盤の重複なし）。
// 解の個数：位置だけの段（A・B）は solutions が1〜MAX_MULTI_SOLUTIONS件、人数が動く段（R・X）は solutionPairs がちょうど1件。
export function seesawFaceProblems(stage, spec) {
  const cond = SEESAW_STAGES[stage];
  const problems = [];
  if (cond.kind === 'pos') {
    const n = solutions(spec).length;
    if (n < 1 || n > MAX_MULTI_SOLUTIONS) problems.push(['解の個数', `の解が${n}個（1〜${MAX_MULTI_SOLUTIONS}個である必要がある）`]);
  } else {
    const n = solutionPairs(spec).length;
    if (n !== 1) problems.push(['解の個数', `の解が${n}個（ちょうど1つ必要）`]);
  }
  if (balance(spec, spec.mover.start).tilt === 0) problems.push(['start', 'がstartの時点でつりあっている']);
  const d = difficulty(spec);
  if (d < cond.d[0] || d > cond.d[1]) problems.push(['難易度', `のd=${d}が段${stage}の範囲外`]);
  return problems;
}

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
      add('generator', `${label} のgeneratorは { "seesawStage": "A"|"B"|"R"|"X" } だけ（他のキーは受け付けない）`);
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
  const boardKey = (s) => JSON.stringify([s.notches, s.left.map((w) => [w.robots, w.pos]), s.mover.robots, s.mover.maxRobots ?? null, s.mover.fixedPos ?? null]);
  for (let n = 0; n < 1000; n += 1) {
    const code = String(n).padStart(3, '0');
    const run = generateSeesawRun(stages, code);
    let prevD = 0;
    run.forEach((spec, i) => {
      const label = `番号${code}の${i + 1}面目`;
      for (const [rule, msg] of seesawFaceProblems(stages[i], spec)) add(rule, `${label}${msg}`);
      const d = difficulty(spec);
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
// 未知キーは不合格（綴り違いを見逃さない。Issue #689）。
const SEESAW_KEYS = ['notches', 'left', 'right', 'mover'];
const MOVER_KEYS = ['robots', 'start', 'maxRobots', 'fixedPos', 'side'];
// moverの位置（start・fixedPos）：整数で0でない。sideが省略か"right"なら1〜notches、"both"なら−notches〜−1と1〜notches。
const isPos = (v, spec, mover = spec.mover) => Number.isInteger(v) && v !== 0 && Math.abs(v) <= spec.notches && (v > 0 || mover.side === 'both');
// 2組の面（mover が配列。Issue #689）の要素に書けるキー（maxRobots・fixedPos は書けない）。
const MULTI_MOVER_KEYS = ['robots', 'start', 'side'];
// moverのstartが固定ロボットの占有位置（rightは+pos、leftは−pos）か。
const startTaken = (spec, mover = spec.mover) => (spec.right ?? []).some((w) => w.pos === mover.start) || spec.left.some((w) => -w.pos === mover.start);
// seesaw.right（任意。leftと同形。空配列不可、同じ位置に2山は不可）。
function rightOk(spec) {
  if (spec.right === undefined) return true;
  const isI = (v) => Number.isInteger(v) && v >= 1;
  return (
    Array.isArray(spec.right) &&
    spec.right.length > 0 &&
    spec.right.every((w) => isI(w.robots) && w.robots <= 6 && isI(w.pos) && w.pos <= spec.notches) &&
    new Set(spec.right.map((w) => w.pos)).size === spec.right.length
  );
}
// mover（単体オブジェクト、または2要素の配列＝2組。Issue #689）の形。start は固定ロボットの位置と別、2組は体数も start も違う。
function moverOk(spec) {
  const multi = Array.isArray(spec.mover);
  const list = multi ? spec.mover : [spec.mover];
  const isInt = (v) => Number.isInteger(v) && v >= 1;
  if (multi && list.length !== 2) return false;
  const each = list.every(
    (m) =>
      isObj(m) &&
      isInt(m.robots) &&
      (m.side === undefined || m.side === 'right' || m.side === 'both') &&
      isPos(m.start, spec, m) &&
      Object.keys(m).every((k) => (multi ? MULTI_MOVER_KEYS : MOVER_KEYS).includes(k)) &&
      !startTaken(spec, m)
  );
  return each && (!multi || (list[0].robots !== list[1].robots && list[0].start !== list[1].start));
}
// 2組の面の検査：解（[pos1, pos2]）が1〜MAX_MULTI_SOLUTIONS件、solution が解の1つ、各組が必須（どちらか1組だけでは解にならない）。
function validateSeesawMulti(play, spec, label, add) {
  const sets = solutionSets(spec);
  if (sets.length < 1 || sets.length > MAX_MULTI_SOLUTIONS) add('解の個数', `${label} の2組の解が${sets.length}個（1〜${MAX_MULTI_SOLUTIONS}個である必要がある）`);
  const s = play.solution;
  if (!Array.isArray(s) || s.length !== 2 || !sets.some((f) => f[0] === s[0] && f[1] === s[1])) {
    add('solution', `${label} のsolution=${JSON.stringify(s)} がつりあう組 [1組目の位置, 2組目の位置] と一致しない`);
  }
  const movers = moversOf(spec);
  movers.forEach((m, i) => {
    const alone = allowedPositions(spec, i).filter((pos) => balance(spec, [{ pos, robots: m.robots }, { pos: 1, robots: 0 }]).tilt === 0);
    if (alone.length > 0) add('必須性', `${label} は${i + 1}組目だけでもつりあう（位置${alone.join('・')}）。両方の組が要る面にする`);
  });
  if (balance(spec, movers.map((m) => ({ pos: m.start, robots: m.robots }))).tilt === 0) add('start', `${label} がstartの時点でつりあっている`);
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
      spec.left.every((w) => isInt(w.robots) && w.robots <= 6 && isInt(w.pos) && w.pos <= spec.notches) &&
      Object.keys(spec).every((k) => SEESAW_KEYS.includes(k)) &&
      moverOk(spec) &&
      rightOk(spec);
    const multi = ok && Array.isArray(spec.mover);
    const { maxRobots, fixedPos } = ok && !multi ? spec.mover : {};
    const newOk =
      ok &&
      (maxRobots === undefined || (Number.isInteger(maxRobots) && maxRobots >= 2 && maxRobots <= 6 && spec.mover.robots <= maxRobots)) &&
      (fixedPos === undefined || (maxRobots !== undefined && isPos(fixedPos, spec) && fixedPos === spec.mover.start));
    if (!newOk) {
      add('seesaw', `${label} のseesaw（notches・left・right・mover）が不正（moverは単体か2要素の配列〔2組は体数もstartも違い、キーはrobots・start・sideだけ〕、robots・posは1〜notchesの整数、startは1〜notches（sideが"both"なら負も可。0は不可）、sideは"right"か"both"、left・rightのrobotsは1〜6、rightは空不可で同じ位置に2山不可、startは固定ロボットの位置と別、未知のキーは不可、maxRobotsは2〜6でrobots以上、fixedPosはmaxRobotsがあるときだけでstartと同じ）`);
      continue;
    }
    if (multi) {
      validateSeesawMulti(play, spec, label, add);
      const d = difficulty(spec);
      if (d < prevDifficulty) add('難易度', `${label} の|左−右|のおもさ合計(${d})が前のステージ(${prevDifficulty})より小さい`);
      prevDifficulty = d;
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
    if (d < prevDifficulty) add('難易度', `${label} の|左−右|のおもさ合計(${d})が前のステージ(${prevDifficulty})より小さい`);
    prevDifficulty = d;
  }
}

export { validatePractice, validateSeesaw };
