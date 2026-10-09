// water（水）ギミック：通行不可のマス（川）。waterMode が "cushion"（既定）なら cushion と同じく
// 手前で止まり失敗にならない。"bump" なら壁と同じ失敗。bridge は描画専用の橋（動き・最短手数に影響しない）。
// soft は関数で、makeMover（engine-grid.js）が spec を渡して判定する。
const list = (v) => (Array.isArray(v) ? v : []);
const keyOf = (p) => `${p.x},${p.y}`;
const isPoint = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);

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
};
