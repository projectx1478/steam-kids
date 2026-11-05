// ui-play-queue.js: 操作画面（ui-play.js）の編集・命令キュー・取り消し札・箱のバー（Issue #663 段2）。
// setupQueue(ctx) が saveDraft・resetToFresh・releaseFailLock・applyFailMark・scrollQueueToEnd・drawQueue・
// drawQueueFollowActive・updateControls・closeBox・showNormalActions・showResultActions を ctx.fn へ登録する。
// bindEditButtons(ctx) は「１つけす」「ぜんぶけす」「もとにもどす」「はこ」のクリックを結ぶ。
// 変わる共有変数は ctx.mut（undoSnap・undoTimer・clearSequence・boxBtn・boxActionsShown）。必ず ctx.mut.x で読み書きする。
import { S } from './state.js';
import { logEvent } from './events.js';
import { prefersReducedMotion } from './ui-grid.js';
import { renderCommandQueue, countChips, vibrate, clearUnlocked, isLockedIndex, isPause, setPauseLeft } from './ui-commands.js';
import { play as playSfx, skipClickSfx } from './sfx.js';
import { UNDO_CLEAR_MS, snapshotUnlocked, restoreUnlocked } from './undo-clear.js';
import { isTrial } from './trial-lesson.js';
import { writeDraft } from './storage.js';
import { nextCondDir } from './ui-cond-chip.js';

// 取り消し札を破棄して「ぜんぶけす」へ戻す（setupQueue と bindEditButtons の両方から使う）。
function dropUndo(ctx) {
  const { undoBtn, clearBtn } = ctx;
  if (ctx.mut.undoTimer) clearTimeout(ctx.mut.undoTimer);
  ctx.mut.undoTimer = null;
  ctx.mut.undoSnap = null;
  if (undoBtn.parentNode) undoBtn.replaceWith(clearBtn);
}

function showUndo(ctx, snap) {
  const { undoBtn, undoBar, clearBtn } = ctx;
  ctx.mut.undoSnap = snap;
  undoBar.style.transition = 'none';
  undoBar.style.width = '100%';
  clearBtn.replaceWith(undoBtn);
  // reduced-motion は減り棒を静止（満タンのまま）。5秒たてば札ごと消える。
  if (!prefersReducedMotion()) {
    void undoBar.offsetWidth;
    undoBar.style.transition = `width ${UNDO_CLEAR_MS}ms linear`;
    undoBar.style.width = '0%';
  }
  ctx.mut.undoTimer = setTimeout(() => {
    ctx.mut.undoTimer = null;
    dropUndo(ctx);
    ctx.fn.updateControls();
  }, UNDO_CLEAR_MS);
}

export function setupQueue(ctx) {
  const { step, local, freshCommands, isFix, maxPauses, actionsEl, paletteEl, queueEl, runBtn, clearBtn, removeLastBtn, stepBtn } = ctx;

  // クリア時はつぎへ・ためしなおす（レッスン再挑戦）を通常アクション行に差し替えて表示する
  // （盤面上に重ねない。Issue #97）。
  function showNormalActions() {
    dropUndo(ctx);
    ctx.mut.clearSequence?.dispose();
    ctx.mut.clearSequence = null;
    actionsEl.innerHTML = '';
    actionsEl.appendChild(clearBtn);
    actionsEl.appendChild(removeLastBtn);
    actionsEl.appendChild(stepBtn);
    actionsEl.appendChild(runBtn);
  }

  function showResultActions(buttons) {
    actionsEl.innerHTML = '';
    buttons.forEach((b) => actionsEl.appendChild(b));
  }

  // saveDraft(): 命令列を変える全ての入口から呼ぶ、下書き保存の唯一の入口（Issue #556）。
  // 実行中は命令列が変わらないので、再読込しても実行前の列が残る。空の箱は保存しない。
  function saveDraft() {
    local.failMark = -1; // 列が動いたら、失敗の強調（添字）は外す（#545）
    if (isTrial()) return;
    writeDraft(S.lesson.lessonId, step.stepId, local.commands.filter((c) => !(c.box && c.box.length === 0) && !(c.then && c.then.length === 0)));
  }

  // resetToFresh(): 命令列をfreshCommands（なおす系は初期の「ずれた」列、それ以外は空）へ戻す。
  // クリア後のreplay・ステージ切替・離れるで呼ぶ。失敗後の「ためしなおす」は命令列を残すので
  // これを呼ばず releaseFailLock を使う（#545。以前は失敗後も必ずこれを呼んでいた。Issue #104）。
  // 参照(S.drafts)は保ったまま中身だけ入れ替える。
  function resetToFresh() {
    dropUndo(ctx);
    local.commands.length = 0;
    freshCommands.forEach((c) => local.commands.push({ ...c }));
    local.boxOpen = -1;
    local.lockedCount = 0;
    local.runStates = {};
    local.condSkipped = new Set(); // 飛ばしの灰色を消す（#291）
    S.drafts[step.stepId] = local.commands;
    saveDraft();
    local.fixOpened = false;
    local.locked = false;
    // 塗りの失敗は結果トーストを出さず resultShown だけ立てる。旧 showRestartCue が戻していた分を、ここで確実に戻す（#497）。
    local.resultShown = false;
  }

  // releaseFailLock(): 失敗後の「ためしなおす」。命令列と失敗の強調（failMark）は残し、
  // resetToFresh と同じ残存状態だけ初期化して編集可へ戻す（#545-9A）。
  function releaseFailLock() {
    dropUndo(ctx);
    local.boxOpen = -1;
    local.lockedCount = 0;
    local.runStates = {};
    local.condSkipped = new Set(); // 飛ばしの灰色を消す（#291）
    local.fixOpened = false;
    local.locked = false;
    local.resultShown = false;
  }

  // 失敗後の強調（#545）：最初に外れた命令（info.cmdIndex）の枠。再描画しても付け直す。
  function applyFailMark() {
    if (local.failMark < 0) return;
    queueEl.querySelector(`[data-index="${local.failMark}"]`)?.classList.add('ring-4', 'ring-amber-400', 'sk-cmd-fail');
  }

  // 末尾へ寄せる。列が折り返して1行ぶん(72px)しか見えないとき、末尾の空き枠が次の行へ回ると最新のチップが上へ外れるので、
  // 最新のチップが列の中に入るところまで戻す（Issue #615。空き枠が同じ行に残るときはそのまま両方見える）。
  function scrollQueueToEnd() {
    queueEl.scrollLeft = queueEl.scrollWidth;
    queueEl.scrollTop = queueEl.scrollHeight;
    const chips = queueEl.querySelectorAll(':scope > .command-chip');
    const last = chips[chips.length - 1];
    if (!last) return;
    const over = queueEl.getBoundingClientRect().top - last.getBoundingClientRect().top;
    if (over > 0) queueEl.scrollTop -= over;
  }

  // drawQueueFollowActive(): 実行中の再描画。再描画で戻るスクロール位置を復元し、今動いているチップを
  // 列の中央へ寄せる（Issue #393）。scrollIntoViewは使わず、queueElのscrollLeft/scrollTopだけを動かす。
  function drawQueueFollowActive() {
    const left = queueEl.scrollLeft;
    const top = queueEl.scrollTop;
    drawQueue();
    queueEl.scrollLeft = left;
    queueEl.scrollTop = top;
    const chip = queueEl.querySelector('.command-chip[data-active="true"]');
    if (!chip) return;
    const q = queueEl.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const chipX = c.left - q.left + queueEl.scrollLeft;
    const chipY = c.top - q.top + queueEl.scrollTop;
    queueEl.scrollLeft = chipX - (queueEl.clientWidth - c.width) / 2;
    queueEl.scrollTop = chipY - (queueEl.clientHeight - c.height) / 2;
  }

  function drawQueue() {
    renderCommandQueue(queueEl, {
      commands: local.commands,
      activeIndex: local.activeIndex,
      activeInner: local.activeInner,
      activeRound: local.activeRound,
      openIndex: local.boxOpen,
      condSkipped: local.condSkipped,
      removable: true,
      lockedCount: local.lockedCount,
      // 次の空き枠は常に出す（命令の置ける数に上限は無い。#615）。
      nextSlot: countChips(local.commands) + 1,
      onCondCycle: (i) => {
        if (local.running || local.stepping || local.locked || isLockedIndex(i, local.lockedCount)) {
          skipClickSfx();
          return;
        }
        const c = local.commands[i];
        if (!c || c.if === undefined) return;
        c.if = nextCondDir(c.if);
        saveDraft();
        drawQueue();
        updateControls();
      },
      onRemove: (i) => {
        if (local.running || local.stepping || local.locked || isLockedIndex(i, local.lockedCount)) return;
        if (isFix) local.fixOpened = true;
        local.commands.splice(i, 1);
        if (i === local.boxOpen) local.boxOpen = -1;
        else if (i < local.boxOpen) local.boxOpen -= 1;
        saveDraft();
        logEvent('undo', { index: i });
        playSfx('remove');
        drawQueue();
        updateControls();
        local.nudge?.poke();
      },
    });
    applyFailMark();
  }

  function updateControls() {
    // 取り消し札は、命令列が消した直後の状態から動いた（追加・実行・1コマなど）時点で破棄する。
    if (ctx.mut.undoSnap && (local.commands.length !== local.lockedCount || local.running || local.stepping || local.locked)) dropUndo(ctx);
    paletteEl.querySelectorAll('button:not([data-action="menu"])').forEach((b) => {
      b.disabled = local.running || local.stepping || local.locked;
    });
    // 「とめる」：残り回数が0なら無効。maxCommandsには数えないので、上限に達していても置ける（#395 段3）。
    const pausesLeft = maxPauses - local.commands.filter(isPause).length;
    const pauseBtn = paletteEl.querySelector('[data-action="pause"]');
    if (pauseBtn) pauseBtn.disabled = pausesLeft <= 0 || local.boxOpen >= 0 || local.running || local.stepping || local.locked;
    setPauseLeft(paletteEl, Math.max(0, pausesLeft));
    const isRetry = runBtn.dataset.action === 'retry';
    const hasEmptyBox = local.commands.some((c) => (c.box && c.box.length === 0) || (c.then && c.then.length === 0));
    runBtn.disabled = local.running || local.runCooldown || (!isRetry && (local.commands.length === 0 || hasEmptyBox));
    if (ctx.mut.boxBtn) ctx.mut.boxBtn.disabled = local.boxOpen >= 0 || local.running || local.stepping || local.locked;
    drawBoxBar();
    clearBtn.disabled = local.commands.length <= local.lockedCount || local.running || local.stepping || local.locked;
    removeLastBtn.disabled = local.commands.length <= local.lockedCount || local.running || local.stepping || local.locked;
    // 1コマ実行中はタップを続けられるよう有効のままにする。開始条件のみ命令0件で無効化する（Issue #111）。
    stepBtn.disabled = local.running || local.locked || (!local.stepping && local.commands.length === 0);
    // ロック中は命令列自体もぼかし、タップを受け付けないようにする（チップ×の誤タップ防止。Issue #106）。
    queueEl.classList.toggle('opacity-50', local.locked);
    queueEl.classList.toggle('pointer-events-none', local.locked);
  }

  // くりかえしの箱：はこ→方向タップで箱に入れる→回数ボタン(2→3→4→2)→とじる（Issue #66）。
  function closeBox() {
    if (local.boxOpen < 0) return;
    // 空の箱は残さない。
    const open = local.commands[local.boxOpen];
    if ((open.box ?? open.then).length === 0) local.commands.splice(local.boxOpen, 1);
    local.boxOpen = -1;
    saveDraft();
  }
  // 箱を開いている間は、操作行を「けす・かいすう・とじる」に差し替える（盤面の高さを削らないため。
  // ぜんぶ・1コマ・じっこうは箱を閉じるまで使えない）。
  const timesBtn = document.createElement('button');
  timesBtn.type = 'button';
  timesBtn.dataset.action = 'box-times';
  timesBtn.className =
    'min-w-[64px] min-h-[64px] px-3 rounded-lg bg-amber-400 text-white text-sm font-bold whitespace-nowrap break-keep transition-transform duration-100 active:scale-95 disabled:opacity-40';
  timesBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.boxOpen < 0) {
      skipClickSfx();
      return;
    }
    vibrate();
    const box = local.commands[local.boxOpen];
    box.times = box.times >= 4 ? 2 : box.times + 1;
    saveDraft();
    drawQueue();
    updateControls();
  });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.action = 'box-close';
  closeBtn.textContent = 'とじる';
  closeBtn.className =
    'btn-tactile px-4 bg-emerald-500 text-white text-lg font-bold whitespace-nowrap break-keep disabled:opacity-40';
  closeBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked) {
      skipClickSfx();
      return;
    }
    vibrate();
    closeBox();
    drawQueue();
    updateControls();
  });
  function drawBoxBar() {
    if (local.boxOpen < 0) {
      if (ctx.mut.boxActionsShown) {
        ctx.mut.boxActionsShown = false;
        showNormalActions();
      }
      return;
    }
    const open = local.commands[local.boxOpen];
    const isCond = open.then !== undefined;
    if (!isCond) timesBtn.textContent = `かいすう ×${open.times}`;
    // 条件カードの開閉でも操作行を作り直す（回数ボタンを出さない）。
    if (ctx.mut.boxActionsShown && ctx.mut.boxActionsCond === isCond) return;
    ctx.mut.boxActionsShown = true;
    ctx.mut.boxActionsCond = isCond;
    showResultActions(isCond ? [removeLastBtn, closeBtn] : [removeLastBtn, timesBtn, closeBtn]);
  }

  ctx.fn.saveDraft = saveDraft;
  ctx.fn.resetToFresh = resetToFresh;
  ctx.fn.releaseFailLock = releaseFailLock;
  ctx.fn.applyFailMark = applyFailMark;
  ctx.fn.scrollQueueToEnd = scrollQueueToEnd;
  ctx.fn.drawQueue = drawQueue;
  ctx.fn.drawQueueFollowActive = drawQueueFollowActive;
  ctx.fn.updateControls = updateControls;
  ctx.fn.closeBox = closeBox;
  ctx.fn.showNormalActions = showNormalActions;
  ctx.fn.showResultActions = showResultActions;
}

// 編集ボタン（１つけす・ぜんぶけす・もとにもどす・はこ）のクリックを結ぶ。setupQueue の後、パレット描画の後に呼ぶ。
export function bindEditButtons(ctx) {
  const { step, local, isFix, paletteEl, removeLastBtn, clearBtn, undoBtn } = ctx;
  const { saveDraft, drawQueue, updateControls, scrollQueueToEnd } = ctx.fn;

  if (step.repeatBox) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.dataset.action = 'box-open';
    openBtn.className =
      'command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-amber-500 text-white disabled:opacity-40';
    openBtn.innerHTML = '<span class="text-xl leading-none" aria-hidden="true">🔁</span><span class="text-sm whitespace-nowrap">はこ</span>';
    openBtn.addEventListener('click', () => {
      if (local.running || local.stepping || local.locked || local.boxOpen >= 0) {
        skipClickSfx();
        return;
      }
      vibrate();
      local.commands.push({ box: [], times: 2 });
      local.boxOpen = local.commands.length - 1;
      saveDraft();
      drawQueue();
      scrollQueueToEnd();
      updateControls();
      local.nudge?.poke();
    });
    ctx.mut.boxBtn = openBtn;
    paletteEl.appendChild(openBtn);
  }

  if (step.condBlock) {
    const condBtn = document.createElement('button');
    condBtn.type = 'button';
    condBtn.dataset.action = 'cond-open';
    condBtn.className =
      'col-span-full command-btn btn-tactile flex flex-col items-center justify-center gap-1 px-3 py-2 bg-violet-500 text-white disabled:opacity-40';
    condBtn.innerHTML = '<span class="text-xl leading-none" aria-hidden="true">👀</span><span class="text-sm whitespace-nowrap">もし</span>';
    condBtn.addEventListener('click', () => {
      if (local.running || local.stepping || local.locked || local.boxOpen >= 0) {
        skipClickSfx();
        return;
      }
      vibrate();
      local.commands.push({ if: 'right', then: [] });
      local.boxOpen = local.commands.length - 1;
      saveDraft();
      drawQueue();
      scrollQueueToEnd();
      updateControls();
      local.nudge?.poke();
    });
    ctx.mut.boxBtn = condBtn;
    paletteEl.appendChild(condBtn);
  }

  removeLastBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.commands.length <= local.lockedCount) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    const i = local.commands.length - 1;
    const last = local.commands[i];
    const lastInner = last.box ?? last.then;
    if (lastInner) {
      // 開いている箱（条件カード）は中の最後の1個、閉じた箱は箱ごと消す。空になった箱も消す。
      if (local.boxOpen === i && lastInner.length > 0) lastInner.pop();
      else local.commands.splice(i, 1);
      if (local.boxOpen === i && !local.commands[i]) local.boxOpen = -1;
      saveDraft();
      logEvent('undo', { index: i });
      playSfx('remove');
      drawQueue();
      updateControls();
      local.nudge?.poke();
      return;
    }
    // まとめられたチップ（times>1）は1回分だけ減らす。1の時だけチップごと消す（Issue #97）。
    if (last.times > 1) last.times -= 1;
    else local.commands.splice(i, 1);
    saveDraft();
    logEvent('undo', { index: i });
    playSfx('remove');
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });

  clearBtn.addEventListener('click', () => {
    if (local.running || local.stepping || local.locked || local.commands.length <= local.lockedCount) return;
    vibrate();
    if (isFix) local.fixOpened = true;
    logEvent('undo', { all: true, commandCount: local.commands.length - local.lockedCount });
    // 参照を維持したまま空にする（S.drafts[step.stepId]との共有を切らないため。Issue #95）。
    // 止まった間は後ろだけ消す（前の部分は変更不可。#395 段2）。
    const snap = snapshotUnlocked(local.commands, local.lockedCount);
    clearUnlocked(local.commands, local.lockedCount);
    local.boxOpen = -1;
    saveDraft();
    playSfx('reset');
    drawQueue();
    showUndo(ctx, snap);
    updateControls();
    local.nudge?.poke();
  });

  undoBtn.addEventListener('click', () => {
    if (!ctx.mut.undoSnap || local.running || local.stepping || local.locked) {
      skipClickSfx();
      return;
    }
    vibrate();
    // 同じ配列へ戻す（S.drafts[step.stepId]との共有参照を保つ）。
    restoreUnlocked(local.commands, ctx.mut.undoSnap, local.lockedCount);
    saveDraft();
    dropUndo(ctx);
    drawQueue();
    updateControls();
    local.nudge?.poke();
  });
}
