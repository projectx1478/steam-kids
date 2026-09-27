// 無操作時の促し（Issue #89）。やりかた帯（旧課題カードの説明表示）はIssue #97で
// 課題カード自体を廃止したため削除した。説明は「れんしゅう」画面と指ガイドで行う。
export const NUDGE_GLOW_CLASSES = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];

// createIdleNudge({ getTarget, delayMs, durationMs, maxCount }) -> { poke(), stop() }
// delayMs操作が無ければgetTarget()が返す要素を光らせ、durationMs後に消す。
// 光る回数はmaxCountまで（しつこくしないため）。poke()は操作があった時に呼び、
// タイマーをリセットし現在の点灯を消す。stop()はステップ離脱時・実行中に呼ぶ。
export function createIdleNudge({ getTarget, delayMs = 8000, durationMs = 3000, maxCount = 2 }) {
  let timer = null;
  let hideTimer = null;
  let count = 0;
  let activeEls = [];

  function clearHighlight() {
    activeEls.forEach((el) => {
      delete el.dataset.nudge;
      el.classList.remove(...NUDGE_GLOW_CLASSES);
    });
    activeEls = [];
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function fire() {
    const targets = getTarget();
    if (!targets || targets.length === 0) {
      // 実行中など対象が無い一時的な状態。回数は消費せず後で再試行する。
      arm();
      return;
    }
    count += 1;
    activeEls = targets;
    targets.forEach((el) => {
      el.dataset.nudge = 'true';
      el.classList.add(...NUDGE_GLOW_CLASSES);
    });
    hideTimer = setTimeout(() => {
      clearHighlight();
      arm(); // 無操作が続く限り、maxCountまでは自動で再武装する
    }, durationMs);
  }

  function arm() {
    if (timer) clearTimeout(timer);
    if (count >= maxCount) return;
    timer = setTimeout(fire, delayMs);
  }

  function poke() {
    clearHighlight();
    arm();
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    clearHighlight();
  }

  arm();
  return { poke, stop };
}
