// periodic（周期ドア）ギミック：決まった手数ごとに開閉するドア。閉じている手に入ると壁と同じ失敗（Issue #310）。
// 手番(turn)は1手の移動が終わった時点で tick が1進める。形は固定（periodは2・3・4のみ）：周期2＝開1閉1、周期3＝開1閉2、周期4＝開2閉2。
// 手番0から数えて開が先頭。判定はその手の開始時の turn mod period が openCount 未満か。
// 状態は有限にするため、turn は全ドアの period の最小公倍数(cycle)で丸めて持つ。
const list = (v) => (Array.isArray(v) ? v : []);
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;

const keyOf = (p) => `${p.x},${p.y}`;
// 周期ごとの開の手番数（周期内の先頭から）。
export const OPEN_COUNT = { 2: 1, 3: 1, 4: 2 };
const isOpenAt = (d, turn) => turn % d.period < OPEN_COUNT[d.period];

// 周期内の手番ごとの色名の並び。色の決定はここだけ。blue＝開、yellow・red＝閉（どちらも通れない）。
// 周期2＝[青,赤]、周期3＝[青,黄,赤]、周期4＝[青,青,黄,赤]。
export function phaseColors(period) {
  return { 2: ['blue', 'red'], 3: ['blue', 'yellow', 'red'], 4: ['blue', 'blue', 'yellow', 'red'] }[period] ?? [];
}

// 色名→表示色（青 #0072B2、黄 #F0E442（濃い縁つき）、赤 #D55E00）と縁の色。
const COLOR = { blue: '#0072B2', yellow: '#F0E442', red: '#D55E00' };
const EDGE = { blue: '#004a73', yellow: '#7a6f00', red: '#8f3d00' };
// 色ごとの形（blueは塗り●固定）。黄・赤の形は未確定の仮置きで輪郭○。形を決めたらここだけ差し替える（'filled' か 'ring'）。
export const MARK_SHAPE = { blue: 'filled', yellow: 'ring', red: 'ring' };

// 灰茶の板張りドア。構造はjs/gimmicks/keys.jsのdoorSvgと同じ（閉＝壁のように閉じた扉、開＝扉が脇に開いて床が見える）。
// 色は赤／青（かぎドア）と区別するため灰茶だけにし、かぎの形の印は付けない。
function doorSvg(open) {
  const ledge = '<rect x="4" y="10" width="56" height="52" rx="4" fill="#44403c" />';
  const frame = open
    ? '<path fill-rule="evenodd" d="M4 3 h56 v52 h-56z M9 7 h46 v48 h-46z" fill="#57534e" />'
    : '<rect x="4" y="3" width="56" height="52" rx="4" fill="#57534e" />';
  const inner = open
    ? `<rect x="9" y="7" width="46" height="5" fill="#0f172a" opacity="0.12" />
      <path d="M9 7 L18 10 L18 58 L9 55Z" fill="#78716c" stroke="#44403c" stroke-width="1.5" stroke-linejoin="round" />`
    : `<rect x="9" y="7" width="46" height="48" rx="2" fill="#78716c" stroke="#44403c" stroke-width="2" />
      <rect x="14" y="11" width="16" height="16" rx="2" fill="none" stroke="#44403c" stroke-width="2" />
      <rect x="34" y="11" width="16" height="16" rx="2" fill="none" stroke="#44403c" stroke-width="2" />
      <rect x="14" y="30" width="16" height="16" rx="2" fill="none" stroke="#44403c" stroke-width="2" />
      <rect x="34" y="30" width="16" height="16" rx="2" fill="none" stroke="#44403c" stroke-width="2" />
      <rect x="11" y="8" width="42" height="3" fill="#a8a29e" opacity="0.7" />`;
  return `<svg viewBox="0 0 64 64" class="grid-periodic-door-svg absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      ${ledge}${frame}${inner}
    </svg>`;
}

// ドア下端の帯（高さ14）に周期の数だけ丸を横一列に並べる。左から手番0。色はphaseColors、形はMARK_SHAPE、今の手番は黒の太縁（背面の黒い丸）。
function dotsSvg(d, turn) {
  const colors = phaseColors(d.period);
  const dots = colors.map((color, i) => {
    const current = i === turn % d.period;
    const cx = (64 * (i + 0.5)) / d.period;
    const filled = MARK_SHAPE[color] === 'filled';
    const dot = filled
      ? `<circle cx="${cx}" cy="57" r="4.5" fill="${COLOR[color]}" stroke="${EDGE[color]}" stroke-width="1.5"`
      : `<circle cx="${cx}" cy="57" r="4" fill="#ffffff" stroke="${color === 'yellow' ? EDGE[color] : COLOR[color]}" stroke-width="2.5"`;
    return `<circle cx="${cx}" cy="57" r="6.5" fill="#000000" data-dot-halo="${i}" opacity="${current ? 1 : 0}" />${dot} data-dot="${i}" data-dot-color="${color}" data-dot-fill="${filled ? 'filled' : 'outline'}" data-dot-current="${current}" />`;
  }).join('');
  return `<svg viewBox="0 0 64 64" class="grid-periodic-dots absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <rect x="4" y="50" width="56" height="14" rx="4" fill="#fafaf9" opacity="0.92" />${dots}
    </svg>`;
}

const fromHtml = (html) => Object.assign(document.createElement('template'), { innerHTML: html }).content.firstElementChild;

// セルのドア絵・ドット・data属性を手番turnの表示に合わせる。ドアは開閉が変わる時だけ差し替え、ドットは属性だけ更新する。
function paintDoor(cell, d, turn) {
  const open = isOpenAt(d, turn);
  if (cell.dataset.periodicOpen !== String(open)) {
    cell.dataset.periodicOpen = String(open);
    cell.querySelector('.grid-periodic-door-svg')?.replaceWith(fromHtml(doorSvg(open)));
  }
  cell.dataset.periodicTurn = String(turn % d.period);
  cell.querySelectorAll('[data-dot]').forEach((c) => {
    const i = Number(c.dataset.dot);
    const current = i === turn % d.period;
    c.dataset.dotCurrent = String(current);
    c.parentNode.querySelector(`[data-dot-halo="${i}"]`)?.setAttribute('opacity', current ? '1' : '0');
  });
}

export const periodic = {
  key: 'periodic',

  // state: { turn: 手番（0〜cycle-1）, cycle: 全ドアのperiodの最小公倍数（ドア無しは1）, doors: spec.periodicの写し }
  initState(spec) {
    const doors = list(spec.periodic);
    return { turn: 0, cycle: doors.reduce((c, d) => lcm(c, d.period), 1), doors };
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  // ドア無しの盤は定数（BFSの状態数を増やさない）。ある盤は手番をcycleで割った余り。
  stateKey(state) {
    return state.doors.length === 0 ? 'periodic' : `periodic:${state.turn % state.cycle}`;
  },

  // 閉じているドア（turn mod period が openCount 以上）は通行不可。soft にしない（壁と同じ失敗）。
  blocks(state, pos) {
    return state.doors.some((d) => d.x === pos.x && d.y === pos.y && !isOpenAt(d, state.turn));
  },

  // 1手の移動が終わった時点で1度だけ呼ぶ（呼び出し側は段1-2）。不変更新。
  tick(state) {
    return { ...state, turn: (state.turn + 1) % state.cycle };
  },

  // 周期ドアのセルへドア絵とドットを重ねる。data-periodic（period）・data-periodic-open・data-periodic-turn（現在の手番）。
  render({ board, periodic: doorList = [] }) {
    const doorCells = new Map();
    list(doorList).forEach((d) => {
      const cell = board.querySelector(`.grid-cell[data-x="${d.x}"][data-y="${d.y}"]`);
      if (!cell) return;
      cell.dataset.periodic = String(d.period);
      cell.dataset.periodicOpen = String(isOpenAt(d, 0));
      cell.dataset.periodicTurn = '0';
      cell.insertAdjacentHTML('afterbegin', doorSvg(isOpenAt(d, 0)) + dotsSvg(d, 0));
      doorCells.set(keyOf(d), cell);
    });
    return { doorCells };
  },

  // createStepperが1手進むたびに呼ぶ。表示する手番は、手の最後のマスでは次の手の開始時の手番（tick後）、
  // 途中のマス（氷の滑走中）ではその手の開始時の手番。閉じたドアに当たった手はbumpedでここへ来ず、手番は進まない。
  // アニメ無しで即時に切り替える（reduced-motionも同じ）。
  onStep({ spec, view, result, index }) {
    const els = view.gimmickEls?.periodic;
    const doors = list(spec.periodic);
    if (!els || doors.length === 0 || !result?.moveOf) return undefined;
    const k = result.moveOf[index];
    const cycle = doors.reduce((c, d) => lcm(c, d.period), 1);
    const last = result.moveOf[index + 1] !== k;
    const turn = last ? (result.turnAt[k + 1] ?? (result.turnAt[k] + 1) % cycle) : result.turnAt[k];
    doors.forEach((d) => {
      const cell = els.doorCells.get(keyOf(d));
      if (cell) paintDoor(cell, d, turn);
    });
    return undefined;
  },

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す。
  strip(spec) {
    return { ...spec, periodic: [] };
  },

  // 盤面の妥当性。形（period 2〜4・openフィールドは廃止）、他要素との重なり、
  // paint・repeatBox・groupRepeatsとの併用禁止。必須性（常に開とみなした盤の最短）はtools/validate-lessons.mjsのplay側。
  validate(board, add, label) {
    if (board.periodic === undefined) return;
    if (!Array.isArray(board.periodic) || board.periodic.length === 0) {
      add('盤面の妥当性', `${label}periodic が空、または配列でない`);
      return;
    }
    const grid = board.grid || {};
    if (grid.cols > 6 || grid.rows > 6) add('盤面の妥当性', `${label}periodicのある盤面は6×6以内（${grid.cols}×${grid.rows}）`);
    if (list(board.paint).length > 0) add('盤面の妥当性', `${label}periodic は paint と併用できない`);
    // 周期をまたぐ箱・同方向まとめは手番とずれるため、周期ドア盤では使わせない（初期は禁止で簡潔に）。
    if (board.repeatBox === true || board.groupRepeats === true) {
      add('盤面の妥当性', `${label}periodic は repeatBox・groupRepeats と併用できない（箱の展開が手番の周期をまたぐため。4方向のみ）`);
    }
    const keyOf = (p) => `${p.x},${p.y}`;
    const sets = [
      ['壁', list(board.walls)],
      ['start', board.start ? [board.start] : []],
      ['goal', board.goal ? [board.goal] : []],
      ['items', list(board.items)],
      ['ice', list(board.ice)],
      ['cushion', list(board.cushion)],
      ['keys', list(board.keys)],
      ['doors', list(board.doors)],
      ['switches', list(board.switches)],
      ['switchesのtargets', list(board.switches).flatMap((s) => list(s?.targets))],
    ].map(([name, pts]) => [name, new Set(pts.filter((p) => p && typeof p.x === 'number').map(keyOf))]);
    const seen = new Set();
    board.periodic.forEach((d, i) => {
      if (!d || !Number.isInteger(d.x) || !Number.isInteger(d.y)) {
        add('盤面の妥当性', `${label}periodic[${i}] が{x,y,period}でない`);
        return;
      }
      if (d.x < 0 || d.x >= grid.cols || d.y < 0 || d.y >= grid.rows) add('座標範囲', `${label}periodic[${i}]=${JSON.stringify(d)} が盤外`);
      for (const [name, set] of sets) if (set.has(keyOf(d))) add('盤面の妥当性', `${label}periodic[${i}] が${name}と重なる`);
      if (seen.has(keyOf(d))) add('盤面の妥当性', `${label}periodic[${i}] が他のperiodicと座標重複`);
      seen.add(keyOf(d));
      if (d.open !== undefined) add('盤面の妥当性', `${label}periodic[${i}] の open フィールドは廃止（形はperiodで固定：周期2＝開1閉1、周期3＝開1閉2、周期4＝開2閉2）`);
      if (!Number.isInteger(d.period) || d.period < 2 || d.period > 4) {
        add('盤面の妥当性', `${label}periodic[${i}] のperiod=${JSON.stringify(d.period)} が2〜4の整数でない`);
      }
    });
  },
};
