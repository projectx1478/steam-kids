// SVGグリッド描画。すべて自作SVG（<img>・background-imageは使わない）。
const CELL = 64;

function shapeSvg(kind) {
  if (kind === 'wall') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="#94a3b8" />
    </svg>`;
  }
  if (kind === 'goal') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <polygon points="32,6 40,24 60,24 44,36 50,56 32,44 14,56 20,36 4,24 24,24"
        fill="#facc15" stroke="#eab308" stroke-width="2" />
    </svg>`;
  }
  if (kind === 'player') {
    return `<svg viewBox="0 0 64 64" class="w-full h-full" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="#38bdf8" stroke="#0284c7" stroke-width="3" />
    </svg>`;
  }
  return '';
}

// renderGrid({grid, walls, goal, playerPos, labels, markers}) -> HTMLElement
// labels: [{id, x, y}] 予想ステップの選択肢ボタン
// markers: [{x, y, kind: 'predicted' | 'result'}] 予想と結果を並べて表示するマーカー
export function renderGrid({ grid, walls, goal, playerPos, labels = [], markers = [] }) {
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const board = document.createElement('div');
  board.className = 'grid-board inline-grid gap-1 bg-sky-100 p-1 rounded-xl';
  board.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
  board.style.gridTemplateRows = `repeat(${grid.rows}, ${CELL}px)`;

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell relative bg-white rounded-lg';
      cell.style.width = `${CELL}px`;
      cell.style.height = `${CELL}px`;
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);

      if (wallSet.has(`${x},${y}`)) {
        cell.innerHTML = shapeSvg('wall');
      } else if (goal && goal.x === x && goal.y === y) {
        cell.innerHTML = shapeSvg('goal');
      }

      if (playerPos && playerPos.x === x && playerPos.y === y) {
        const token = document.createElement('div');
        token.className = 'grid-player absolute inset-0';
        token.innerHTML = shapeSvg('player');
        cell.appendChild(token);
      }

      const label = labels.find((l) => l.x === x && l.y === y);
      if (label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.option = label.id;
        btn.className =
          'grid-option absolute inset-0 flex items-center justify-center text-xl font-bold text-sky-700 bg-sky-200/70 rounded-lg';
        btn.textContent = label.id;
        cell.appendChild(btn);
      }

      markers
        .filter((m) => m.x === x && m.y === y)
        .forEach((m) => {
          const badge = document.createElement('div');
          badge.className = `grid-marker grid-marker-${m.kind} absolute inset-0 rounded-lg border-4 pointer-events-none flex items-end justify-center pb-0.5`;
          badge.classList.add(m.kind === 'predicted' ? 'border-amber-400' : 'border-emerald-500');
          const tag = document.createElement('span');
          tag.className = 'text-[10px] font-bold bg-white/80 rounded px-1';
          tag.textContent = m.kind === 'predicted' ? 'よそう' : 'けっか';
          badge.appendChild(tag);
          cell.appendChild(badge);
        });

      board.appendChild(cell);
    }
  }
  return board;
}
