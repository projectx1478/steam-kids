// water（水）ギミック：通行不可のマス（川）。waterMode が "cushion"（既定）なら cushion と同じく
// 手前で止まり失敗にならない。"bump" なら壁と同じ失敗。bridge は描画専用の橋（動き・最短手数に影響しない）。
// soft は関数で、makeMover（engine-grid.js）が spec を渡して判定する。
const list = (v) => (Array.isArray(v) ? v : []);
const keyOf = (p) => `${p.x},${p.y}`;
const isPoint = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);

// 水：波（地 #3b82f6、白い波線2本）。隣の水とつなげるため、描画を上下左右に2pxずつ広げる（角は丸めない）。
const WATER_SVG = `<svg viewBox="0 0 64 64" class="grid-water-svg absolute pointer-events-none" style="left:-2px;top:-2px;width:calc(100% + 4px);height:calc(100% + 4px)" aria-hidden="true">
      <rect x="0" y="0" width="64" height="64" fill="#3b82f6" />
      <g fill="none" stroke="#dbeafe" stroke-width="3" stroke-linecap="round">
        <path d="M8 24 Q16 16 24 24 T40 24 T56 24" />
        <path d="M8 44 Q16 36 24 44 T40 44 T56 44" />
      </g>
    </svg>`;

// 橋：板橋。基準は横に渡る向き（板は渡る向きと直角＝縦長の板を横に5枚並べ、上下に手すり）。縦に渡る橋は90度回す。
const bridgeSvg = (vertical) => `<svg viewBox="0 0 64 64" class="grid-bridge-svg absolute pointer-events-none" style="left:-2px;top:-2px;width:calc(100% + 4px);height:calc(100% + 4px)" aria-hidden="true">
      <g${vertical ? ' transform="rotate(90 32 32)"' : ''}>
        <rect x="0" y="12" width="64" height="46" fill="#000000" opacity="0.18" />
        <rect x="0" y="9" width="12.8" height="46" fill="#f59e0b" />
        <rect x="12.8" y="9" width="12.8" height="46" fill="#d97706" />
        <rect x="25.6" y="9" width="12.8" height="46" fill="#f59e0b" />
        <rect x="38.4" y="9" width="12.8" height="46" fill="#d97706" />
        <rect x="51.2" y="9" width="12.8" height="46" fill="#f59e0b" />
        <rect x="0" y="5" width="64" height="6" fill="#78350f" />
        <rect x="0" y="53" width="64" height="6" fill="#78350f" />
      </g>
    </svg>`;

export const water = {
  key: 'water',
  soft: (spec) => spec.waterMode !== 'bump',

  initState() {
    return {};
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  stateKey() {
    return '';
  },

  blocks(state, pos, spec) {
    return list(spec.water).some((c) => c.x === pos.x && c.y === pos.y);
  },

  // 座標範囲はcheckBoard側で共通に行う。ここでは重なり・重複・橋の隣接・waterModeの値を見る。
  validate(board, add, label) {
    const waterList = list(board.water);
    const bridgeList = list(board.bridge);
    if (board.waterMode !== undefined) {
      if (board.waterMode !== 'cushion' && board.waterMode !== 'bump') {
        add('盤面の妥当性', `${label}waterMode=${JSON.stringify(board.waterMode)} が不正（"cushion"か"bump"）`);
      } else if (waterList.length === 0) {
        add('盤面の妥当性', `${label}water が空のときは waterMode を指定できない`);
      }
    }
    if (waterList.length === 0 && bridgeList.length === 0) return;

    const sets = (name, points) => [name, new Set(list(points).filter(isPoint).map(keyOf))];
    const overlapWith = (kind, items, others) => {
      items.forEach((c, i) => {
        if (!isPoint(c)) {
          add('盤面の妥当性', `${label}${kind}[${i}] が{x,y}でない`);
          return;
        }
        for (const [name, set] of others) if (set.has(keyOf(c))) add('盤面の妥当性', `${label}${kind}[${i}] が${name}と重なる`);
      });
    };
    const switchTargets = list(board.switches).flatMap((s) => list(s?.targets));
    overlapWith('water', waterList, [
      sets('壁', board.walls),
      sets('start', board.start ? [board.start] : []),
      sets('goal', board.goal ? [board.goal] : []),
      sets('items', board.items),
      sets('ice', board.ice),
      sets('cushion', board.cushion),
      sets('keys', board.keys),
      sets('doors', board.doors),
      sets('switches', board.switches),
      sets('switchesのtargets', switchTargets),
      sets('paint', board.paint),
      sets('periodic', board.periodic),
    ]);
    overlapWith('bridge', bridgeList, [
      sets('water', waterList),
      sets('壁', board.walls),
      sets('cushion', board.cushion),
      sets('doors', board.doors),
      sets('switchesのtargets', switchTargets),
    ]);
    for (const [kind, points] of [['water', waterList], ['bridge', bridgeList]]) {
      const seen = new Set();
      points.filter(isPoint).forEach((c, i) => {
        if (seen.has(keyOf(c))) add('盤面の妥当性', `${label}${kind}[${i}] が他の${kind}と座標重複`);
        seen.add(keyOf(c));
      });
    }
    const waterSet = new Set(waterList.filter(isPoint).map(keyOf));
    bridgeList.forEach((c, i) => {
      if (!isPoint(c)) return;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => waterSet.has(`${c.x + dx},${c.y + dy}`));
      if (!near) add('盤面の妥当性', `${label}bridge[${i}] の上下左右に水が無い`);
    });
  },

  // 水のセルへdata-water="true"と波のSVG、橋のセルへdata-bridge="true"・data-bridge-dir("h"横/"v"縦")と板橋のSVGを重ねる
  // （駒・足あとより下）。橋の向き：上下に水があれば横、左右だけに水があれば縦、両方・どちらも無ければ横。
  render({ board, water: waters, bridge: bridges }) {
    const waterSet = new Set(list(waters).map(keyOf));
    const cellAt = (c) => board.querySelector(`.grid-cell[data-x="${c.x}"][data-y="${c.y}"]`);
    list(waters).forEach((c) => {
      const cell = cellAt(c);
      if (!cell) return;
      cell.dataset.water = 'true';
      cell.insertAdjacentHTML('afterbegin', WATER_SVG);
    });
    list(bridges).forEach((c) => {
      const cell = cellAt(c);
      if (!cell) return;
      const has = (dx, dy) => waterSet.has(`${c.x + dx},${c.y + dy}`);
      const vertical = (has(-1, 0) || has(1, 0)) && !(has(0, -1) || has(0, 1));
      cell.dataset.bridge = 'true';
      cell.dataset.bridgeDir = vertical ? 'v' : 'h';
      cell.insertAdjacentHTML('afterbegin', bridgeSvg(vertical));
    });
  },
};
