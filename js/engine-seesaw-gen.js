// シーソー（predict-slider）の「れんしゅう」用の面生成（Issue #611）。DOMに触れない純関数。
// 位置だけ動く面を全数え上げ→決まった順に並べ、番号（'000'〜'999'）から段ごとに選ぶ。同じ番号→同じ5面。
// engine-seesaw.js の solutions・difficulty を使う（engine-seesaw.js は変えない）。
import { solutions, difficulty } from './engine-seesaw.js';
import { mulberry32 } from './engine-generate.js';
import { codeToSeed } from './seed-code.js';

// 生成規則の版（シーソー専用）。規則を変えたら上げる。同じ番号の面が変わることは許す（Issue #611の承認事項）。
// seed-code.js の SEED_VER は共用のまま触らない（上げると grid の番号の盤も変わるため）。
export const SEESAW_GEN_VER = 1;

// 段の条件。left＝左の組の数、mover＝右（動かすほう）の体数、d＝左のおもさ合計 difficulty()。
export const SEESAW_STAGES = {
  A: { notches: [3, 4], groups: [1, 1], mover: [1, 2], d: [0, 4] },
  B: { notches: [4, 5], groups: [1, 2], mover: [1, 2], d: [5, 9] },
  C: { notches: [5, 5], groups: [2, 2], mover: [2, 3], d: [10, Infinity] },
};
// れんしゅう1回の5面の段の並び。
export const SEESAW_RUN_STAGES = ['A', 'A', 'B', 'B', 'C'];

const MAX_ALL_NOTCHES = 5;
const MAX_LEFT_ROBOTS = 3;
const MAX_MOVER_ROBOTS = 3;

// 左の組の並び（刻み昇順、同じ刻みに2組は置かない）を、辞書順（組は (刻み, 体数)。短い列が先）で返す。
function leftLists(notches) {
  const groups = [];
  for (let pos = 1; pos <= notches; pos += 1) {
    for (let robots = 1; robots <= MAX_LEFT_ROBOTS; robots += 1) groups.push({ robots, pos });
  }
  const lists = [];
  groups.forEach((g1, i) => {
    lists.push([g1]);
    for (let j = i + 1; j < groups.length; j += 1) {
      if (groups[j].pos > g1.pos) lists.push([g1, groups[j]]);
    }
  });
  return lists;
}

const inRange = (v, [min, max]) => v >= min && v <= max;
const boardKey = (notches, left, moverRobots) => JSON.stringify([notches, left.map((w) => [w.robots, w.pos]), moverRobots]);

// 全数え上げ（段に関係なく）。解がちょうど1つの盤だけ。開始位置は解以外の全部。
// 順：(刻み, 左の組, 右の体数, 開始) の辞書順。
function enumerateAll() {
  const all = [];
  for (let notches = 3; notches <= MAX_ALL_NOTCHES; notches += 1) {
    for (const left of leftLists(notches)) {
      for (let moverRobots = 1; moverRobots <= MAX_MOVER_ROBOTS; moverRobots += 1) {
        const base = { notches, left, mover: { robots: moverRobots, start: 1 } };
        const found = solutions(base);
        if (found.length !== 1) continue;
        const solution = found[0];
        const d = difficulty(base);
        const key = boardKey(notches, left, moverRobots);
        // 素朴な答え＝左のいちばん外の組と同じ刻みに置く。それが解なら「当たる面」。
        const naiveHit = left[left.length - 1].pos === solution;
        for (let start = 1; start <= notches; start += 1) {
          if (start !== solution) all.push({ notches, left, moverRobots, start, solution, d, key, naiveHit });
        }
      }
    }
  }
  return all;
}

let allCache = null;
const stageCache = {};

// seesawCandidates(stage) -> 段（'A'|'B'|'C'）の条件に合う面の配列（決まった順）。面＝盤＋開始位置。
// 面 { notches, left, moverRobots, start, solution, d, key（盤の識別）, naiveHit }。
export function seesawCandidates(stage) {
  const cond = SEESAW_STAGES[stage];
  if (!cond) throw new Error(`未対応のシーソーの段: ${stage}`);
  if (!stageCache[stage]) {
    allCache ??= enumerateAll();
    stageCache[stage] = allCache.filter(
      (c) => inRange(c.notches, cond.notches) && inRange(c.left.length, cond.groups) && inRange(c.moverRobots, cond.mover) && inRange(c.d, cond.d)
    );
  }
  return stageCache[stage];
}

// 面→seesaw spec（レッスンJSONのseesawと同じ形）。
export function faceToSpec(face) {
  return {
    notches: face.notches,
    left: face.left.map((w) => ({ robots: w.robots, pos: w.pos })),
    mover: { robots: face.moverRobots, start: face.start },
  };
}

const pickOne = (rng, list) => list[Math.floor(rng() * list.length)];
const byD = (a, b) => a.d - b.d;

// 連続する同じ段の面を選ぶ。最初の面（isFirst）だけは素朴な答えで当たってもよい。
// 当たってよい面は、同じ段の他の面よりdが小さい（または同じ）ものから選ぶ。残りは外れる面だけ。盤は重ねない。
function pickGroup(rng, stage, count, used, isFirst) {
  const all = seesawCandidates(stage);
  const misses = all.filter((c) => !c.naiveHit);
  const chosen = [];
  const missCount = isFirst ? count - 1 : count;
  for (let i = 0; i < missCount; i += 1) {
    const pool = misses.filter((c) => !used.has(c.key) && !chosen.some((x) => x.key === c.key));
    chosen.push(pickOne(rng, pool));
  }
  chosen.sort(byD);
  if (isFirst) {
    const minD = chosen.length > 0 ? chosen[0].d : Infinity;
    const pool = all.filter((c) => c.d <= minD && !used.has(c.key) && !chosen.some((x) => x.key === c.key));
    chosen.unshift(pickOne(rng, pool));
  }
  chosen.forEach((c) => used.add(c.key));
  return chosen;
}

// generateSeesawRun(stages, code) -> seesaw specの配列（stagesと同じ長さ）。
// stages＝段の並び（例 ['A','A','B','B','C']。同じ段は連続させる）。code＝'000'〜'999'。
// 規則：1面目以外は素朴な答えで外れる／1回の面は互いに違う盤／dは非減少。
export function generateSeesawRun(stages, code) {
  const rng = mulberry32(codeToSeed(code));
  const used = new Set();
  const faces = [];
  let i = 0;
  while (i < stages.length) {
    let j = i;
    while (j < stages.length && stages[j] === stages[i]) j += 1;
    faces.push(...pickGroup(rng, stages[i], j - i, used, i === 0));
    i = j;
  }
  return faces.map(faceToSpec);
}
