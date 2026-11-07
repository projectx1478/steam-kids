// predict-slider（シーソー教材）の intro.demo（kind: "seesaw"）の検証（Issue #679）。
// 形は { kind, seesaw, solution } の3キーだけ。seesaw・solution は play と同じ形で、mover は単体の { robots, start } だけ。
import { balance, allowedPositions } from '../../../js/engine-seesaw.js';
import { isObj } from './common.mjs';
import { moverOk, rightOk, SEESAW_KEYS } from './practice-seesaw.mjs';

const DEMO_KEYS = ['kind', 'seesaw', 'solution'];
const GRID_KEYS = ['grid', 'start', 'goal', 'walls', 'items', 'commands', 'showCommands', 'fixFrom'];
const NOTCHES_MIN = 4;
const NOTCHES_MAX = 6;
const LEFT_MAX = 2;
const ROBOTS_MAX = 6;

// ネタバレ比較の盤の鍵（start は比べない。practice-seesaw.mjs の boardKey と同じ流儀）。
const keyOf = (s) =>
  JSON.stringify([
    s.notches,
    [...s.left].map((w) => [w.robots, w.pos]).sort(),
    [...(s.right ?? [])].map((w) => [w.robots, w.pos]).sort(),
    Array.isArray(s.mover) ? null : s.mover.robots,
  ]);

// seesaw の形。ok なら true。
function seesawShapeOk(spec, label, add) {
  const bad = (msg) => add('デモのseesaw', `${label} ${msg}`);
  if (!isObj(spec)) {
    bad('seesaw がオブジェクトでない');
    return false;
  }
  let ok = true;
  const unknown = Object.keys(spec).filter((k) => !SEESAW_KEYS.includes(k));
  if (unknown.length > 0) {
    bad(`seesaw に未知のキー（${unknown.join('・')}）がある`);
    ok = false;
  }
  if (!Number.isInteger(spec.notches) || spec.notches < NOTCHES_MIN || spec.notches > NOTCHES_MAX) {
    bad(`notches=${JSON.stringify(spec.notches)} は${NOTCHES_MIN}〜${NOTCHES_MAX}の整数である必要がある`);
    return false;
  }
  const isI = (v) => Number.isInteger(v) && v >= 1;
  const left = spec.left;
  if (!Array.isArray(left) || left.length < 1 || left.length > LEFT_MAX) {
    bad(`left は1〜${LEFT_MAX}山の配列である必要がある`);
    return false;
  }
  if (!left.every((w) => isObj(w) && isI(w.robots) && w.robots <= ROBOTS_MAX && isI(w.pos) && w.pos <= spec.notches)) {
    bad(`left の robots は1〜${ROBOTS_MAX}、pos は1〜notches の整数である必要がある`);
    return false;
  }
  if (new Set(left.map((w) => w.pos)).size !== left.length) {
    bad('left の同じ位置に2山は置けない');
    ok = false;
  }
  if (!rightOk(spec)) {
    bad(`right は空でない配列で、robots は1〜${ROBOTS_MAX}、pos は1〜notches の整数、同じ位置に2山は不可`);
    ok = false;
  }
  const mover = spec.mover;
  if (!isObj(mover) || Array.isArray(mover)) {
    bad('mover は単体のオブジェクトである必要がある（配列は不可）');
    return false;
  }
  if (!Object.keys(mover).every((k) => k === 'robots' || k === 'start')) {
    bad('mover に書けるのは robots・start だけ（maxRobots・fixedPos・side は不可）');
    ok = false;
  } else if (mover.robots > ROBOTS_MAX || !moverOk(spec)) {
    bad(`mover が不正（robots は1〜${ROBOTS_MAX}、start は1〜notches で固定ロボットの位置と別）`);
    ok = false;
  }
  return ok;
}

export function checkSeesawDemo(intro, playSteps, add) {
  const demo = intro?.demo;
  if (demo === undefined) return;
  const label = `stepId="${intro.stepId}" のdemo`;
  if (!isObj(demo)) {
    add('デモの形', `${label} がオブジェクトでない`);
    return;
  }
  if (demo.kind !== 'seesaw') {
    add('デモの形', `${label} の kind=${JSON.stringify(demo.kind)} が不正（シーソー教材の demo は kind: "seesaw" が必要）`);
    return;
  }
  const mixed = Object.keys(demo).filter((k) => GRID_KEYS.includes(k));
  if (mixed.length > 0) add('デモの形', `${label} に grid 形のキー（${mixed.join('・')}）は混在できない`);
  const unknown = Object.keys(demo).filter((k) => !DEMO_KEYS.includes(k) && !GRID_KEYS.includes(k));
  if (unknown.length > 0) add('デモの形', `${label} に未知のキー（${unknown.join('・')}）がある`);
  if (!seesawShapeOk(demo.seesaw, label, add)) return;
  const spec = demo.seesaw;
  const s = demo.solution;
  if (!Number.isInteger(s) || !allowedPositions(spec).includes(s) || balance(spec, s).tilt !== 0) {
    add('デモのsolution', `${label} のsolution=${JSON.stringify(s)} がつりあう刻みでない`);
  } else if (s === spec.mover.start) {
    add('デモのsolution', `${label} のsolution が start と同じ（動かないデモになる）`);
  }
  const key = keyOf(spec);
  const same = playSteps.find((p) => isObj(p.seesaw) && Array.isArray(p.seesaw.left) && p.seesaw.mover && keyOf(p.seesaw) === key);
  if (same) add('デモのネタバレ', `${label} が本番 stepId="${same.stepId}" と同じ盤`);
}
