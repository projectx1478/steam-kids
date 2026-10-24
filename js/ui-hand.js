// 指アニメーションガイド（ノンバーバル）。文字を読ませず、動かす方向を指アイコンで示す。
// 実際のDOM操作（フォーカス・クリック処理）には関与しない、見た目だけのオーバーレイ
// （fixed配置でdocument.bodyに追加。#stageの再描画に巻き込まれないため、消す責務は
// 呼び出し側＝js/ui-step.jsのsetActiveHandHintに集約する。Issue #95）。
import { prefersReducedMotion } from './ui-grid.js';

const FADE_MS = 300;

function fingerSvg() {
  return `<svg viewBox="0 0 24 24" class="w-7 h-7 text-slate-800 drop-shadow" fill="currentColor" aria-hidden="true">
    <path d="M9 2a2 2 0 0 1 2 2v7h1V6a2 2 0 1 1 4 0v5h1V8a2 2 0 1 1 4 0v6c0 4-3 7-7 7h-1c-3 0-5-1-6-3l-3-5a2 2 0 0 1 3-2.5L9 12V4a2 2 0 0 1 0-2Z"/>
  </svg>`;
}

// showHandHint({ from, to, mode }) -> { remove() }
// from: 指し示す要素（必須）。mode:'tap'はfrom上で指が弾む。mode:'drag'はfromからtoへ
// 指が往復し、to上にghost-slot（配置先の枠）を重ねる。どちらもprefers-reduced-motion時は
// アニメーションせず静止表示になる（tailwind.src.cssの@media guard）。
export function showHandHint({ from, to, mode = 'tap' }) {
  if (!from || !from.isConnected) return { remove() {} };
  const rect = from.getBoundingClientRect();
  const hand = document.createElement('div');
  hand.className = 'hand-hint fixed z-40 pointer-events-none';
  hand.dataset.mode = mode;
  hand.innerHTML = fingerSvg();
  // 指はボタンの外側に置き、ボタンの絵・文字を隠さない（Issue #544）。既定は下辺の外（指先が上のボタンを指す）。
  // 下に画面の余白が無いときは右下の外。指アイコンは28px四方。
  const HAND = 28;
  let hx = rect.left + rect.width / 2 - HAND / 2;
  let hy = rect.bottom + 2;
  if (hy + HAND > window.innerHeight) {
    hx = rect.right + 2;
    hy = Math.min(rect.bottom - HAND / 2, window.innerHeight - HAND);
  }
  hand.style.left = `${hx}px`;
  hand.style.top = `${hy}px`;
  hand.dataset.place = hy >= rect.bottom ? 'below' : 'right';

  let slot = null;
  if (mode === 'drag' && to && to.isConnected) {
    const toRect = to.getBoundingClientRect();
    if (!prefersReducedMotion()) {
      const dx = toRect.left + 32 - (hx + HAND / 2);
      const dy = toRect.top + toRect.height / 2 - (hy + HAND / 2);
      hand.style.setProperty('--hand-dx', `${dx}px`);
      hand.style.setProperty('--hand-dy', `${dy}px`);
    }
    slot = document.createElement('div');
    slot.className = 'ghost-slot fixed z-30 pointer-events-none';
    slot.style.left = `${toRect.left}px`;
    slot.style.top = `${toRect.top}px`;
    slot.style.width = `${toRect.width}px`;
    slot.style.height = `${toRect.height}px`;
    document.body.appendChild(slot);
  }

  document.body.appendChild(hand);

  function remove() {
    hand.style.transition = `opacity ${FADE_MS}ms ease`;
    hand.style.opacity = '0';
    setTimeout(() => hand.remove(), FADE_MS);
    slot?.remove();
  }
  return { remove };
}
