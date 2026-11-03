// predict-slider（うかぶ・しずむ。play.buoyancy）の検証（Issue #288）。
import { buoyancy, solutionPairs, difficulty } from '../../../js/engine-buoyancy.js';
import { MIN_PLAY, MAX_PLAY, isObj } from './common.mjs';

const SPEC_KEYS = ['base', 'mass', 'lift', 'weights', 'balloons'];
const AXIS_KEYS = ['start', 'max'];
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// 軸（weights／balloons）の形が正しいか。NGなら理由の配列を返す。
function axisProblems(name, axis, maxLimit) {
  if (!isObj(axis)) return [`${name} が { start, max } のオブジェクトでない`];
  const problems = [];
  for (const k of Object.keys(axis)) if (!AXIS_KEYS.includes(k)) problems.push(`${name} に未知キー「${k}」がある`);
  if (!inRange(axis.max, 1, maxLimit)) problems.push(`${name}.max=${JSON.stringify(axis.max)} が1〜${maxLimit}の整数でない`);
  else if (!inRange(axis.start, 0, axis.max)) problems.push(`${name}.start=${JSON.stringify(axis.start)} が0〜max(${axis.max})の整数でない`);
  else if (!Number.isInteger(axis.start)) problems.push(`${name}.start が整数でない`);
  return problems;
}

function solutionOk(play, spec, found) {
  const s = play.solution;
  const two = Boolean(spec.weights && spec.balloons);
  let pair = null;
  if (two) {
    if (Array.isArray(s) && s.length === 2 && s.every(Number.isInteger)) pair = { weights: s[0], balloons: s[1] };
  } else if (Number.isInteger(s)) {
    pair = spec.weights ? { weights: s, balloons: 0 } : { weights: 0, balloons: s };
  }
  if (!pair) return 'の形が面の軸の数に合わない（軸1つ＝整数、軸2つ＝[おもり, ふうせん]）';
  if (!found.some((f) => f.weights === pair.weights && f.balloons === pair.balloons)) return 'がつりあう組に含まれない';
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
    const problems = [];
    for (const k of Object.keys(spec)) if (!SPEC_KEYS.includes(k)) problems.push(`未知キー「${k}」がある`);
    if (!inRange(spec.base, 0, 8)) problems.push(`base=${JSON.stringify(spec.base)} が0〜8の整数でない`);
    if ('mass' in spec && !inRange(spec.mass, 1, 3)) problems.push(`mass=${JSON.stringify(spec.mass)} が1〜3の整数でない`);
    if ('lift' in spec && !inRange(spec.lift, 1, 3)) problems.push(`lift=${JSON.stringify(spec.lift)} が1〜3の整数でない`);
    if (!('weights' in spec) && !('balloons' in spec)) problems.push('weights も balloons も無い（どちらかは必須）');
    if ('weights' in spec) problems.push(...axisProblems('weights', spec.weights, 4));
    if ('balloons' in spec) problems.push(...axisProblems('balloons', spec.balloons, 3));
    if (problems.length > 0) {
      for (const p of problems) add('buoyancy', `${label} の${p}`);
      continue;
    }
    const found = solutionPairs(spec);
    if (found.length === 0) add('解の個数', `${label} のつりあう組が0個（1つ以上必要）`);
    if (!('solution' in play)) {
      add('solution', `${label} のsolutionが無い（必須）`);
    } else if (found.length > 0) {
      const ng = solutionOk(play, spec, found);
      if (ng) add('solution', `${label} のsolution=${JSON.stringify(play.solution)} ${ng}`);
    }
    if (buoyancy(spec, spec.weights?.start ?? 0, spec.balloons?.start ?? 0).dir === 0) {
      add('start', `${label} がstartの時点でつりあっている`);
    }
    const d = difficulty(spec);
    if (d < prevDifficulty) add('難易度', `${label} の難易度(${d})が前のステージ(${prevDifficulty})より小さい`);
    prevDifficulty = d;
  }
}

export { validateBuoyancy };
