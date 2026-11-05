// ui-cond-chip.js: 条件カード {if, then}（「もし かべ→みぎ」＋中の矢印、Issue #291 段2a）1枚の描画。
// renderCommandQueue（ui-commands.js）から呼ぶ。目の行をタップすると if の方向が回る（onCycle。カードは消えない）。
// 循環 import を避けるため arrowSvg は引数で受け取る。

export const COND_DIRS = ['right', 'down', 'left', 'up'];
const COND_LABELS = { right: 'みぎ', down: 'した', left: 'ひだり', up: 'うえ' };

export const nextCondDir = (dir) => COND_DIRS[(COND_DIRS.indexOf(dir) + 1) % COND_DIRS.length];

const EYE_SVG =
  '<svg viewBox="0 0 24 24" class="w-5 h-5 shrink-0" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="7" fill="#fff" stroke="#0f172a" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#0f172a"/><circle cx="13.5" cy="10.5" r="1.3" fill="#fff"/></svg>';

// renderCondChip(chip, entry, { i, isOpen, activeIndex, activeInner, removable, interactive, arrowSvg, onRemove, onCycle })
// chip は呼び元が作った li.command-chip。中身とイベントだけここで付ける。
export function renderCondChip(chip, entry, { i, isOpen, activeIndex, activeInner, removable, interactive = removable, skipped = false, arrowSvg, onRemove, onCycle }) {
  chip.dataset.cond = 'true';
  chip.dataset.condDir = entry.if;
  chip.classList.replace('min-w-[64px]', 'min-w-[96px]');
  if (isOpen) {
    chip.dataset.open = 'true';
    chip.classList.add('ring-4', 'ring-emerald-400');
  }
  const eye = document.createElement('span');
  eye.dataset.condEye = 'true';
  eye.className = 'cond-eye flex items-center justify-center gap-1 px-1 min-h-[40px] text-[11px] font-bold leading-tight whitespace-nowrap rounded bg-violet-100 text-violet-800';
  eye.innerHTML = EYE_SVG;
  const label = document.createElement('span');
  label.textContent = skipped ? 'かべ なし' : `かべ→${COND_LABELS[entry.if] ?? ''}`;
  if (skipped) {
    // 実行中に偽で飛ばされたカード：灰色にして「かべ なし」（Issue #291 段2b）
    chip.dataset.skipped = 'true';
    chip.classList.remove('bg-sky-100');
    chip.classList.add('bg-slate-200', 'opacity-50');
    eye.classList.replace('bg-violet-100', 'bg-slate-200');
    eye.classList.replace('text-violet-800', 'text-slate-500');
  }
  eye.appendChild(label);
  if (interactive) {
    eye.addEventListener('click', (ev) => {
      ev.stopPropagation(); // カードを消さない（onRemove を呼ばない）
      onCycle?.(i);
    });
  }
  chip.appendChild(eye);

  const inner = document.createElement('span');
  inner.className = 'box-inner cond-inner flex items-center justify-center gap-0.5 flex-wrap';
  if (entry.then.length === 0) inner.textContent = '…';
  entry.then.forEach((d, j) => {
    const cell = document.createElement('span');
    cell.dataset.inner = String(j);
    cell.className = 'inline-flex w-5 h-5 rounded text-sky-600';
    if (i === activeIndex && j === activeInner) {
      cell.dataset.active = 'true';
      cell.classList.add('bg-yellow-300');
    }
    cell.innerHTML = arrowSvg(d);
    cell.firstElementChild.setAttribute('class', 'w-5 h-5');
    inner.appendChild(cell);
  });
  chip.appendChild(inner);
  if (removable) {
    chip.dataset.removeIndex = String(i);
    chip.addEventListener('click', () => onRemove(i));
  }
}
