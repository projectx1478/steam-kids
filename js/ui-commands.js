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

export function arrowSvg(dir) {
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

// renderCommandQueue(container, { commands, activeIndex, onRemove, removable = true })
// commandsの各要素は{dir, times}。times>=2は「した ×5」のようにまとめて表示する。
// removable:falseの時は取り消しを描かない（チュートリアルでは命令を消させない。Issue #81）。
// removable時はチップ自体が取り消しボタン（data-remove-index・.command-remove。Issue #91）。
// 横に並ぶ48px四角チップで、はみ出す分は横スクロールする（container側でoverflow-x-autoを付ける）。
export function renderCommandQueue(container, { commands, activeIndex, onRemove, removable = true }) {
  container.innerHTML = '';
  commands.forEach(({ dir, times }, i) => {
    const chip = document.createElement('li');
    // ×バッジはCSS疑似要素(after:content)で描く。実DOMに<span>を増やすと、チップ内テキストを
    // spanで厳密比較する既存シナリオ（cmd02-group-repeats・group-repeats-engine）が壊れるため。
    chip.className = `command-chip relative flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-1 rounded-lg bg-sky-100 shrink-0 ${
      removable
        ? "command-remove cursor-pointer transition-transform duration-100 active:scale-95 after:content-['×'] after:absolute after:-top-1.5 after:-right-1.5 after:w-4 after:h-4 after:rounded-full after:bg-rose-500 after:text-white after:text-[10px] after:font-bold after:leading-4 after:text-center"
        : ''
    }`;
    chip.dataset.index = String(i);
    if (i === activeIndex) chip.dataset.active = 'true';

    chip.insertAdjacentHTML('beforeend', arrowSvg(dir));
    const icon = chip.lastElementChild;
    icon.classList.add('w-5', 'h-5', 'text-sky-600');

    // ラベルは既存シナリオ（cmd02-group-repeats・group-repeats-engine）がテキストを厳密比較するため
    // 「した ×5」/「うえ」形式を維持する。チップ内で唯一の<span>にする。
    const label = document.createElement('span');
    label.className = 'text-[10px] leading-tight';
    label.textContent = times >= 2 ? `${COMMAND_LABELS[dir]} ×${times}` : COMMAND_LABELS[dir];
    chip.appendChild(label);

    if (removable) {
      chip.dataset.removeIndex = String(i);
      chip.addEventListener('click', () => {
        vibrate();
        onRemove(i);
      });
    }

    container.appendChild(chip);
  });
}
