// intro のシーソーデモ（demo.kind === 'seesaw'。Issue #679）。js/ui-demo.js の renderGoalDemo が
// 盤面の描画と1周の動きだけをここに任せる（よーい…・ループ・再生ボタン・離脱停止は renderGoalDemo のまま）。
// 見せるのは成功の絵だけ：start から solution へ1刻み0.4秒で動く→支えが外れる（板は傾かない）→跳ねる→少し止まる。
// 紙吹雪は使わない（view に confetti を持たせない）。盤面の描画は本編と同じ js/ui-seesaw-draw.js。
import { moversOf } from './engine-seesaw.js';
import { prefersReducedMotion } from './ui-grid.js';
import { play as playSfx } from './sfx.js';
import { unitFor, robotsSvg, seesawBoardHtml } from './ui-seesaw-draw.js';

const HOLD_MS = 800; // start で止まって見せる
const STEP_MS = 400; // 1刻み
const SUPPORT_MS = 400; // 支えが外れる
const DANCE_MS = 700; // 跳ねる（本編の celebrateDance と同じ keyframes）
const END_MS = 800; // 最後の間

export function createSeesawDemoDriver(boardWrap, demo) {
  const spec = demo.seesaw;
  const movers = moversOf(spec);
  const unit = unitFor(spec.notches);
  const cx0 = (spec.notches + 1) * unit;
  const start = movers[0].start;
  const timers = new Set();
  let dance = null;
  let els = null;

  const view = {}; // confetti は持たせない（forbidden-patterns）

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function setPos(pos) {
    els.slot.setAttribute('transform', `translate(${pos * unit},0)`);
    els.mover.dataset.pos = String(pos);
  }

  function addFootprint(pos) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.footprint = String(pos);
    g.setAttribute('opacity', '0.25');
    g.setAttribute('transform', `translate(${pos * unit},0)`);
    g.innerHTML = robotsSvg(cx0, movers[0].robots);
    els.footprints.appendChild(g);
  }

  // 盤面を start の状態で描き直す（再生のたびに呼ぶ）。
  function draw() {
    cancel();
    boardWrap.innerHTML = seesawBoardHtml(spec, { movers });
    const svg = boardWrap.querySelector('svg');
    const lowHeight = window.matchMedia?.('(max-height: 479px)').matches;
    svg.style.height = 'auto';
    svg.style.maxHeight = lowHeight ? '200px' : '232px';
    const slot = svg.querySelector('[data-mover-slot]');
    els = {
      svg,
      plank: svg.querySelector('[data-plank]'),
      support: svg.querySelector('[data-support]'),
      footprints: svg.querySelector('[data-footprints]'),
      slot,
      mover: svg.querySelector('[data-mover]'),
    };
    els.plank.style.transition = 'none';
    // reduced-motion は transition を外して瞬間移動（時間だけ進める。ui-demo.js 冒頭と同じ方針）
    slot.style.transition = prefersReducedMotion() ? 'none' : `transform ${STEP_MS - 100}ms ease-in-out`;
    if (prefersReducedMotion()) els.support.style.transition = 'none';
    setPos(start);
  }

  function run(onDone) {
    if (!els) draw();
    const dir = Math.sign(demo.solution - start) || 1;
    const steps = Math.abs(demo.solution - start);
    let t = HOLD_MS;
    for (let i = 1; i <= steps; i += 1) {
      const pos = start + dir * i;
      later(() => {
        addFootprint(pos - dir);
        setPos(pos);
        playSfx('snap');
      }, t);
      t += STEP_MS;
    }
    later(() => {
      els.support.style.opacity = '0'; // 板は傾かない（水平のまま）
    }, t);
    t += SUPPORT_MS;
    later(() => {
      if (prefersReducedMotion()) return;
      dance = els.mover.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
        { duration: DANCE_MS, easing: 'ease-in-out' }
      );
    }, t);
    t += DANCE_MS + END_MS;
    later(() => onDone?.(), t);
  }

  function cancel() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    dance?.cancel();
    dance = null;
  }

  return { draw, run, cancel, view };
}
