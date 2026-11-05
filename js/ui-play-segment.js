// ui-play-segment.js: 操作画面（ui-play.js）の実行区間・「とめる」・実行ボタン（Issue #663 段4）。
// setupSegment(ctx) が resumeFromPause を ctx.fn へ、restartFromStart を ctx.local へ登録する。
// bindRunButtons(ctx) が runBtn・stepBtn の click を登録する（元の位置＝finishRun の後で呼ぶ）。
// 変わる共有変数は ctx.mut（remainingEl）。必ず ctx.mut.x で読み書きする。
// 他ファイルの関数は ctx.fn（drawBoard・finishRun・queue/fail/tray の各関数）を呼ぶ時点で引く。
import { logEvent } from './events.js';
import { vibrate, planRun, stepsBefore, isPause } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { createStepper, autoAdvance, setBackDisabled } from './ui-step.js';
import { clearResultBubble } from './ui-reaction.js';

// setupSegment が作る beginSegment・endSegment を bindRunButtons へ渡す（ctx の形は増やさない）。
const SEGMENTS = new WeakMap();

export function setupSegment(ctx) {
  const { spec, local } = ctx;

  // beginSegment(): 次の実行区間のstepperを作る。lockedCount=0なら盤面を最初に戻して先頭から、
  // 止まった間(lockedCount>0)は盤面を戻さず、止まった地点から後ろだけを次の「とめる」まで
  // （無ければ最後まで）動かす（#395 段2。「とめる」が無ければ従来どおり先頭から最後まで）。
  // replayTo（任意）：失敗後の「とちゅうから」で、先頭からこの「とめる」の添字まで再生し直して止まる。
  function beginSegment(replayTo = null) {
    const plan =
      replayTo === null
        ? planRun(local.commands, spec, local.lockedCount)
        : { nextPause: replayTo, startIndex: 0, stopIndex: stepsBefore(local.commands, spec, replayTo) };
    if (local.lockedCount === 0 || replayTo !== null) {
      ctx.fn.drawBoard(spec.start);
      local.runStates = {};
    }
    local.pendingPause = plan.nextPause;
    local.failMark = -1; // 実行を始めたら失敗の強調は消える（#545）
    local.condSkipped = new Set(); // 飛ばしの灰色も実行開始で消す（#291）
    local.stepper = createStepper(local.commands, spec, local.view, {
      startIndex: plan.startIndex,
      stopIndex: plan.stopIndex,
      runStates: local.runStates,
      onCondSkip: (chip) => {
        local.condSkipped.add(chip);
        ctx.fn.drawQueueFollowActive();
      },
      onTick: (i, _to, inner, round) => {
        local.activeIndex = i;
        local.activeInner = inner;
        // 周が変わるたびにstack音を鳴らす（2周目以降のみ。1周目は開始音と重なるため。Issue #167）。
        if (round !== local.activeRound) {
          if (round >= 1) playSfx('stack', { count: round + 1 });
          local.activeRound = round;
        }
        ctx.fn.drawQueueFollowActive();
      },
      onPickup: () => {
        local.remaining -= 1;
        if (ctx.mut.remainingEl) ctx.mut.remainingEl.textContent = String(local.remaining);
        ctx.fn.fillNextAcornSlot();
      },
    });
    return local.stepper;
  }

  // endSegment(stepper): 区間の終わり。「とめる」で止まったなら止まった状態へ、そうでなければ判定へ。
  function endSegment(stepper) {
    if (stepper.isPaused()) enterPause();
    else ctx.fn.finishRun(stepper.result);
  }

  // enterPause(): 盤面はそのまま、前の部分(「とめる」まで)を変更不可にして、後ろの編集を受け付ける。
  function enterPause() {
    local.running = false;
    local.stepping = false;
    local.stepper = null;
    setBackDisabled(false);
    local.lockedCount = local.pendingPause + 1;
    logEvent('pause', { count: local.commands.filter(isPause).length, index: local.pendingPause });
    local.activeIndex = -1;
    local.activeInner = -1;
    local.activeRound = -1;
    ctx.fn.drawQueue();
    ctx.fn.updateControls();
    local.nudge?.poke();
  }

  // restartFromStart(): 命令を残したまま盤面だけ最初に戻す（止まった地点→最初から。#395-8A。
  // 段4の「さいしょから」ボタンから呼ぶ）。
  function restartFromStart() {
    if (local.running || local.stepping) return;
    local.lockedCount = 0;
    local.runStates = {};
    local.pendingPause = -1;
    ctx.fn.drawBoard(spec.start);
    ctx.fn.drawQueue();
    ctx.fn.updateControls();
  }
  local.restartFromStart = restartFromStart;

  // resumeFromPause(): 失敗後、止まった地点まで盤面を再生し直して止まり、後ろの命令を直せる状態にする（#395-2A）。
  function resumeFromPause() {
    if (local.running || local.stepping || local.lockedCount <= 0) return;
    vibrate();
    const pauseIndex = local.lockedCount - 1;
    logEvent('pause_fix', { pauseIndex, commandCount: local.commands.length - local.lockedCount });
    ctx.fn.leaveFailState();
    local.running = true;
    local.nudge?.stop();
    local.runStates = {};
    ctx.fn.updateControls();
    const stepper = beginSegment(pauseIndex);
    autoAdvance(stepper, { onDone: () => endSegment(stepper) });
  }

  SEGMENTS.set(ctx, { beginSegment, endSegment });
  Object.assign(ctx.fn, { resumeFromPause });
}

export function bindRunButtons(ctx) {
  const { local, bird, runBtn, stepBtn } = ctx;
  const { beginSegment, endSegment } = SEGMENTS.get(ctx);

  runBtn.addEventListener('click', () => {
    if (ctx.fn.retryClick()) return;
    if (local.running) return;
    // 1コマ実行の途中でじっこうを押したら、進行中のstepperをそのまま残りだけ自動で進める（Issue #111）。
    if (local.stepping && local.stepper) {
      vibrate();
      local.running = true;
      ctx.fn.updateControls();
      const cur = local.stepper;
      autoAdvance(cur, { onDone: () => endSegment(cur) });
      return;
    }
    if (local.commands.length === 0) return;
    vibrate();
    ctx.fn.closeBox();
    if (local.commands.length === 0) return;
    local.running = true;
    local.nudge?.stop();
    clearResultBubble(bird);
    logEvent('run', { commandCount: local.commands.length });
    ctx.fn.updateControls();
    const stepper = beginSegment();
    playSfx('run');
    autoAdvance(stepper, { onDone: () => endSegment(stepper) });
  });

  // stepBtn: 1コマずつ実行。タップごとにstepperを1手だけ進める。最初のタップでstepperを
  // 作り、パレット・編集ボタン・←をロックする（じっこうと同じ扱い。Issue #111）。
  // 止まった間は止まった地点から後ろを1コマずつ進める。止まる前の部分でも従来どおり使える（#395-6B）。
  stepBtn.addEventListener('click', () => {
    if (local.running || local.locked) return;
    if (!local.stepping && local.commands.length === 0) return;
    vibrate();
    if (!local.stepping) {
      ctx.fn.closeBox();
      if (local.commands.length === 0) return;
      local.stepping = true;
      local.nudge?.stop();
      clearResultBubble(bird);
      logEvent('run', { commandCount: local.commands.length, mode: 'step' });
      playSfx('run');
      setBackDisabled(true);
      ctx.fn.updateControls();
      beginSegment();
    }
    const cur = local.stepper;
    cur.advance();
    if (cur.isDone() || cur.isPaused()) endSegment(cur);
  });
}
