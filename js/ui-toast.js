// 操作画面の結果表示（やったね／ヒント）を盤面に重ねず、専用スロット（1行の問い文を出している
// 場所）へ一時的に差し替えて見せる。盤面の上を覆わないための仕組み（Issue #97）。
// スロットは既定で問い文を表示しており、showToast()はそれを一時的に置き換えてdurationMs後に
// 自動でrestore()を呼ぶ（reduced-motion時は即座に、それ以外はopacityフェード後）。
import { prefersReducedMotion } from './ui-grid.js';

// el -> { gen, restore }。restoreは直近のshowToast呼び出しが渡したもので、明示的な
// clearToast(el)からも同じrestoreを呼べるように覚えておく（呼び出し側が毎回渡す必要をなくし、
// 「もういちど」等の即時クリアがdataset等の後始末を取りこぼすのを防ぐ）。
const STATE = new WeakMap();
const FADE_MS = 200;

function bumpGen(el, restore) {
  const gen = (STATE.get(el)?.gen ?? 0) + 1;
  STATE.set(el, { gen, restore: restore ?? STATE.get(el)?.restore });
  return gen;
}

// showToast(el, { render, durationMs = 3000, restore }): render(el)でelの中身を差し替える。
// durationMs後にrestore(el)を呼び元の表示へ戻す。呼び出し中に別のtoastやclearToast()が
// 入った場合は、古いタイマーによる巻き戻しを世代カウンタで無効化する。
export function showToast(el, { render, durationMs = 3000, restore }) {
  const gen = bumpGen(el, restore);
  el.innerHTML = '';
  render(el);
  const reduced = prefersReducedMotion();
  if (!reduced) {
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${FADE_MS}ms ease`;
      el.style.opacity = '1';
    });
  }
  setTimeout(() => {
    if (STATE.get(el)?.gen !== gen) return;
    if (reduced) {
      restore?.(el);
      return;
    }
    el.style.opacity = '0';
    setTimeout(() => {
      if (STATE.get(el)?.gen !== gen) return;
      restore?.(el);
      el.style.opacity = '1';
    }, FADE_MS);
  }, durationMs);
}

// clearToast(el): 保留中のタイマーを無効化し、直近のshowToast()が渡したrestore(el)を即座に呼ぶ
// （もういちど・編集などユーザーが先に操作した時に使う。呼び出し側でrestoreを覚えておく必要はない）。
// まだ一度もshowToast()が呼ばれていないelでは何もしない。
export function clearToast(el) {
  const restore = STATE.get(el)?.restore;
  bumpGen(el);
  el.style.opacity = '1';
  restore?.(el);
}
