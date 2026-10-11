// switches（スイッチ）ギミック：スイッチのマスへ入ると対応する切替壁が消えて通れる。
// 同じ対象を複数のスイッチが持つと全部踏むまで開かない（AND）。1回で固定（戻らない）。消える代わりに壁が沈み込んで床に埋まる（Issue #168）。踏む前の切替壁は壁と同じ通行不可（当たると失敗）。Issue #63。
// mode:"close"（Issue #149）は逆に、踏むと対象に壁が出る（初期は床。出た壁は通行不可）。closeは単独で使う。
import { mark } from './keys.js';

const keyOf = (p) => `${p.x},${p.y}`;
const list = (v) => (Array.isArray(v) ? v : []);

// スイッチ・壁の色と形の印（Issue #387）。色は switches[].color（省略時は添字順 red,blue,red…）。
const SWITCH_COLORS = ['red', 'blue'];
const HEX = { red: { main: '#ef4444', dark: '#b91c1c' }, blue: { main: '#3b82f6', dark: '#1e40af' } };
export const switchColor = (s, i) => (SWITCH_COLORS.includes(s?.color) ? s.color : SWITCH_COLORS[i % 2]);
const markName = (color) => (color === 'red' ? 'circle' : 'triangle');
// 対象(t)を持つスイッチの色。添字の昇順で最大2個（AND壁は印2つ）。
export function wallColors(swList, t) {
  const out = [];
  list(swList).forEach((s, i) => {
    if (list(s.targets).some((u) => u.x === t.x && u.y === t.y)) out.push(switchColor(s, i));
  });
  return out.slice(0, 2);
}

// S2レバー：台座＋棒の先の色玉（中に印）。踏むと右へ倒れる。色玉の右端が切れないよう玉は x<=61 に収める。
function switchSvg(pressed, color) {
  const c = HEX[color];
  const bx = pressed ? 45 : 32;
  const by = pressed ? 32 : 20;
  return `<svg viewBox="0 0 64 64" class="grid-switch-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="9" y="46" width="46" height="14" rx="6" fill="#57534e" />
      <rect x="9" y="43" width="46" height="14" rx="6" fill="#a8a29e" />
      <rect x="14" y="45" width="36" height="4" rx="2" fill="#d6d3d1" />
      <line x1="32" y1="46" x2="${bx}" y2="${by}" stroke="#78716c" stroke-width="7" stroke-linecap="round" />
      <circle cx="32" cy="46" r="6" fill="#57534e" />
      <circle cx="${bx}" cy="${by}" r="14" fill="${c.main}" stroke="${c.dark}" stroke-width="3" />
      ${mark(color, bx, by, 10, '#ffffff')}
    </svg>`;
}

// 壁の上面の印（白縁＋色）。複数のときは横に並べる。印ごとに data-mark・data-color を持つ。
function wallMarks(colors) {
  const r = colors.length > 1 ? 7.5 : 9.5;
  const xs = colors.length > 1 ? [20, 44] : [32];
  return colors
    .map(
      (color, k) => `<g class="grid-switch-wall-mark" data-mark="${markName(color)}" data-color="${color}">
        ${mark(color, xs[k], 27, r + 1.5, '#ffffff')}${mark(color, xs[k], 27, r, HEX[color].main)}
      </g>`
    )
    .join('');
}

// on＝橙の立体ブロック（影＋側面＋上面。上面に対象スイッチの印）。off＝踏んだ後の埋まった床（フラット。印なし）。
// outline＝toggleの沈んだ壁に残す点線の輪郭（また立つ印。Issue #388）。
function wallSvg(on, colors = [], outline = false) {
  if (!on) {
    return `<svg viewBox="0 0 64 64" class="grid-switch-wall-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="#d6c4a5" stroke="#b8a37f" stroke-width="2" />${
        outline
          ? `
      <rect class="grid-switch-wall-outline" x="9" y="9" width="46" height="46" rx="6" fill="none" stroke="#7c6338" stroke-opacity="0.6" stroke-width="2.6" stroke-dasharray="5 4.5" stroke-linecap="round" />`
          : ''
      }
    </svg>`;
  }
  return `<svg viewBox="0 0 64 64" class="grid-switch-wall-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect class="grid-switch-wall-shadow" x="2" y="12" width="60" height="50" rx="8" fill="#1e293b" opacity="0.18" />
      <rect x="3" y="10" width="58" height="50" rx="8" fill="#c2410c" />
      <g class="grid-switch-wall-top">
        <rect x="3" y="3" width="58" height="48" rx="8" fill="#f59e0b" />
        <rect x="7" y="6" width="50" height="40" rx="6" fill="#fbbf24" />
        ${wallMarks(colors)}
      </g>
    </svg>`;
}

const SINK_MS = 500;
const TOP_DROP = 7;
const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// 壁の動き：全体の縮小・暗さに加え、上面が下がり影が消える（Issue #387）。toSunk=trueで沈む、falseで立ち上がる。
function animateWall(svg, toSunk, easing) {
  const opt = { duration: SINK_MS, easing, fill: toSunk ? 'forwards' : 'none' };
  const ord = (a, b) => (toSunk ? [a, b] : [b, a]);
  const anims = [
    svg.animate?.(ord({ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(0.85)', filter: 'brightness(0.6)' }), opt),
  ];
  const top = svg.querySelector?.('.grid-switch-wall-top');
  const shadow = svg.querySelector?.('.grid-switch-wall-shadow');
  if (top?.animate) anims.push(top.animate(ord({ transform: 'translateY(0)' }, { transform: `translateY(${TOP_DROP}px)` }), opt));
  if (shadow?.animate) anims.push(shadow.animate(ord({ opacity: 0.18 }, { opacity: 0 }), opt));
  return anims[0];
}

// 壁を縮小＋暗くして沈ませ（上面が下がり影が消える）、埋まった床の表示へ差し替える。reduced-motion時は即時に差し替える。
function sinkWall(cell, outline = false) {
  const svg = cell.querySelector('.grid-switch-wall-svg');
  if (!svg) return;
  const flat = () => svg.replaceWith(fromHtml(wallSvg(false, [], outline)));
  if (prefersReduced()) return flat();
  animateWall(svg, true, 'ease-in').finished.then(flat, flat);
}

// 床の表示を壁の表示へ差し替え、小さい状態から立ち上がらせる。reduced-motion時は即時（Issue #149）。
function raiseWall(cell, colors) {
  const old = cell.querySelector('.grid-switch-wall-svg');
  const svg = fromHtml(wallSvg(true, colors));
  if (old) old.replaceWith(svg);
  else cell.insertAdjacentHTML('afterbegin', wallSvg(true, colors));
  if (prefersReduced()) return;
  const now = cell.querySelector('.grid-switch-wall-svg');
  if (now) animateWall(now, false, 'ease-out');
}

const fromHtml = (html) => Object.assign(document.createElement('template'), { innerHTML: html }).content.firstElementChild;

export const switches = {
  key: 'switches',

  // state: { pressed: 踏んだスイッチの番号配列（昇順。不変更新）。toggleは「奇数回踏まれた」番号（入るたびに出し入れ。Issue #388） }
  initState() {
    return { pressed: [] };
  },

  enter(state, pos, spec) {
    const i = list(spec.switches).findIndex((s) => s.x === pos.x && s.y === pos.y);
    if (i < 0) return state;
    if (spec.switches[i].mode === 'toggle') {
      const rest = state.pressed.filter((n) => n !== i);
      return { pressed: state.pressed.includes(i) ? rest : [...rest, i].sort((a, b) => a - b) };
    }
    if (state.pressed.includes(i)) return state;
    return { pressed: [...state.pressed, i].sort((a, b) => a - b) };
  },

  isCleared() {
    return true;
  },

  stateKey(state) {
    return `switches:${state.pressed.join(',')}`;
  },

  // open：踏む前の対象が壁。close：踏んだ後の対象が壁（Issue #149）。
  // toggle：奇数回踏んだ状態と初期（targets[].initial。省略はclosed＝壁）の入れ替え。壁＝（奇数回か）と（初期がopenか）が一致（Issue #388）。
  blocks(state, pos, spec) {
    return list(spec.switches).some((s, i) =>
      list(s.targets).some(
        (t) => t.x === pos.x && t.y === pos.y && state.pressed.includes(i) === (s.mode === 'toggle' ? t.initial === 'open' : s.mode === 'close')
      )
    );
  },

  // 解法関与チェック用。このギミックを除いた盤面specを返す（Issue #371）。
  strip(spec) {
    return { ...spec, switches: [] };
  },

  onStep({ pos, spec, view, run }) {
    const i = list(spec.switches).findIndex((s) => s.x === pos.x && s.y === pos.y);
    run.pressed ??= new Set();
    if (i >= 0 && spec.switches[i].mode === 'toggle') {
      // toggleは入るたびに入れ替える（Issue #388）。奇数回で右・偶数回で左にレバーが倒れ、壁は浮き沈みする。
      if (run.pressed.has(i)) run.pressed.delete(i);
      else run.pressed.add(i);
      const els = view.gimmickEls?.switches;
      const sw = spec.switches[i];
      const swCell = els?.switchCells.get(keyOf(sw));
      if (swCell) {
        swCell.dataset.switchPressed = String(run.pressed.has(i));
        swCell.querySelector('.grid-switch-svg')?.replaceWith(fromHtml(switchSvg(run.pressed.has(i), switchColor(sw, i))));
      }
      list(sw.targets).forEach((t) => {
        const cell = els?.wallCells.get(keyOf(t));
        if (!cell) return;
        // 前のアニメが残っていれば最終状態に揃えてから次を始める（連続タップ・滑走で重ならない）。
        cell.getAnimations?.({ subtree: true }).forEach((a) => a.finish());
        const on = run.pressed.has(i) === (t.initial === 'open');
        cell.dataset.switchWall = on ? 'on' : 'off';
        if (on) {
          const colors = wallColors(spec.switches, t);
          if (colors.length > 0) {
            cell.dataset.color = colors[0];
            cell.dataset.mark = markName(colors[0]);
          }
          raiseWall(cell, colors);
        } else {
          delete cell.dataset.color;
          delete cell.dataset.mark;
          sinkWall(cell, true);
        }
      });
      return 'wallSink';
    }
    if (i < 0 || run.pressed.has(i)) return undefined;
    run.pressed.add(i);
    const els = view.gimmickEls?.switches;
    const sw = spec.switches[i];
    const swCell = els?.switchCells.get(keyOf(sw));
    if (swCell) {
      swCell.dataset.switchPressed = 'true';
      swCell.querySelector('.grid-switch-svg')?.replaceWith(fromHtml(switchSvg(true, switchColor(sw, i))));
    }
    list(sw.targets).forEach((t) => {
      if (sw.mode === 'close') {
        // 壁が出る：床の表示から壁の表示へ差し替える（Issue #149）。
        const cell = els?.wallCells.get(keyOf(t));
        if (!cell) return;
        cell.dataset.switchWall = 'on';
        const colors = wallColors(spec.switches, t);
        if (colors.length > 0) {
          cell.dataset.color = colors[0];
          cell.dataset.mark = markName(colors[0]);
        }
        raiseWall(cell, colors);
        return;
      }
      // 同じ対象を持つスイッチ（AND）が未踏なら、まだ開かない（blocksと同じ規則）。
      if (list(spec.switches).some((o, j) => !run.pressed.has(j) && list(o.targets).some((u) => u.x === t.x && u.y === t.y))) return;
      const cell = els?.wallCells.get(keyOf(t));
      if (!cell) return;
      cell.dataset.switchWall = 'off';
      delete cell.dataset.color;
      delete cell.dataset.mark;
      sinkWall(cell);
    });
    return 'wallSink';
  },

  // 座標範囲はcheckBoard側で共通に行う。盤の大きさ・mode・targets・他ギミックとの重なりを見る。
  validate(board, add, label) {
    const swList = list(board.switches);
    if (swList.length === 0) return;
    const grid = board.grid || {};
    if (grid.cols > 6 || grid.rows > 6) add('盤面の妥当性', `${label}スイッチのある盤面は6×6以内（${grid.cols}×${grid.rows}）`);
    // 他ギミックのvalidateは相手にswitchesを見ないため、こちらで全方向の重なりを担保する。
    const others = [
      ['壁', board.walls],
      ['start', board.start ? [board.start] : []],
      ['goal', board.goal ? [board.goal] : []],
      ['items', board.items],
      ['ice', board.ice, true],
      ['cushion', board.cushion],
      ['water', board.water],
      ['keys', board.keys],
      ['doors', board.doors],
    ].map(([name, pts, switchOk]) => [name, new Set(list(pts).map(keyOf)), switchOk === true]);
    const points = [];
    swList.forEach((s, i) => {
      if (s.color !== undefined && !SWITCH_COLORS.includes(s.color)) add('盤面の妥当性', `${label}switches[${i}] のcolor=${JSON.stringify(s.color)} が不正（"red"か"blue"）`);
      if (s.mode !== undefined && s.mode !== 'open' && s.mode !== 'close' && s.mode !== 'toggle') add('盤面の妥当性', `${label}switches[${i}] のmode=${JSON.stringify(s.mode)} が不正（"open"か"close"か"toggle"）`);
      // initialはtoggleのtargetsだけで有効（"closed"｜"open"。省略時closed）。toggleは単独で使う（Issue #388）。
      list(s.targets).forEach((t, j) => {
        if (t?.initial === undefined) return;
        if (s.mode !== 'toggle') add('盤面の妥当性', `${label}switches[${i}].targets[${j}] のinitialはtoggleでのみ指定できる`);
        else if (t.initial !== 'closed' && t.initial !== 'open') add('盤面の妥当性', `${label}switches[${i}].targets[${j}] のinitial=${JSON.stringify(t.initial)} が不正（"closed"か"open"）`);
      });
      if (s.mode === 'toggle') {
        if (swList.some((o) => o.mode !== 'toggle')) add('盤面の妥当性', `${label}switches[${i}] のtoggle は他のmode（open・close）と併用できない`);
        const mine = list(s.targets);
        swList.forEach((o, j) => {
          if (j !== i && list(o.targets).some((u) => mine.some((t) => t.x === u.x && t.y === u.y))) add('盤面の妥当性', `${label}switches[${i}] のtoggle は他のスイッチと対象を共有できない`);
        });
        const onIce = new Set(list(board.ice).map(keyOf));
        if (onIce.has(keyOf(s))) add('盤面の妥当性', `${label}switches[${i}] のtoggle は氷の上に置けない`);
      }
      // closeは初版では単独（openとの併用・複数スイッチによる対象の共有=ANDは不可。Issue #149）。
      if (s.mode === 'close') {
        if (swList.some((o) => (o.mode ?? 'open') !== 'close')) add('盤面の妥当性', `${label}switches[${i}] のclose はopenと併用できない`);
        const mine = list(s.targets);
        swList.forEach((o, j) => {
          if (j > i && list(o.targets).some((u) => mine.some((t) => t.x === u.x && t.y === u.y))) add('盤面の妥当性', `${label}switches[${i}] のclose は他のスイッチと対象を共有できない（AND不可）`);
        });
      }
      if (!Array.isArray(s.targets) || s.targets.length === 0) add('盤面の妥当性', `${label}switches[${i}] のtargetsが空`);
      points.push([`switches[${i}]`, s]);
      list(s.targets).forEach((t, j) => points.push([`switches[${i}].targets[${j}]`, t]));
    });
    // 1つの壁を対象にできるスイッチは最大2（AND壁の印は2つまで。Issue #387）。
    const owners = new Map();
    swList.forEach((s) => list(s.targets).forEach((t) => owners.set(keyOf(t), (owners.get(keyOf(t)) ?? 0) + 1)));
    owners.forEach((n, k) => {
      if (n > 2) add('盤面の妥当性', `${label}対象(${k}) を${n}個のスイッチが共有している（1つの壁につき最大2）`);
    });
    // 座標重複は対象同士の共有だけ許可する（同じ対象を複数スイッチで共有＝AND）。
    const seen = new Map();
    points.forEach(([name, p]) => {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      const isTarget = name.includes('.targets[');
      // スイッチ本体だけは氷の上に置ける（滑走中の通過で作動）。対象（壁）は氷上不可（Issue #249）。
      others.forEach(([otherName, set, switchOk]) => {
        if (set.has(keyOf(p)) && !(switchOk && !isTarget)) add('盤面の妥当性', `${label}${name} が${otherName}と重なる`);
      });
      if (seen.has(keyOf(p)) && !(isTarget && seen.get(keyOf(p)))) add('盤面の妥当性', `${label}${name} が他のスイッチ・対象と座標重複`);
      seen.set(keyOf(p), isTarget && (seen.get(keyOf(p)) ?? true));
    });
  },

  // スイッチと切替壁のセルへSVGを重ねる。data-switch（番号）/ data-switch-pressed、
  // 切替壁はdata-switch-wall="on|off"（踏むとoff＝埋まった状態）。
  render({ board, switches: swList = [] }) {
    const switchCells = new Map();
    const wallCells = new Map();
    const cellAt = (p) => board.querySelector(`.grid-cell[data-x="${p.x}"][data-y="${p.y}"]`);
    swList.forEach((s, i) => {
      const cell = cellAt(s);
      if (cell) {
        const color = switchColor(s, i);
        cell.dataset.switch = String(i);
        cell.dataset.switchPressed = 'false';
        cell.dataset.color = color;
        cell.dataset.mark = markName(color);
        // 氷の上のスイッチは氷SVGより前面に置く（氷は先に描画済み。Issue #387）。
        const ice = cell.querySelector('.grid-ice-svg');
        if (ice) ice.insertAdjacentHTML('afterend', switchSvg(false, color));
        else cell.insertAdjacentHTML('afterbegin', switchSvg(false, color));
        switchCells.set(keyOf(s), cell);
      }
      list(s.targets).forEach((t) => {
        const wall = cellAt(t);
        if (!wall || wallCells.has(keyOf(t))) return;
        const toggle = s.mode === 'toggle';
        const closing = s.mode === 'close' || (toggle && t.initial === 'open');
        wall.dataset.switchWall = closing ? 'off' : 'on';
        const colors = wallColors(swList, t);
        if (!closing && colors.length > 0) {
          wall.dataset.color = colors[0];
          wall.dataset.mark = markName(colors[0]);
        }
        wall.insertAdjacentHTML('afterbegin', wallSvg(!closing, colors, toggle));
        wallCells.set(keyOf(t), wall);
      });
    });
    return { switchCells, wallCells };
  },
};
