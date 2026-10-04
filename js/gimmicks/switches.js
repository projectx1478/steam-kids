// switches（スイッチ）ギミック：スイッチのマスへ入ると対応する切替壁が消えて通れる。
// 同じ対象を複数のスイッチが持つと全部踏むまで開かない（AND）。1回で固定（戻らない）。消える代わりに壁が沈み込んで床に埋まる（Issue #168）。踏む前の切替壁は壁と同じ通行不可（当たると失敗）。Issue #63。
// mode:"close"（Issue #149）は逆に、踏むと対象に壁が出る（初期は床。出た壁は通行不可）。closeは単独で使う。
const keyOf = (p) => `${p.x},${p.y}`;
const list = (v) => (Array.isArray(v) ? v : []);

function switchSvg(pressed) {
  return `<svg viewBox="0 0 64 64" class="grid-switch-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="${pressed ? '#d1fae5' : '#fef3c7'}" stroke="#d97706" stroke-width="4" />
      <circle cx="32" cy="${pressed ? 36 : 28}" r="${pressed ? 9 : 12}" fill="#f59e0b" stroke="#b45309" stroke-width="3" />
    </svg>`;
}

// off＝踏んだ後の埋まった床（フラット）。onの壁が沈み込んだ後にこの表示になる（Issue #168）。
function wallSvg(on) {
  if (!on) {
    return `<svg viewBox="0 0 64 64" class="grid-switch-wall-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="#d6c4a5" stroke="#b8a37f" stroke-width="2" />
    </svg>`;
  }
  return `<svg viewBox="0 0 64 64" class="grid-switch-wall-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="#f59e0b" stroke="#d97706" stroke-width="4" />
      <path d="M14 22 H50 M14 42 H50 M32 22 V42" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" />
    </svg>`;
}

const SINK_MS = 500;

// 壁を縮小＋暗くして沈ませ、埋まった床の表示へ差し替える。reduced-motion時は即時に差し替える。
function sinkWall(cell) {
  const svg = cell.querySelector('.grid-switch-wall-svg');
  if (!svg) return;
  const flat = () => svg.replaceWith(fromHtml(wallSvg(false)));
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return flat();
  svg.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(0.85)', filter: 'brightness(0.6)' }], { duration: SINK_MS, easing: 'ease-in', fill: 'forwards' }).finished.then(flat, flat);
}

// 床の表示を壁の表示へ差し替え、小さい状態から立ち上がらせる。reduced-motion時は即時（Issue #149）。
function raiseWall(cell) {
  const old = cell.querySelector('.grid-switch-wall-svg');
  const svg = fromHtml(wallSvg(true));
  if (old) old.replaceWith(svg);
  else cell.insertAdjacentHTML('afterbegin', wallSvg(true));
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cell.querySelector('.grid-switch-wall-svg')?.animate?.([{ transform: 'scale(0.85)', filter: 'brightness(0.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: SINK_MS, easing: 'ease-out' });
}

const fromHtml = (html) => Object.assign(document.createElement('template'), { innerHTML: html }).content.firstElementChild;

export const switches = {
  key: 'switches',

  // state: { pressed: 踏んだスイッチの番号配列（昇順。不変更新） }
  initState() {
    return { pressed: [] };
  },

  enter(state, pos, spec) {
    const i = list(spec.switches).findIndex((s) => s.x === pos.x && s.y === pos.y);
    if (i < 0 || state.pressed.includes(i)) return state;
    return { pressed: [...state.pressed, i].sort((a, b) => a - b) };
  },

  isCleared() {
    return true;
  },

  stateKey(state) {
    return `switches:${state.pressed.join(',')}`;
  },

  // open：踏む前の対象が壁。close：踏んだ後の対象が壁（Issue #149）。
  blocks(state, pos, spec) {
    return list(spec.switches).some(
      (s, i) => state.pressed.includes(i) === (s.mode === 'close') && list(s.targets).some((t) => t.x === pos.x && t.y === pos.y)
    );
  },

  onStep({ pos, spec, view, run }) {
    const i = list(spec.switches).findIndex((s) => s.x === pos.x && s.y === pos.y);
    run.pressed ??= new Set();
    if (i < 0 || run.pressed.has(i)) return undefined;
    run.pressed.add(i);
    const els = view.gimmickEls?.switches;
    const sw = spec.switches[i];
    const swCell = els?.switchCells.get(keyOf(sw));
    if (swCell) {
      swCell.dataset.switchPressed = 'true';
      swCell.querySelector('.grid-switch-svg')?.replaceWith(fromHtml(switchSvg(true)));
    }
    list(sw.targets).forEach((t) => {
      if (sw.mode === 'close') {
        // 壁が出る：床の表示から壁の表示へ差し替える（Issue #149）。
        const cell = els?.wallCells.get(keyOf(t));
        if (!cell) return;
        cell.dataset.switchWall = 'on';
        raiseWall(cell);
        return;
      }
      // 同じ対象を持つスイッチ（AND）が未踏なら、まだ開かない（blocksと同じ規則）。
      if (list(spec.switches).some((o, j) => !run.pressed.has(j) && list(o.targets).some((u) => u.x === t.x && u.y === t.y))) return;
      const cell = els?.wallCells.get(keyOf(t));
      if (!cell) return;
      cell.dataset.switchWall = 'off';
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
      ['keys', board.keys],
      ['doors', board.doors],
    ].map(([name, pts, switchOk]) => [name, new Set(list(pts).map(keyOf)), switchOk === true]);
    const points = [];
    swList.forEach((s, i) => {
      if (s.mode !== undefined && s.mode !== 'open' && s.mode !== 'close') add('盤面の妥当性', `${label}switches[${i}] のmode=${JSON.stringify(s.mode)} が不正（"open"か"close"）`);
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
        cell.dataset.switch = String(i);
        cell.dataset.switchPressed = 'false';
        cell.insertAdjacentHTML('afterbegin', switchSvg(false));
        switchCells.set(keyOf(s), cell);
      }
      list(s.targets).forEach((t) => {
        const wall = cellAt(t);
        if (!wall || wallCells.has(keyOf(t))) return;
        const closing = s.mode === 'close';
        wall.dataset.switchWall = closing ? 'off' : 'on';
        wall.insertAdjacentHTML('afterbegin', wallSvg(!closing));
        wallCells.set(keyOf(t), wall);
      });
    });
    return { switchCells, wallCells };
  },
};
