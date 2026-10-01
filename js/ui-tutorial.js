// チュートリアル（なぞり操作型）＝説明専用の画面。問題の操作画面とは分離し、見た目
// （背景色・見出し「れんしゅう」）も分ける。結果の見える化（番号付きゴースト矢印＋
// 1行キャプション）・区切り画面・スキップを持つ（Issue #93。旧仕様はIssue #81）。
import { S } from './state.js';
import { simulate, boardSpec } from './engine-grid.js';
import { renderGrid, computeCellSize, splitMaxCell } from './ui-grid.js';
import { renderCommandPalette, renderCommandQueue, toggleGhostSlot, COMMAND_LABELS, vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { showHandHint } from './ui-hand.js';
import { goToStep, createPrimaryButton, playAnimation, setActiveHandHint } from './ui-step.js';
import { showSuccess } from './ui-reaction.js';
import { IS_DEV } from './dev-mode.js';

const GUIDE_GLOW_CLASSES = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];
const TUTORIAL_DONE_PREFIX = 'steamkids.tutorialDone.';
const DIVIDER_DELAY_MS = 1500; // ゴール演出（ジャンプ）が終わる頃にカードを出す
const TUTORIAL_CELL_MAX = 56; // 「小さな盤面」。問題のplay/predict(最大64px)より一回り小さくする

// isTutorialDone/markTutorialDone: レッスン単位の完了・スキップ記録（端末内のみ・同期しない。
// 旧仕様は単元単位だったが、同一単元内の2本目以降のレッスンにもtutorialを置くようになった
// ため、1本目の完了で2本目以降まで自動スキップされないようレッスン単位に変更した。Issue #98）。
export function isTutorialDone(lessonId) {
  try {
    return localStorage.getItem(TUTORIAL_DONE_PREFIX + lessonId) === 'true';
  } catch {
    return false;
  }
}

export function markTutorialDone(lessonId) {
  if (IS_DEV) return;
  try {
    localStorage.setItem(TUTORIAL_DONE_PREFIX + lessonId, 'true');
  } catch {
    // 容量超過等は無視（チュートリアル表示が続くだけで機能上は問題ない）
  }
}

// guide: [{tap: 'up'|'down'|'left'|'right'|'run'}]、または{tap: 'remove', index: N}
// （積んだ命令列のN番目のチップを消す。なおす系のれんしゅう用。Issue #98）。指定された順にしか
// 操作できない（なぞり操作型チュートリアル。Issue #81）。文字を読ませない方針のため指示文は
// step.textがある時のみ表示（既定文言へのフォールバックはしない）。
// run/undo/retry/clearのlogEventは行わない（チュートリアル完走で単元スタンプが付くのを防ぐ）。
// step.groupRepeats（同方向連続タップを1チップへまとめる。playと同挙動）・
// step.initialCommands（誤った命令列を最初から積む。なおす系用）は任意（Issue #98）。
export function renderTutorial(root, step) {
  const spec = boardSpec(step);
  const guide = step.script;
  const local = {
    commands: (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 })),
    guideIndex: 0,
    boxOpen: -1,
    running: false,
    view: null,
    cellSize: TUTORIAL_CELL_MAX,
    // 実行中ハイライト（playと同じ契約。周回の点表示用。Issue #167）。
    activeIndex: -1,
    activeInner: -1,
    activeRound: -1,
    lastRound: -1,
  };

  const panel = document.createElement('div');
  panel.className = 'tutorial-screen flex flex-col flex-1 min-h-0 gap-2 bg-amber-50 rounded-xl p-2';
  root.appendChild(panel);

  // 縦向きはdisplay:contentsで従来どおりの縦積み、横向きは盤面｜操作パネルの左右分割（Issue #156）。
  const mainCol = document.createElement('div');
  mainCol.className = 'tutorial-main';
  panel.appendChild(mainCol);
  const sideCol = document.createElement('div');
  sideCol.className = 'tutorial-side';
  panel.appendChild(sideCol);

  const headerRow = document.createElement('div');
  headerRow.className = 'flex justify-between items-center shrink-0';
  const heading = document.createElement('h2');
  heading.className = 'text-sm font-bold text-amber-800';
  heading.textContent = 'れんしゅう';
  headerRow.appendChild(heading);
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.dataset.action = 'skip-tutorial';
  skipBtn.textContent = 'れんしゅうを とばす';
  skipBtn.className = 'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-white text-xs text-slate-600 shadow';
  headerRow.appendChild(skipBtn);
  mainCol.appendChild(headerRow);

  if (step.text) {
    const prompt = document.createElement('p');
    prompt.className = 'tutorial-prompt text-lg text-center shrink-0';
    renderInto(prompt, step.text, S.readingLevel, S.furigana);
    mainCol.appendChild(prompt);
  }

  // お手本列。実物ボタンと同じ見た目（色・矢印SVG）で手順を示し、文言は使わない（Issue #81）。
  // →区切り・順番数字を付ける（Issue #93）。
  const guideRowEl = document.createElement('div');
  guideRowEl.className = 'guide-row flex justify-center items-center gap-1 shrink-0';
  guideRowEl.setAttribute('aria-hidden', 'true');
  // 箱のお手本アイコンに出す回数（times=1タップ毎に2→3→4→2。playと同じ循環）。
  let guideTimes = 2;
  guide.forEach((entry, i) => {
    if (entry.tap === 'box') guideTimes = 2;
    else if (entry.tap === 'times') guideTimes = guideTimes >= 4 ? 2 : guideTimes + 1;
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'text-slate-300 text-xs';
      arrow.textContent = '→';
      guideRowEl.appendChild(arrow);
    }
    const el = document.createElement('span');
    el.dataset.guideIndex = String(i);
    el.dataset.state = 'todo';
    const isRun = entry.tap === 'run';
    const isRemove = entry.tap === 'remove';
    const isBox = entry.tap === 'box';
    const isTimes = entry.tap === 'times';
    const isClose = entry.tap === 'close';
    el.className = `guide-step relative inline-flex items-center justify-center h-10 rounded-lg pointer-events-none ${
      isRun || isClose
        ? 'px-3 bg-emerald-500 text-white text-sm font-bold'
        : isRemove
          ? 'w-10 bg-rose-500 text-white text-lg font-bold'
          : isBox || isTimes
            ? 'px-2 bg-amber-500 text-white text-sm font-bold'
            : 'w-10 bg-sky-500 text-white'
    }`;
    if (isRun) el.textContent = 'じっこう';
    else if (isRemove) el.textContent = '×';
    else if (isBox) el.textContent = '🔁';
    else if (isTimes) el.textContent = `×${guideTimes}`;
    else if (isClose) el.textContent = 'とじる';
    else {
      const rotate = { up: 0, right: 90, down: 180, left: 270 }[entry.tap];
      el.innerHTML = `<svg viewBox="0 0 24 24" class="w-6 h-6" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M12 2 L20 14 L14 14 L14 22 L10 22 L10 14 L4 14 Z" fill="currentColor" /></svg>`;
    }
    const check = document.createElement('span');
    check.className =
      'guide-check hidden absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-xs flex items-center justify-center';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    el.appendChild(check);
    guideRowEl.appendChild(el);
  });
  mainCol.appendChild(guideRowEl);

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area relative flex-1 min-h-0 flex items-center justify-center overflow-hidden';
  mainCol.appendChild(boardArea);
  const boardWrap = document.createElement('div');
  boardArea.appendChild(boardWrap);

  // 「やったね！」の表示先。盤面に重ねて配置し、レイアウトを動かさない。
  const resultSlot = document.createElement('div');
  resultSlot.className = 'tutorial-result absolute top-1 inset-x-0 z-10 flex justify-center pointer-events-none';
  boardArea.appendChild(resultSlot);

  let remainingEl = null;
  if (spec.items.length > 0) {
    const remainingBadge = document.createElement('div');
    remainingBadge.className =
      'absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-white/90 rounded-full px-2 py-1 text-xs font-bold text-slate-700 shadow';
    remainingBadge.innerHTML = `<span data-remaining>${spec.items.length}</span>`;
    boardArea.appendChild(remainingBadge);
    remainingEl = remainingBadge.querySelector('[data-remaining]');
  }

  // 結果の見える化：タップごとに番号付きゴースト矢印＋1行キャプションを出す（Issue #93）。
  const captionEl = document.createElement('p');
  captionEl.className = 'ghost-caption text-center text-sm text-slate-600 shrink-0 min-h-[1.25rem]';
  mainCol.appendChild(captionEl);

  const paletteEl = document.createElement('div');
  paletteEl.className = 'palette-row flex gap-2 justify-center shrink-0';
  sideCol.appendChild(paletteEl);

  // 命令列とじっこうを1行に並べる（行を分けるとスマホ縦で盤面の高さが残らないため。Issue #99）。
  const queueRow = document.createElement('div');
  queueRow.className = 'tutorial-queue-row flex items-center gap-2 shrink-0';
  sideCol.appendChild(queueRow);

  const queueEl = document.createElement('ul');
  queueEl.className = 'command-queue flex flex-nowrap items-center gap-2 overflow-x-auto min-h-[64px] py-1 flex-1 min-w-0';
  queueRow.appendChild(queueEl);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.dataset.action = 'run';
  runBtn.textContent = '▶ じっこう';
  runBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap disabled:opacity-40 shrink-0';
  queueRow.appendChild(runBtn);

  let boxBtn = null;
  const timesBtn = document.createElement('button');
  timesBtn.type = 'button';
  timesBtn.dataset.action = 'box-times';
  timesBtn.textContent = 'かいすう ×2';
  timesBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-amber-400 text-white text-sm font-bold whitespace-nowrap break-keep shrink-0 disabled:opacity-40';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.action = 'box-close';
  closeBtn.textContent = 'とじる';
  closeBtn.className = 'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep shrink-0 disabled:opacity-40';

  function drawBoard() {
    local.cellSize = Math.min(
      splitMaxCell(TUTORIAL_CELL_MAX),
      computeCellSize({ cols: spec.grid.cols, rows: spec.grid.rows, width: boardArea.clientWidth, height: boardArea.clientHeight, maxCell: splitMaxCell() })
    );
    boardWrap.innerHTML = '';
    const { el, view } = renderGrid({ grid: spec.grid, walls: spec.walls, goal: spec.goal, items: spec.items, ice: spec.ice, cushion: spec.cushion, keys: spec.keys, doors: spec.doors, switches: spec.switches, playerPos: spec.start, labels: [], cellSize: local.cellSize });
    boardWrap.appendChild(el);
    local.view = view;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      activeInner: local.activeInner,
      activeRound: local.activeRound,
      openIndex: local.boxOpen,
      removable: false,
    });
  }

  function guideEntry() {
    return guide[local.guideIndex] ?? null;
  }

  function guideTarget() {
    return guideEntry()?.tap ?? null;
  }

  // お手本通りに積んだ命令の予定経路をゴースト矢印＋番号で示す（実行前のプレビュー。Issue #93）。
  // showCaption=falseの時はキャプション文言を出さない（remove後は「◯に すすむ よてい」が
  // 直前に消したチップの説明のように誤読されるため。Issue #98）。
  function updateGhostPreview(showCaption = true) {
    local.view.clearHints();
    if (local.commands.length === 0) {
      captionEl.textContent = '';
      return;
    }
    const result = simulate(local.commands, spec);
    let order = 0;
    let prev = spec.start;
    for (let i = 1; i < result.path.length; i++) {
      const cur = result.path[i];
      if (cur.x === prev.x && cur.y === prev.y) continue;
      order += 1;
      local.view.markCell(cur, 'ghost', { order });
      prev = cur;
    }
    if (showCaption) {
      const last = local.commands.at(-1);
      captionEl.textContent = last.box ? `はこの なかを ${last.times}かい` : `${COMMAND_LABELS[last.dir]}に 1ます すすむ よてい`;
    } else {
      captionEl.textContent = '';
    }
  }

  // handleRemoveTap(index): なおす系のれんしゅうで、guideが指すチップ（お手本列と対応した
  // 実チップ）をタップして消す。guideTarget()が'remove'かつindexが一致する時だけ有効（Issue #98）。
  function handleRemoveTap(index) {
    if (local.running || guideTarget() !== 'remove' || guideEntry()?.index !== index) return;
    vibrate();
    local.commands.splice(index, 1);
    playSfx('remove');
    local.guideIndex += 1;
    drawQueue();
    updateGhostPreview(false);
    applyGuide();
  }

  // 現在のtap対象だけ有効化して光らせ、他は無効化する。お手本列は済み(done)/現在(current)/
  // 未(todo)を色・チェックで示す（Issue #81）。targetが'remove'の時はパレット・じっこうを
  // すべて無効化し、積んだ命令列の対象チップだけを光らせてタップ許可する（Issue #98）。
  function setGuideBtn(btn, isTarget) {
    btn.disabled = local.running || !isTarget;
    if (isTarget) {
      btn.dataset.guide = 'true';
      btn.classList.add(...GUIDE_GLOW_CLASSES);
    } else {
      delete btn.dataset.guide;
      btn.classList.remove(...GUIDE_GLOW_CLASSES);
    }
  }

  function applyGuide() {
    const entry = guideEntry();
    const target = entry?.tap ?? null;
    paletteEl.querySelectorAll('button').forEach((b) => {
      setGuideBtn(b, b === boxBtn ? target === 'box' : b.dataset.command === target);
    });
    setGuideBtn(runBtn, target === 'run');
    setGuideBtn(timesBtn, target === 'times');
    setGuideBtn(closeBtn, target === 'close');
    queueEl.querySelectorAll('.command-chip').forEach((chip) => {
      const isRemoveTarget = target === 'remove' && Number(chip.dataset.index) === entry.index;
      chip.classList.remove(...GUIDE_GLOW_CLASSES);
      chip.classList.toggle('cursor-pointer', isRemoveTarget);
      if (isRemoveTarget) {
        chip.classList.add(...GUIDE_GLOW_CLASSES);
        if (!chip.querySelector('.tutorial-remove-badge')) {
          const badge = document.createElement('span');
          badge.className =
            "tutorial-remove-badge absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4 text-center";
          badge.textContent = '×';
          badge.setAttribute('aria-hidden', 'true');
          chip.appendChild(badge);
        }
        chip.onclick = () => handleRemoveTap(entry.index);
      } else {
        chip.querySelector('.tutorial-remove-badge')?.remove();
        chip.onclick = null;
      }
    });
    guideRowEl.querySelectorAll('[data-guide-index]').forEach((el) => {
      const i = Number(el.dataset.guideIndex);
      const state = i < local.guideIndex ? 'done' : i === local.guideIndex ? 'current' : 'todo';
      el.dataset.state = state;
      el.classList.remove(...GUIDE_GLOW_CLASSES, 'opacity-40');
      el.querySelector('.guide-check').classList.toggle('hidden', state !== 'done');
      if (state === 'current') el.classList.add(...GUIDE_GLOW_CLASSES);
      if (state === 'done') el.classList.add('opacity-40');
    });
    updateHandHint(target, entry);
  }

  // 光るボタンに加え、次に押す方向へ指ガイドを重ねて示す（runは実行ボタン上でタップ動作。
  // removeは対象チップ上でタップ動作。Issue #95・#98）。実行中・案内対象が無い時は消す。
  function updateHandHint(target, entry) {
    if (local.running || !target) {
      setActiveHandHint(null);
      return;
    }
    if (target === 'run') {
      setActiveHandHint(showHandHint({ from: runBtn, mode: 'tap' }));
      return;
    }
    if (target === 'remove') {
      const chip = queueEl.querySelector(`[data-index="${entry.index}"]`);
      setActiveHandHint(chip ? showHandHint({ from: chip, mode: 'tap' }) : null);
      return;
    }
    if (target === 'times' || target === 'close') {
      setActiveHandHint(showHandHint({ from: target === 'times' ? timesBtn : closeBtn, mode: 'tap' }));
      return;
    }
    const btn = target === 'box' ? boxBtn : paletteEl.querySelector(`[data-command="${target}"]`);
    setActiveHandHint(btn ? showHandHint({ from: btn, to: queueEl, mode: 'drag' }) : null);
  }

  renderCommandPalette(paletteEl, {
    dropTarget: () => queueEl.getBoundingClientRect(),
    onDragOver: (active) => toggleGhostSlot(queueEl, active),
    onAdd: (dir, { via } = {}) => {
      if (local.running || dir !== guideTarget()) return;
      if (local.boxOpen >= 0) {
        local.commands[local.boxOpen].box.push(dir);
        playSfx(via === 'drag' ? 'snap' : 'tap');
        local.guideIndex += 1;
        drawQueue();
        queueEl.scrollLeft = queueEl.scrollWidth;
        queueEl.scrollTop = queueEl.scrollHeight;
        updateGhostPreview();
        applyGuide();
        return;
      }
      // groupRepeats: playと同様、直前と同方向なら新しいチップを作らずまとめる（Issue #98）。
      const last = local.commands.at(-1);
      const merged = step.groupRepeats && last && last.dir === dir;
      if (merged) {
        last.times += 1;
        playSfx('stack', { count: last.times });
      } else {
        local.commands.push({ dir, times: 1 });
        playSfx(via === 'drag' ? 'snap' : 'tap');
      }
      local.guideIndex += 1;
      drawQueue();
      // 命令列は横スクロールのため、追加のたびに右端へスクロールし最新チップを見せる（Issue #102）。
      queueEl.scrollLeft = queueEl.scrollWidth;
      queueEl.scrollTop = queueEl.scrollHeight;
      if (via === 'drag' && !merged) queueEl.lastElementChild?.classList.add('spring-in');
      updateGhostPreview();
      applyGuide();
    },
  });

  // くりかえしの箱（play.repeatBoxと同じ見た目・操作。Issue #139）。箱を開いている間は
  // 「じっこう」を「かいすう・とじる」に差し替える（盤面の高さを変えないため）。
  function drawQueueRow() {
    queueRow.replaceChildren(queueEl, ...(local.boxOpen >= 0 ? [timesBtn, closeBtn] : [runBtn]));
  }
  if (step.repeatBox) {
    boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.dataset.action = 'box-open';
    boxBtn.className =
      'command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-amber-500 text-white disabled:opacity-40';
    boxBtn.innerHTML = '<span class="text-xl leading-none" aria-hidden="true">🔁</span><span class="text-sm whitespace-nowrap">はこ</span>';
    boxBtn.addEventListener('click', () => {
      if (local.running || guideTarget() !== 'box') return;
      vibrate();
      playSfx('tap');
      local.commands.push({ box: [], times: 2 });
      local.boxOpen = local.commands.length - 1;
      local.guideIndex += 1;
      drawQueueRow();
      drawQueue();
      queueEl.scrollLeft = queueEl.scrollWidth;
      queueEl.scrollTop = queueEl.scrollHeight;
      updateGhostPreview();
      applyGuide();
    });
    paletteEl.appendChild(boxBtn);
  }
  timesBtn.addEventListener('click', () => {
    if (local.running || guideTarget() !== 'times' || local.boxOpen < 0) return;
    vibrate();
    playSfx('tap');
    const box = local.commands[local.boxOpen];
    box.times = box.times >= 4 ? 2 : box.times + 1;
    timesBtn.textContent = `かいすう ×${box.times}`;
    local.guideIndex += 1;
    drawQueue();
    updateGhostPreview();
    applyGuide();
  });
  closeBtn.addEventListener('click', () => {
    if (local.running || guideTarget() !== 'close' || local.boxOpen < 0) return;
    vibrate();
    playSfx('tap');
    local.boxOpen = -1;
    local.guideIndex += 1;
    drawQueueRow();
    drawQueue();
    updateGhostPreview();
    applyGuide();
  });

  // 盤面を残したまま半透明の背景＋中央カードを重ねる。背景が全面を覆うため背後は操作不可（Issue #132）。
  function renderDivider() {
    setActiveHandHint(null);
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-divider fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
    const card = document.createElement('div');
    card.className = 'flex flex-col items-center gap-2 bg-amber-50 rounded-2xl shadow-xl px-6 py-6 max-w-full';
    const doneHeading = document.createElement('h2');
    doneHeading.className = 'text-lg font-bold text-emerald-700';
    doneHeading.textContent = 'れんしゅう おしまい';
    card.appendChild(doneHeading);
    const doneCaption = document.createElement('p');
    doneCaption.className = 'text-sm text-slate-600';
    doneCaption.textContent = 'じゅんばんに うごいたね';
    card.appendChild(doneCaption);
    const nextText = document.createElement('p');
    nextText.className = 'text-base';
    nextText.textContent = 'ここから もんだい';
    card.appendChild(nextText);
    card.appendChild(createPrimaryButton('もんだいへ', () => goToStep(S.stepIndex + 1), 'continue-to-task'));
    overlay.appendChild(card);
    panel.appendChild(overlay);
  }

  runBtn.addEventListener('click', () => {
    if (local.running || guideTarget() !== 'run') return;
    vibrate();
    local.guideIndex += 1;
    local.running = true;
    local.view.clearHints();
    captionEl.textContent = '';
    applyGuide();
    drawBoard();

    playAnimation(local.commands, spec, local.view, {
      onTick: (i, _to, inner, round) => {
        // 実行中ハイライト（playと同じ。周回の点表示用。Issue #167）。
        local.activeIndex = i;
        local.activeInner = inner;
        if (round !== local.lastRound) {
          if (round >= 1) playSfx('stack', { count: round + 1 });
          local.lastRound = round;
        }
        local.activeRound = round;
        drawQueue();
      },
      onPickup: () => {
        if (remainingEl) remainingEl.textContent = String(Number(remainingEl.textContent) - 1);
      },
      onDone: () => {
        local.running = false;
        local.activeIndex = -1;
        local.activeInner = -1;
        local.activeRound = -1;
        drawQueue();
        markTutorialDone(S.lesson.lessonId);
        const result = simulate(local.commands, spec);
        if (result.reachedGoal && result.remainingItems.length === 0 && result.blockedAt.length === 0) {
          showSuccess(resultSlot, { view: local.view, restore: (el) => { el.innerHTML = ''; } });
          setTimeout(() => { if (panel.isConnected) renderDivider(); }, DIVIDER_DELAY_MS);
        } else {
          renderDivider();
        }
      },
    });
  });

  skipBtn.addEventListener('click', () => {
    vibrate();
    markTutorialDone(S.lesson.lessonId);
    goToStep(S.stepIndex + 1);
  });

  new ResizeObserver(() => {
    if (local.running) return;
    const next = Math.min(
      splitMaxCell(TUTORIAL_CELL_MAX),
      computeCellSize({ cols: spec.grid.cols, rows: spec.grid.rows, width: boardArea.clientWidth, height: boardArea.clientHeight, maxCell: splitMaxCell() })
    );
    if (next !== local.cellSize) {
      drawBoard();
      updateGhostPreview();
    }
  }).observe(boardArea);

  drawBoard();
  drawQueue();
  applyGuide();
}
