// 命令パレット・命令列（キュー）の描画。パレットの操作はタップ、またはドラッグして
// 命令列へドロップ（末尾に追加。Issue #95）。

// 対応端末のみ短く振動する（未対応環境では何もしない。例外を投げない）。
export function vibrate(ms = 15) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

const DRAG_THRESHOLD_PX = 8;

// attachTapOrDrag(el, { onTap, getDropTarget, onDragOver, onDrop })
// pointerdownから8px未満の移動で指を離したらタップ（onTap）。8px以上動くとドラッグを開始し、
// elの見た目を複製したクローンをposition:fixedで指に追従させる。getDropTarget()が返す
// DOMRect内で離すとonDrop、外なら何もしない（クローンが消えるだけ）。onDragOver(inside)は
// ドラッグ中、対象領域に入った/出た瞬間にのみ呼ぶ（ゴースト枠の出し入れ用）。
function attachTapOrDrag(el, { onTap, getDropTarget, onDragOver, onDrop }) {
  el.addEventListener('pointerdown', (downEvent) => {
    if (el.disabled) return;
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let dragging = false;
    let inside = false;
    let clone = null;

    function pointInRect(x, y, rect) {
      return Boolean(rect) && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function moveClone(x, y) {
      clone.style.left = `${x - clone.offsetWidth / 2}px`;
      clone.style.top = `${y - clone.offsetHeight / 2}px`;
    }

    function startDrag(x, y) {
      dragging = true;
      clone = el.cloneNode(true);
      clone.disabled = false;
      clone.className = `${el.className} fixed z-50 pointer-events-none shadow-2xl scale-105`;
      clone.style.width = `${el.offsetWidth}px`;
      clone.style.height = `${el.offsetHeight}px`;
      document.body.appendChild(clone);
      moveClone(x, y);
    }

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) startDrag(moveEvent.clientX, moveEvent.clientY);
      if (!dragging) return;
      moveClone(moveEvent.clientX, moveEvent.clientY);
      const nowInside = pointInRect(moveEvent.clientX, moveEvent.clientY, getDropTarget?.());
      if (nowInside !== inside) {
        inside = nowInside;
        onDragOver?.(inside);
      }
    }

    function cleanupListeners() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    }

    function onUp() {
      cleanupListeners();
      if (!dragging) {
        onTap();
        return;
      }
      clone.remove();
      onDragOver?.(false);
      if (inside) onDrop();
    }

    function onCancel() {
      cleanupListeners();
      if (!dragging) return;
      clone.remove();
      onDragOver?.(false);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  });
}

// toggleGhostSlot(listEl, active): ドラッグ中の配置先を示す。トレイの「次の枠」
// （[data-tray-slot]。Issue #110）が既にあればそれを光らせ、無い画面（tutorial等）では
// 従来どおり末尾に仮の枠を出し入れする。
export function toggleGhostSlot(listEl, active) {
  const traySlot = listEl.querySelector(':scope > [data-tray-slot]');
  if (traySlot) {
    traySlot.classList.toggle('ghost-slot', active);
    return;
  }
  let slot = listEl.querySelector(':scope > .ghost-slot');
  if (active) {
    if (!slot) {
      slot = document.createElement('li');
      slot.className = 'ghost-slot shrink-0 w-16 h-16';
      slot.setAttribute('aria-hidden', 'true');
      listEl.appendChild(slot);
    }
  } else {
    slot?.remove();
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

// renderCommandPalette(container, { onAdd, dropTarget, onDragOver })
// onAdd(dir, { via }): viaは'tap'|'drag'。dropTarget(): ドロップ判定に使うDOMRectを返す関数
// （省略時はドラッグしても追加されない＝タップのみの画面になる）。onDragOver(inside):
// ドラッグ中、dropTarget領域への出入りで呼ぶ（ゴースト枠の出し入れ用）。
export function renderCommandPalette(container, { onAdd, dropTarget, onDragOver }) {
  container.innerHTML = '';
  DIRECTIONS.forEach((dir) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.command = dir;
    btn.className =
      'command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-sky-500 text-white touch-none disabled:opacity-40';
    btn.innerHTML = `${arrowSvg(dir)}<span class="text-sm whitespace-nowrap">${COMMAND_LABELS[dir]}</span>`;
    attachTapOrDrag(btn, {
      onTap: () => {
        vibrate();
        onAdd(dir, { via: 'tap' });
      },
      getDropTarget: dropTarget,
      onDragOver,
      onDrop: () => {
        vibrate();
        onAdd(dir, { via: 'drag' });
      },
    });
    container.appendChild(btn);
  });
}

// 順番数字（①②③）は::beforeで重ねる（実DOMにspanを増やすと、チップ内テキストをspanで
// 厳密比較する既存シナリオ（cmd02-group-repeats・group-repeats-engine）が壊れるため。Issue #93）。
export const ORDER_BADGE_CLASS =
  "before:content-[attr(data-order)] before:absolute before:-top-1.5 before:-left-1.5 before:w-4 before:h-4 before:rounded-full before:bg-sky-600 before:text-white before:text-[10px] before:font-bold before:leading-4 before:text-center";

// renderOrderArrow(tag): 命令の並び順を示す→区切り。.command-chip等とは別要素にして
// 既存のチップ件数・span厳密比較を壊さない（Issue #93）。
export function renderOrderArrow(tag = 'li') {
  const arrow = document.createElement(tag);
  arrow.className = 'command-arrow flex items-center text-slate-400 text-sm shrink-0 px-0.5';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';
  return arrow;
}

// renderCommandQueue(container, { commands, activeIndex, onRemove, removable = true, nextSlot })
// commandsの各要素は{dir, times}。times>=2は「した ×5」のようにまとめて表示する。
// removable:falseの時は取り消しを描かない（チュートリアルでは命令を消させない。Issue #81）。
// removable時はチップ自体が取り消しボタン（data-remove-index・.command-remove。Issue #91）。
// 横に並ぶ64px四角チップで、はみ出す分は横スクロールする（container側でoverflow-x-autoを付ける）。
// チップ間には→区切り、各チップ左上に順番数字を重ねる（Issue #93）。
// nextSlot（数値）を渡すと、末尾に「次に置く」トレイ枠（.tray-slot・[data-tray-slot]）を1つ
// 追加する。1個目なら←矢印、2個目以降は番号を表示する（トレイのアフォーダンス。Issue #110）。
// 省略時（predict・tutorial等）は従来どおり枠を出さない。
export function renderCommandQueue(container, { commands, activeIndex, onRemove, removable = true, nextSlot = null }) {
  container.innerHTML = '';
  commands.forEach(({ dir, times }, i) => {
    if (i > 0) container.appendChild(renderOrderArrow());
    const chip = document.createElement('li');
    // ×バッジはCSS疑似要素(after:content)で描く。実DOMに<span>を増やすと、チップ内テキストを
    // spanで厳密比較する既存シナリオ（cmd02-group-repeats・group-repeats-engine）が壊れるため。
    chip.className = `command-chip relative flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[64px] px-1 rounded-lg bg-sky-100 shrink-0 ${ORDER_BADGE_CLASS} ${
      removable
        ? "command-remove cursor-pointer transition-transform duration-100 active:scale-95 after:content-['×'] after:absolute after:-top-1.5 after:-right-1.5 after:w-4 after:h-4 after:rounded-full after:bg-rose-500 after:text-white after:text-[10px] after:font-bold after:leading-4 after:text-center"
        : ''
    }`;
    chip.dataset.index = String(i);
    chip.dataset.order = String(i + 1);
    // 今動いている命令のチップを黄色の強調で示す。じっこうの自動実行・1コマ実行の
    // どちらもactiveIndexをここに渡す経路を通るため、強調スタイルはこの1か所にまとめる（Issue #111）。
    if (i === activeIndex) {
      chip.dataset.active = 'true';
      chip.classList.add('ring-4', 'ring-yellow-400');
    }

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

  // 次に置く枠（トレイの空きスロット。→区切りは付けない。c5-layout-flowが「命令列の→区切り」を
  // チップ間の数で厳密カウントしているため。Issue #110）。
  if (nextSlot != null) {
    const slot = document.createElement('li');
    slot.className = 'tray-slot shrink-0';
    slot.dataset.traySlot = 'true';
    slot.dataset.order = String(nextSlot);
    slot.setAttribute('aria-hidden', 'true');
    slot.innerHTML =
      nextSlot === 1
        ? '<span class="text-lg text-slate-400">←</span>'
        : `<span class="text-xs font-bold text-slate-400">${nextSlot}</span>`;
    container.appendChild(slot);
  }
}
