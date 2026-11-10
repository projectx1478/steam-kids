// predict-slider（うかぶ・しずむ。play.buoyancy）の検証（Issue #288・#710）。
import { enumerate, difficulty, toolOf } from '../../../js/engine-buoyancy.js';
import { MIN_PLAY, MAX_PLAY, isObj } from './common.mjs';

const SPEC_KEYS = ['bodies', 'tools', 'dots', 'find'];
const OLD_KEYS = ['base', 'mass', 'lift', 'weights', 'balloons'];
const BODY_KEYS = ['ring', 'box'];
const BOX_KEYS = ['v', 'hidden'];
const MIN_RATIO = 5.5;
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// 1体の形が正しいか。NGなら理由の配列を返す。
function bodyProblems(body) {
  if (!isObj(body)) return ['bodies の要素がオブジェクトでない'];
  const problems = [];
  for (const k of Object.keys(body)) if (!BODY_KEYS.includes(k)) problems.push(`bodies に未知キー「${k}」がある`);
  if (![2, 4, 6].includes(body.ring)) problems.push(`ring=${JSON.stringify(body.ring)} が2・4・6のどれかでない`);
  if ('box' in body) {
    const box = body.box;
    if (!isObj(box)) problems.push('box がオブジェクトでない');
    else {
      for (const k of Object.keys(box)) if (!BOX_KEYS.includes(k)) problems.push(`box に未知キー「${k}」がある`);
      if (!inRange(box.v, 1, 6)) problems.push(`box.v=${JSON.stringify(box.v)} が1〜6の整数でない`);
      if ('hidden' in box && box.hidden !== true) problems.push('box.hidden は true だけ書ける');
    }
  }
  return problems;
}

function specProblems(spec) {
  const problems = [];
  for (const k of Object.keys(spec)) {
    if (OLD_KEYS.includes(k)) problems.push(`旧形式のキー「${k}」は書けない（bodies と tools を使う）`);
    else if (!SPEC_KEYS.includes(k)) problems.push(`未知キー「${k}」がある`);
  }
  if (!Array.isArray(spec.bodies) || spec.bodies.length !== 1) problems.push('bodies が長さ1の配列でない');
  else problems.push(...bodyProblems(spec.bodies[0]));
  const tools = spec.tools;
  if (!Array.isArray(tools) || tools.length < 2 || tools.length > 4) problems.push('tools が長さ2〜4の配列でない');
  else {
    for (const t of tools) if (!toolOf(t)) problems.push(`tools の「${JSON.stringify(t)}」が w1〜w3・b1〜b3 のどれでもない`);
    if (new Set(tools).size !== tools.length) problems.push('tools に重複がある');
  }
  if ('dots' in spec && typeof spec.dots !== 'boolean') problems.push('dots が真偽値でない');
  if ('find' in spec && spec.find !== 1 && spec.find !== 2) problems.push(`find=${JSON.stringify(spec.find)} が1か2でない`);
  return problems;
}

// solution が道具 id の配列で、つりあう組のどれかと一致するか（順不同）。NGなら理由を返す。
function solutionNg(solution, spec, solutions) {
  if (spec.find === 2) {
    // find:2 は道具 id の配列の配列。つりあう組と過不足なく一致する（順不同）。
    if (!Array.isArray(solution) || !solution.every(Array.isArray)) return 'が道具 id の配列の配列でない（find:2）';
    const keyOf = (a) => [...a].sort().join(',');
    const want = solutions.map(keyOf).sort().join('|');
    const got = solution.map(keyOf).sort().join('|');
    return want === got ? null : 'がつりあう組と一致しない（find:2）';
  }
  if (!Array.isArray(solution) || !solution.every((t) => typeof t === 'string')) return 'が道具 id の配列でない';
  if (!solution.every((t) => spec.tools.includes(t)) || new Set(solution).size !== solution.length) return 'が tools の道具の重複しない組でない';
  const key = [...solution].sort().join(',');
  if (!solutions.some((s) => [...s].sort().join(',') === key)) return 'がつりあう組に含まれない';
  return null;
}

function validateBuoyancy(playSteps, add, maxPlay = MAX_PLAY) {
  if (playSteps.length < MIN_PLAY || playSteps.length > maxPlay) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（${MIN_PLAY}〜${maxPlay}個である必要がある）`);
  }
  let prevDifficulty = 0;
  for (const play of playSteps) {
    const label = `stepId="${play.stepId}"`;
    const spec = play.buoyancy;
    if (!isObj(spec)) {
      add('buoyancy', `${label} のbuoyancyがオブジェクトでない`);
      continue;
    }
    const problems = specProblems(spec);
    if (problems.length > 0) {
      for (const p of problems) add('buoyancy', `${label} の${p}`);
      continue;
    }
    const { N, solutions } = enumerate(spec);
    const S = solutions.length;
    const find = spec.find ?? 1;
    if (S !== find) add('解の個数', `${label} のつりあう組が${S}個（${find}個である必要がある）`);
    if (!('solution' in play)) {
      add('solution', `${label} のsolutionが無い（必須）`);
    } else if (S > 0) {
      const ng = solutionNg(play.solution, spec, solutions);
      if (ng) add('solution', `${label} のsolution=${JSON.stringify(play.solution)} ${ng}`);
    }
    if (solutions.some((s) => s.length === 0)) add('start', `${label} が何も付けない時点でつりあっている`);
    if (spec.dots !== true && (N + 1) / (S + 1) < MIN_RATIO) {
      add('当てずっぽう', `${label} の期待試行 (N+1)/(S+1)=${((N + 1) / (S + 1)).toFixed(1)} が${MIN_RATIO}未満（点なしの面は当てずっぽうで解ける）`);
    }
    const d = difficulty(spec);
    if (d < prevDifficulty) add('難易度', `${label} の難易度(${d})が前のステージ(${prevDifficulty})より小さい`);
    prevDifficulty = d;
  }
}

export { validateBuoyancy };
