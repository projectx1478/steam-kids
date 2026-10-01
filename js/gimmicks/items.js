// items（どんぐり）ギミック：通過したマスの回収対象を集める。クリア条件は「ゴール到達
// かつ全item回収」になる（Issue #60）。盤面ギミックのフックIF（docs/gimmicks.md）の型見本。
// 状態は不変更新（enterは新しいstateを返す。既存を書き換えない）。BFS（shortestSteps/
// shortestChips）が同じstateを複数の分岐へ使い回すため（Issue #123）。

// state: { remaining: Set<number>（未回収のspec.items内インデックス）, collected: number[]（直前の
// enterで新たに回収したインデックス。simulate()のpickups用。初期状態では空配列） }
export const items = {
  key: 'items',

  initState(spec) {
    const list = spec.items ?? [];
    return { remaining: new Set(list.map((_, i) => i)), collected: [] };
  },

  // posへ進んだ直後に呼ばれる。新しいstateを返す（既存stateは変更しない）。
  enter(state, pos, spec) {
    const list = spec.items ?? [];
    const remaining = new Set(state.remaining);
    const collected = [];
    for (const idx of state.remaining) {
      if (list[idx].x === pos.x && list[idx].y === pos.y) {
        collected.push(idx);
        remaining.delete(idx);
      }
    }
    return { remaining, collected };
  },

  isCleared(state) {
    return state.remaining.size === 0;
  },

  // BFS（shortestSteps/shortestChips）の重複排除キー用。未回収の残りをビットマスク化する。
  stateKey(state) {
    let mask = 0;
    state.remaining.forEach((idx) => {
      mask |= 1 << idx;
    });
    return `items:${mask}`;
  },

  // js/engine-generate.jsの解法関与チェック用。このギミックを除いた盤面specを返す（Issue #70）。
  strip(spec) {
    return { ...spec, items: [] };
  },

  // tools/validate-lessons.mjsのcheckBoardから呼ばれる（座標範囲チェックはcheckBoard側で
  // walls等と共通に行うため対象外。ここではitems固有の重なりチェックのみ）。
  validate(board, add, label) {
    const boardItems = Array.isArray(board.items) ? board.items : [];
    const walls = Array.isArray(board.walls) ? board.walls : [];
    const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));
    boardItems.forEach((it, i) => {
      if (wallKeySet.has(`${it.x},${it.y}`)) add('盤面の妥当性', `${label}items[${i}] が壁と重なる`);
    });
    const itemKeySet = new Set();
    boardItems.forEach((it, i) => {
      const k = `${it.x},${it.y}`;
      if (itemKeySet.has(k)) add('盤面の妥当性', `${label}items[${i}] が他のitemsと座標重複`);
      itemKeySet.add(k);
    });
  },

  // js/ui-grid.jsのrenderGridから呼ばれる。座標キー→要素のMapを返し、collectItem等の
  // items専用view APIから参照する（view API自体はui-grid.js側で変更しない）。
  render({ board, pixelFor, CELL, shapeSvg, items: boardItems = [] }) {
    const itemEls = new Map();
    boardItems.forEach((it) => {
      const px = pixelFor(it);
      const el = document.createElement('div');
      el.className = 'grid-item absolute pointer-events-none';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = `${CELL}px`;
      el.style.height = `${CELL}px`;
      el.style.transform = `translate(${px.x}px, ${px.y}px)`;
      el.innerHTML = shapeSvg('item');
      board.appendChild(el);
      itemEls.set(`${it.x},${it.y}`, el);
    });
    return itemEls;
  },
};
