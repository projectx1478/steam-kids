// 命令パレット・命令列（キュー）の描画。操作はタップのみ。

// 対応端末のみ短く振動する（未対応環境では何もしない。例外を投げない）。
export function vibrate(ms = 15) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

export const COMMAND_LABELS = {
  up: 'うえ',
  down: 'した',
  left: 'ひだり',
  right: 'みぎ',
};

const DIRECTIONS = ['up', 'right', 'down', 'left'];
const ARROW_ROTATE = { up: 0, right: 90, down: 180, left: 270 };

function arrowSvg(dir) {
  return `<svg viewBox="0 0 24 24" class="w-6 h-6" style="transform:rotate(${ARROW_ROTATE[dir]}deg)" aria-hidden="true">
    <path d="M12 2 L20 14 L14 14 L14 22 L10 22 L10 14 L4 14 Z" fill="currentColor" />
  </svg>`;
}

// renderCommandPalette(container, { onAdd })
export function renderCommandPalette(container, { onAdd }) {
  container.innerHTML = '';
  DIRECTIONS.forEach((dir) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.command = dir;
    btn.className =
      'command-btn flex flex-col items-center justify-center gap-1 min-w-[48px] min-h-[48px] px-3 py-2 rounded-xl bg-sky-500 text-white transition-transform duration-100 active:scale-95 disabled:opacity-40';
    btn.innerHTML = `${arrowSvg(dir)}<span class="text-sm">${COMMAND_LABELS[dir]}</span>`;
    btn.addEventListener('click', () => {
      vibrate();
      onAdd(dir);
    });
    container.appendChild(btn);
  });
}

// renderCommandQueue(container, { commands, activeIndex, onRemove })
// commandsの各要素は{dir, times}。times>=2は「した ×5」のようにまとめて表示する。
export function renderCommandQueue(container, { commands, activeIndex, onRemove }) {
  container.innerHTML = '';
  commands.forEach(({ dir, times }, i) => {
    const chip = document.createElement('li');
    chip.className = 'command-chip flex items-center gap-1 min-h-[48px] px-2 rounded-lg bg-sky-100';
    chip.dataset.index = String(i);
    if (i === activeIndex) chip.dataset.active = 'true';

    const label = document.createElement('span');
    label.className = 'text-sm flex-1';
    label.textContent = times >= 2 ? `${COMMAND_LABELS[dir]} ×${times}` : COMMAND_LABELS[dir];
    chip.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.dataset.removeIndex = String(i);
    removeBtn.className =
      'command-remove min-w-[48px] min-h-[48px] flex items-center justify-center text-lg text-slate-500 transition-transform duration-100 active:scale-95';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      vibrate();
      onRemove(i);
    });
    chip.appendChild(removeBtn);

    container.appendChild(chip);
  });
}
