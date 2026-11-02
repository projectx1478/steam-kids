// ui-play-fail.js: 操作画面（ui-play.js）の失敗演出・ためしなおす（Issue #663 段3）。
// setupFail(ctx) が startRunCooldown・showFailure・retryClick・leaveFailState を ctx.fn へ登録する。
// 変わる共有変数は ctx.mut（retryPulseTimer・runCooldownTimer）。必ず ctx.mut.x で読み書きする。
// 他ファイルの関数は ctx.fn（clearResult・drawBoard・resumeFromPause・queue の各関数）と
// ctx.local.restartFromStart 経由で、呼ぶ時点で引く（登録順に依存しない）。
import { S } from './state.js';
import { logEvent } from './events.js';
import { prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { setActiveAnimation } from './ui-step.js';
import { showHint, diagnose, clearResultBubble } from './ui-reaction.js';
import { nextFailHint } from './bird-phrases.js';
import { setRetryButton, createRetryChoice, shakeBoard } from './ui-retry.js';

// diagnose()の原因ごとの文言（20字以内・否定語なし。Issue #91）。
const HINT_MESSAGE = {
  wall: 'この めいれいで かべに ぶつかったよ',
  items: 'どんぐりが まだ のこって いるよ',
  goal: 'ゴールまで あと すこし',
  periodic: 'ドアが しまって いたよ',
};
// 失敗2回目に1回だけ小鳥のヒントを自動で足す（Issue #468 段2・#468-20A）。
const AUTO_HINT_AT = 2;
const FAR_GOAL_MESSAGE = 'ほかの みちも ためして みよう';
const NEAR_GOAL_DISTANCE = 2;
// 壁衝突の失敗後、「ためしなおす」をパルスで強調するまでの待ち（Issue #214）。
const RETRY_PULSE_DELAY_MS = 1200;
const RUN_COOLDOWN_MS = 500;

export function setupFail(ctx) {
  const { spec, bird, boardArea, runBtn, maxPauses, facts, failCounts, local } = ctx;

  // 実行が失敗したらrunBtn自体を橙色の「ためしなおす」に変える（目線を動かさずに押せる。Issue #91）。
  // 他のボタンをロックする間、押せるのはこれだけなのでパルス枠で目立たせる（Issue #106）。
  const RETRY_EMPHASIS_CLASSES = ['ring-4', 'ring-amber-300', 'ring-offset-2', 'motion-safe:animate-pulse'];
  // 壁衝突で付ける「ためしなおす」のパルス強調（retry-pulse。scale 1→1.08→1を2回。tailwind.src.css
  // 側はreduced-motionでは定義されない。Issue #214）。retry押下・モード遷移で未発火のタイマーは
  // 止めてクラスも外す。
  function pulseRetryButton() {
    ctx.mut.retryPulseTimer = null;
    if (prefersReducedMotion()) return;
    if (runBtn.dataset.action !== 'retry') return;
    runBtn.classList.remove('retry-pulse');
    void runBtn.offsetWidth;
    runBtn.classList.add('retry-pulse');
    runBtn.addEventListener('animationend', () => runBtn.classList.remove('retry-pulse'), { once: true });
  }
  function setRunButtonMode(mode) {
    setRetryButton(runBtn, mode, { runLabel: '▶\nじっこう', emphasis: RETRY_EMPHASIS_CLASSES });
    // 「ためしなおす」は6字で、text-sm だと 360px 幅の列からはみ出すため、失敗時だけ text-xs にする。
    runBtn.classList.toggle('text-xs', mode === 'retry');
    runBtn.classList.toggle('text-sm', mode !== 'retry');
  }

  // triggerFailFeedback(): 不正解時の視覚・聴覚フィードバック。派手な✕・警告音ではなく、
  // 盤面をやさしくゆらすアニメーションと効果音（未到達はtryAgain・取り残しはitemsLeft）で
  // 気づかせる（Issue #106・#158）。
  // reduced-motion時はゆらさず、盤面に0.5秒だけ枠を光らせて静止のまま気づけるようにする。
  // あわせて盤面のマスだけを暗くし（view.dim）、失敗リザルト状態を再スタート状態と
  // 見た目で区別する（ためしなおすのdrawBoard()が新しいview（dimは初期値=暗くなし）を
  // 作り直すため、明示的なdim(false)呼び出しは不要。Issue #110）。
  function triggerFailFeedback(reason) {
    playSfx(reason === 'items' ? 'itemsLeft' : 'tryAgain');
    local.view.dim(true);
    shakeBoard(boardArea);
  }

  // ためしなおす・replay の直後は約0.5秒じっこうを受け付けない（連打の取りこぼし防止。reduced-motion でも同じ。#545-8A）。
  function startRunCooldown() {
    local.runCooldown = true;
    clearTimeout(ctx.mut.runCooldownTimer);
    ctx.mut.runCooldownTimer = setTimeout(() => {
      ctx.mut.runCooldownTimer = null;
      local.runCooldown = false;
      ctx.fn.updateControls();
    }, RUN_COOLDOWN_MS);
  }

  // playRetryTransition(onDark, onDone): 失敗後のためしなおすで全画面の黒幕を挟む（Issue #136）。
  // 暗い間にonDark（盤面の作り直し）を行い、明けてからonDone（スタート！）を呼ぶ。暗転中は
  // 黒幕がタップを遮る。ステップ離脱時はsetActiveAnimation経由のcancelで黒幕ごと消す。
  function playRetryTransition(onDark, onDone) {
    if (prefersReducedMotion()) {
      onDark();
      onDone();
      return;
    }
    const curtain = document.createElement('div');
    curtain.dataset.transition = 'retry';
    curtain.className = 'fixed inset-0 z-40 bg-slate-900 pointer-events-auto';
    curtain.style.opacity = '0';
    curtain.style.transition = 'opacity 250ms ease-in-out';
    document.body.appendChild(curtain);
    void curtain.offsetWidth;
    curtain.style.opacity = '0.85';
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    later(() => onDark(), 250);
    later(() => {
      curtain.style.opacity = '0';
    }, 400);
    later(() => {
      curtain.remove();
      setActiveAnimation(null);
      onDone();
    }, 650);
    setActiveAnimation({
      cancel() {
        timers.forEach(clearTimeout);
        curtain.remove();
      },
    });
  }

  // showRetryChoice(): 失敗時の2ボタン。止まった地点(lockedCount>0)が無ければ「とちゅうから」はマスク。
  function showRetryChoice() {
    const { resumeBtn, restartBtn } = createRetryChoice({
      canResume: local.lockedCount > 0,
      onResume: ctx.fn.resumeFromPause,
      onRestart: restartAfterFail,
    });
    ctx.fn.showResultActions([resumeBtn, restartBtn]);
  }

  // leaveFailState(): 失敗の表示（ロック・トースト・2ボタン）を片付けて通常のボタン行へ戻す。
  function leaveFailState() {
    clearResultBubble(bird);
    local.locked = false;
    local.resultShown = false;
    ctx.fn.showNormalActions();
  }

  // restartAfterFail(): 失敗後、命令を残したまま盤面だけ最初に戻す（#395-8A）。
  function restartAfterFail() {
    if (local.running || local.stepping) return;
    vibrate();
    logEvent('retry', { mode: 'restart' });
    playRetryTransition(
      () => {
        leaveFailState();
        ctx.local.restartFromStart();
      },
      () => {
        local.view.popIn();
        local.nudge?.poke();
      }
    );
  }

  // showFailure(result): finishRun の失敗側。失敗の表示・診断・ヒントを出す。
  function showFailure(result) {
    // 「とめる」のあるステージは「ためしなおす」の代わりに2ボタン（とちゅうから／さいしょから。#395 段4）。
    if (maxPauses > 0) showRetryChoice();
    else setRunButtonMode('retry');
    local.locked = true;
    ctx.fn.updateControls();
    const info = diagnose(result, local.commands, spec);
    triggerFailFeedback(info.reason);
    const failKey = S.lesson.lessonId;
    const fails = (failCounts.get(failKey) ?? 0) + 1;
    failCounts.set(failKey, fails);
    if (info.reason === 'wall' || info.reason === 'periodic') {
      local.failMark = info.cmdIndex;
      ctx.fn.applyFailMark();
      // 動かせない球の手（最初にbumpedの手のrolls.stuck）は手前で止まるだけ。倒れも壁の印も出さない（#287。球の震えは ui-step.js）。
      const firstBump = result.bumped.findIndex(Boolean);
      const stuckBall = firstBump >= 0 && result.rolls?.[firstBump]?.stuck === true;
      if (!stuckBall) {
        local.view.markCell(info.cell, 'wall');
        // 壁衝突は横に倒れる演出で気づかせ、1.2秒後に「ためしなおす」をパルスで強調する（Issue #214）。
        local.view.fallOver();
      }
      ctx.mut.retryPulseTimer = setTimeout(pulseRetryButton, RETRY_PULSE_DELAY_MS);
    } else if (info.reason === 'paint') {
      // 塗りが目標と違う：画面は事実のみ（目標外を塗ったマスの枠。塗り残しは何も出さない。文言のヒントも出さない。Issue #286）。
      info.over.forEach((c) => local.view.markCell(c, 'wall'));
      local.resultShown = true;
      local.view.shrug();
      return;
    } else if (info.reason === 'items') {
      local.view.hintItems(info.remainingItems);
    } else {
      local.view.markCell(info.cell, 'stopped');
      local.view.markCell(spec.goal, 'goal-hint');
    }
    // 壁衝突時は倒れの演出と重なるため首かしげはしない（Issue #214）。
    if (info.reason !== 'wall' && info.reason !== 'periodic') local.view.shrug();
    local.resultShown = true;
    const far = info.reason === 'goal' && info.distance > NEAR_GOAL_DISTANCE;
    showHint(null, { bird, kind: info.reason, message: far ? FAR_GOAL_MESSAGE : HINT_MESSAGE[info.reason], restore: ctx.fn.clearResult, extra: fails === AUTO_HINT_AT && !spec.paint ? nextFailHint(facts) ?? undefined : undefined });
  }

  // retryClick(): runBtn が「ためしなおす」のときのクリック。処理したら true（呼び元は return する）。
  function retryClick() {
    if (runBtn.dataset.action !== 'retry') return false;
    if (ctx.mut.retryPulseTimer) {
      clearTimeout(ctx.mut.retryPulseTimer);
      ctx.mut.retryPulseTimer = null;
    }
    runBtn.classList.remove('retry-pulse');
    vibrate();
    logEvent('retry', {});
    playRetryTransition(
      () => {
        clearResultBubble(bird);
        setRunButtonMode('run');
        ctx.fn.releaseFailLock();
        local.runCooldown = true;
        ctx.fn.drawQueue();
        ctx.fn.drawBoard(spec.start);
        ctx.fn.updateControls();
      },
      () => {
        startRunCooldown();
        local.view.popIn();
        local.nudge?.poke();
      }
    );
    return true;
  }

  Object.assign(ctx.fn, { startRunCooldown, showFailure, retryClick, leaveFailState });
}
