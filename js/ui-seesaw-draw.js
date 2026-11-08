// シーソー盤面の描画ヘルパー（js/ui-seesaw.js から切り出し。Issue #679）。
// 本編（renderSeesaw）と intro のデモ（js/ui-demo-seesaw.js）が同じ関数で盤面を描く。
import { shapeSvg } from './ui-grid.js';

export const BOARD_H = 270;
export const PLANK_Y = 180;
export const PLANK_H = 14;
export const GROUND_Y = 260;
export const ROBOT = 30;
export const ROBOT_STACK = 30; // 6体のみ24（robotStack）
export const NUM_R = 11; // おもさの数字の円の半径
export const MOVER_COLORS = ['#5b3a1a', '#0f766e']; // 2組の面の色（①茶・②青緑）

// 1刻みの幅（viewBox単位）。刻みが多い面ほど詰める。
export function unitFor(notches) {
  if (notches <= 4) return 40;
  return notches === 5 ? 36 : 31;
}

export const robotStack = (count) => (count >= 6 ? 24 : ROBOT_STACK);

export function robotsSvg(cx, count, extraAttrs = '') {
  let out = '';
  const stack = robotStack(count);
  for (let i = 0; i < count; i += 1) {
    const y = PLANK_Y - ROBOT - i * stack + 2;
    out += `<svg x="${cx - ROBOT / 2}" y="${y}" width="${ROBOT}" height="${ROBOT}" viewBox="0 0 64 64" ${extraAttrs}>${shapeSvg('player')}</svg>`;
  }
  return out;
}

// おもさの数字：山の真上の円（<g>。<svg>にしない）。
export function weightNumSvg(cx, count, color = '#5b3a1a') {
  const top = PLANK_Y - ROBOT - (count - 1) * robotStack(count) + 2;
  const cy = top - NUM_R;
  return `<g data-weight-disc><circle cx="${cx}" cy="${cy}" r="${NUM_R}" fill="${color}" /><text data-num="weight" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="16" font-weight="800">${count}</text></g>`;
}

export function distNumSvg(x, n) {
  return `<text data-num="dist" x="${x}" y="${PLANK_Y + PLANK_H / 2}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="14" font-weight="800" stroke="#44403c" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke">${n}</text>`;
}

// 2組の面は選んだ組の山の周りに琥珀の点線枠（data-sel-frame）を出す。
function frameSvg(cx0, count) {
  const top = PLANK_Y - ROBOT - (count - 1) * robotStack(count) + 2 - NUM_R * 2 - 4;
  return `<rect data-sel-frame x="${cx0 - ROBOT / 2 - 4}" y="${top}" width="${ROBOT + 8}" height="${PLANK_Y - top}" rx="6" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5 4" display="none" />`;
}

// 盤面 SVG の文字列。movers は moversOf(spec) の配列。pivotLine=true で支点の真上の点線（side:"both" の盤）。
export function seesawBoardHtml(spec, { movers, pivotLine = false }) {
  const notches = spec.notches;
  const unit = unitFor(notches);
  const cx0 = (notches + 1) * unit;
  const boardW = cx0 * 2;
  const pivotY = PLANK_Y + PLANK_H;
  const multi = movers.length === 2;
  const ticks = Array.from({ length: notches * 2 + 1 }, (_, i) => i - notches)
    .filter((n) => n !== 0)
    .map((n) => distNumSvg(cx0 + n * unit, Math.abs(n)))
    .join('');
  const leftRobots = spec.left.map((w) => robotsSvg(cx0 - w.pos * unit, w.robots) + weightNumSvg(cx0 - w.pos * unit, w.robots)).join('');
  const rightRobots = (spec.right ?? []).map((w) => robotsSvg(cx0 + w.pos * unit, w.robots) + weightNumSvg(cx0 + w.pos * unit, w.robots)).join('');
  const pivotLineSvg = pivotLine
    ? `<line data-pivot-line x1="${cx0}" y1="${PLANK_Y - 60}" x2="${cx0}" y2="${PLANK_Y}" stroke="#64748b" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" opacity="0.5" />`
    : '';
  const postX = (side) => cx0 + side * notches * unit;
  const moverSlots = movers
    .map(
      (m, i) =>
        `<g data-mover-slot><g data-mover data-mover-index="${i}" class="cursor-grab" style="touch-action: none">${robotsSvg(cx0, m.robots)}${weightNumSvg(cx0, m.robots, multi ? MOVER_COLORS[i] : undefined)}${multi ? frameSvg(cx0, m.robots) : ''}</g></g>`
    )
    .join('');
  return `<svg class="seesaw-board w-full h-full" viewBox="0 0 ${boardW} ${BOARD_H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <rect x="0" y="${GROUND_Y}" width="${boardW}" height="6" rx="3" fill="#a16207" opacity="0.5" />
    <polygon points="${cx0 - 30},${GROUND_Y} ${cx0 + 30},${GROUND_Y} ${cx0},${pivotY}" fill="#92400e" />
    <g data-support style="transition: opacity 300ms">
      <rect x="${postX(-1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
      <rect x="${postX(1) - 5}" y="${pivotY}" width="10" height="${GROUND_Y - pivotY}" rx="3" fill="#a8a29e" />
    </g>
    ${pivotLineSvg}
    <g data-plank style="transform-origin: ${cx0}px ${pivotY}px">
      <rect x="${cx0 - (notches + 0.7) * unit}" y="${PLANK_Y}" width="${(notches * 2 + 1.4) * unit}" height="${PLANK_H}" rx="6" fill="#b45309" />
      <rect x="${cx0 - (notches + 0.7) * unit + 4}" y="${PLANK_Y + 1}" width="${(notches * 2 + 1.4) * unit - 8}" height="4" rx="2" fill="#f59e0b" opacity="0.6" />
      ${ticks}
      <g data-footprints></g>
      <g data-left>${leftRobots}</g>
      <g data-right>${rightRobots}</g>
      ${moverSlots}
    </g>
  </svg>`;
}
