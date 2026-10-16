// 命令パレット・命令列（キュー）の描画。パレットの操作はタップ、またはドラッグして
// 命令列へドロップ（末尾に追加。Issue #95）。
import { chipCount, simulate } from './engine-grid.js';

// 対応端末のみ短く振動する（未対応環境では何もしない。例外を投げない）。
export function vibrate(ms = 15) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

// ---- 「とめる」の実行モデル（#395 段2。UIのチップは段3）----
// 「とめる」は命令列の {pause: true} 要素。engineのsimulateには渡さず、UI層で除いた列を使う。
// 止まり位置は命令単位。止まった後は「とめる」までの前の部分(lockedCount個)を変更不可にし、
// 先頭部分のsimulate終点（決定論）から後ろだけを続ける。

export const isPause = (entry) => typeof entry === 'object' && entry !== null && entry.pause === true;

// 「とめる」を除いた列と、除いた列の添字→元の添字の対応。
export function stripPauses(commands) {
  const cmds = [];
  const origIndex = [];
  commands.forEach((entry, i) => {
    if (isPause(entry)) return;
    cmds.push(entry);
    origIndex.push(i);
  });
  return { cmds, origIndex };
}

// from以降で最初の「とめる」の添字。無ければ-1。
export function nextPauseIndex(commands, from = 0) {
  for (let i = from; i < commands.length; i += 1) if (isPause(commands[i])) return i;
  return -1;
}

// maxCommandsの判定用チップ数。「とめる」は数えない（#395-3A）。
export function countChips(commands) {
  return chipCount(stripPauses(commands).cmds);
}

// 元の添字limit未満の命令が作るpathの手数（stepperのstartIndex／stopIndexに使う）。
export function stepsBefore(commands, spec, limit) {
  const { cmds, origIndex } = stripPauses(commands);
  const { stepOwner } = simulate(cmds, spec);
  return stepOwner.filter((o) => origIndex[o] < limit).length;
}

// 次の実行区間の計画。lockedCount=0（最初から）なら先頭から。lockedCount>0なら止まった地点
// （前のlockedCount個の終点）から後ろ。stopIndex=nullは最後まで、数値は次の「とめる」の手前で止まる。
export function planRun(commands, spec, lockedCount = 0) {
  const nextPause = nextPauseIndex(commands, lockedCount);
  return {
    nextPause,
    startIndex: lockedCount > 0 ? stepsBefore(commands, spec, lockedCount) : 0,
    stopIndex: nextPause < 0 ? null : stepsBefore(commands, spec, nextPause),
  };
}

// 止まった間は前の部分(i < lockedCount)を取り消せない。
export const isLockedIndex = (i, lockedCount) => i < lockedCount;

// 「ぜんぶけす」：後ろ(lockedCount以降)だけを空にする。参照は維持。消した数を返す。
export function clearUnlocked(commands, lockedCount) {
  const n = Math.max(0, commands.length - lockedCount);
  commands.length -= n;
  return n;
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
// maxPauses>0なら上段に「とめる」（タップでonPause()）と残り回数の表示を出す（#395 段3）。
export function renderCommandPalette(container, { onAdd, dropTarget, onDragOver, maxPauses = 0, onPause }) {
  container.innerHTML = '';
  // 2行×3列（上段 [空き][うえ][空き]・下段 [ひだり][した][みぎ]）。DOM順は up 先頭のまま、
  // 配置は tailwind.src.css の .palette-row の grid-area で並べ替える（Issue #395）。
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
  if (maxPauses > 0) {
    // 上段左「とめる」・上段右「✋×N」（表示のみ。button にしない。#395 段3）。有効・残り回数は呼び元が更新する。
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.dataset.action = 'pause';
    pauseBtn.className =
      'command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-amber-500 text-white disabled:opacity-40';
    pauseBtn.innerHTML = '<span class="text-2xl leading-none" aria-hidden="true">✋</span><span class="text-sm whitespace-nowrap">とめる</span>';
    pauseBtn.addEventListener('click', () => {
      vibrate();
      onPause?.();
    });
    container.appendChild(pauseBtn);
    const count = document.createElement('div');
    count.className = 'palette-count';
    count.dataset.pauseCount = String(maxPauses);
    count.setAttribute('role', 'img');
    count.setAttribute('aria-label', `のこり ${maxPauses}かい`);
    count.innerHTML = `<span aria-hidden="true">✋</span><span class="palette-count-x" aria-hidden="true">×</span><b data-pause-left aria-hidden="true">${maxPauses}</b>`;
    container.appendChild(count);
    return;
  }
  // 上段の左右の空きマス（button にしない）
  ['left', 'right'].forEach((side) => {
    const blank = document.createElement('div');
    blank.className = 'palette-blank';
    blank.dataset.blank = side;
    blank.setAttribute('aria-hidden', 'true');
    container.appendChild(blank);
  });
}

// 残り回数の表示（✋×N）を更新する。表示がない（maxPauses=0）画面では何もしない。
export function setPauseLeft(container, left) {
  const count = container.querySelector('[data-pause-count]');
  if (!count) return;
  count.querySelector('[data-pause-left]').textContent = String(left);
  count.dataset.pauseLeft = String(left);
  count.setAttribute('aria-label', `のこり ${left}かい`);
}

// 順番数字（①②③）は::beforeで重ねる（実DOMにspanを増やすと、チップ内テキストをspanで
// 厳密比較する既存シナリオ（cmd02-group-repeats・group-repeats-ui）が壊れるため。Issue #93）。
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

// renderCommandQueue(container, { commands, activeIndex, onRemove, removable = true, nextSlot, activeRound })
// commandsの各要素は{dir, times}。times>=2は「した ×5」のようにまとめて表示する。
// removable:falseの時は取り消しを描かない（チュートリアルでは命令を消させない。Issue #81）。
// removable時はチップ自体が取り消しボタン（data-remove-index・.command-remove。Issue #91）。
// 横に並ぶ64px四角チップで、はみ出す分は横スクロールする（container側でoverflow-x-autoを付ける）。
// チップ間には→区切り、各チップ左上に順番数字を重ねる（Issue #93）。
// nextSlot（数値）を渡すと、末尾に「次に置く」トレイ枠（.tray-slot・[data-tray-slot]）を1つ
// 追加する。1個目なら←矢印、2個目以降は番号を表示する（トレイのアフォーダンス。Issue #110）。
// 省略時（predict・tutorial等）は従来どおり枠を出さない。
// 箱（{box:[dir…], times}）は1チップに小さな矢印列と×回数を描く。activeInnerは実行中の箱内index、
// openIndexは編集中（開いている）箱のindex（Issue #66）。
// activeRoundは実行中の箱の周回（0始まり。既定-1＝実行外）。箱チップには「はこ ×N」ラベルの下に
// 周回の点（.box-rounds・N個）を並べ、済みの周と実行中の周を塗りつぶす（実行中の点だけ強調）。
// 実行外は点をすべて空で出し、点の数だけで回数が分かる。DOM判定用に箱チップへdata-round
// （実行中の周。実行外は属性なし）を付ける（Issue #167）。「はこ ×N」ラベル文言は実行中も変えない。
export function renderCommandQueue(container, { commands, activeIndex, activeInner = -1, activeRound = -1, openIndex = -1, onRemove, removable: removableAll = true, nextSlot = null, lockedCount = 0 }) {
  container.innerHTML = '';
  commands.forEach((entry, i) => {
    const { dir, times } = entry;
    // 止まった地点より前(lockedCount個)は取り消せない（×なし・タップ無反応。#395 段2）。
    const removable = removableAll && !isLockedIndex(i, lockedCount);
    // 「とめる」（#395 段3）。止まった後は境目（✋の線と「ここから」。タップ無反応）、
    // 置いただけのうちは琥珀のチップ（×で取り消せる）。順番数字は「とめる」を数えない。
    if (isPause(entry)) {
      if (isLockedIndex(i, lockedCount)) {
        const mark = document.createElement('li');
        mark.className = 'pause-mark shrink-0 flex flex-col items-center justify-center min-w-[56px] min-h-[64px] px-1 text-amber-700 font-bold border-l-4 border-amber-500';
        mark.dataset.index = String(i);
        mark.dataset.pauseMark = 'true';
        mark.innerHTML = '<span class="text-2xl leading-none" aria-hidden="true">✋</span><span class="text-[10px] leading-tight whitespace-nowrap">ここから</span>';
        container.appendChild(mark);
        return;
      }
      if (i > 0) container.appendChild(renderOrderArrow());
      const pchip = document.createElement('li');
      pchip.className = `command-chip pause-chip relative flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[64px] px-1 rounded-lg bg-amber-400 text-white shrink-0 ${
        removable
          ? "command-remove cursor-pointer transition-transform duration-100 active:scale-95 after:content-['×'] after:absolute after:-top-1.5 after:-right-1.5 after:w-4 after:h-4 after:rounded-full after:bg-rose-500 after:text-white after:text-[10px] after:font-bold after:leading-4 after:text-center"
          : ''
      }`;
      pchip.dataset.index = String(i);
      pchip.dataset.pause = 'true';
      pchip.innerHTML = '<span class="text-xl leading-none" aria-hidden="true">✋</span><span class="text-[10px] leading-tight font-bold">とめる</span>';
      if (removable) {
        pchip.dataset.removeIndex = String(i);
        pchip.addEventListener('click', () => {
          vibrate();
          onRemove(i);
        });
      }
      container.appendChild(pchip);
      return;
    }
    // 境目（止まった地点）の直後は、境目自体が区切りなので→を付けない。
    if (i > 0 && !(isPause(commands[i - 1]) && isLockedIndex(i - 1, lockedCount))) container.appendChild(renderOrderArrow());
    const chip = document.createElement('li');
    // ×バッジはCSS疑似要素(after:content)で描く。実DOMに<span>を増やすと、チップ内テキストを
    // spanで厳密比較する既存シナリオ（cmd02-group-repeats・group-repeats-ui）が壊れるため。
    chip.className = `command-chip relative flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[64px] px-1 rounded-lg bg-sky-100 shrink-0 ${ORDER_BADGE_CLASS} ${
      removable
        ? "command-remove cursor-pointer transition-transform duration-100 active:scale-95 after:content-['×'] after:absolute after:-top-1.5 after:-right-1.5 after:w-4 after:h-4 after:rounded-full after:bg-rose-500 after:text-white after:text-[10px] after:font-bold after:leading-4 after:text-center"
        : ''
    }`;
    chip.dataset.index = String(i);
    if (!removable && i < lockedCount) {
      chip.dataset.locked = 'true';
      chip.classList.add('opacity-50');
    }
    chip.dataset.order = String(commands.slice(0, i).filter((c) => !isPause(c)).length + 1);
    // 今動いている命令のチップを黄色の強調で示す。じっこうの自動実行・1コマ実行の
    // どちらもactiveIndexをここに渡す経路を通るため、強調スタイルはこの1か所にまとめる（Issue #111）。
    if (i === activeIndex) {
      chip.dataset.active = 'true';
      chip.classList.add('ring-4', 'ring-yellow-400');
    }

    if (entry.box) {
      chip.dataset.box = 'true';
      chip.classList.replace('min-w-[64px]', 'min-w-[88px]');
      if (i === openIndex) {
        chip.dataset.open = 'true';
        chip.classList.add('ring-4', 'ring-emerald-400');
      }
      const inner = document.createElement('span');
      inner.className = 'box-inner flex items-center justify-center gap-0.5 flex-wrap';
      if (entry.box.length === 0) inner.textContent = '…';
      entry.box.forEach((d, j) => {
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
      const boxLabel = document.createElement('span');
      boxLabel.className = 'box-times text-[10px] font-bold leading-tight';
      boxLabel.textContent = `はこ ×${times}`;
      chip.appendChild(boxLabel);
      // 周回の点：実行中は済みの周と実行中の周を塗り、実行中の点だけ強調する。実行外はすべて空。
      // 点はspanの空要素なので、チップ内テキストの厳密比較（cmd02-group-repeats等）を壊さない。
      const round = i === activeIndex ? activeRound : -1;
      const roundsEl = document.createElement('span');
      roundsEl.className = 'box-rounds flex items-center justify-center gap-0.5';
      for (let r = 0; r < times; r += 1) {
        const dot = document.createElement('span');
        dot.className = `box-round-dot inline-block w-2 h-2 rounded-full ${round >= 0 && r <= round ? 'bg-amber-500' : 'bg-slate-300'}`;
        if (round >= 0 && r <= round) dot.dataset.filled = 'true';
        if (round >= 0 && r === round) {
          dot.dataset.current = 'true';
          dot.classList.add('ring-2', 'ring-amber-300');
        }
        roundsEl.appendChild(dot);
      }
      chip.appendChild(roundsEl);
      if (round >= 0) chip.dataset.round = String(round);
      if (removable) {
        chip.dataset.removeIndex = String(i);
        chip.addEventListener('click', () => {
          vibrate();
          onRemove(i);
        });
      }
      container.appendChild(chip);
      return;
    }

    chip.insertAdjacentHTML('beforeend', arrowSvg(dir));
    const icon = chip.lastElementChild;
    icon.classList.add('w-5', 'h-5', 'text-sky-600');

    // ラベルは既存シナリオ（cmd02-group-repeats・group-repeats-ui）がテキストを厳密比較するため
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
