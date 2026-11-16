// シーソーの find 面（つりあう置き方を find 個みつける。Issue #722）の「見つけた組」の列。
// 盤面の下（操作パネルのボタン行の上）に、見つけた組を小さい絵（ロボットの体数 × 目盛りの数字）で残す。
// まだ見つけていない分は点線の空き枠で出す（数だけ分かる。置き方は出さない）。同じ組は数えない。
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';

const ICON = 16;

// 1枚の札：ロボット（体数の数字の円）× 目盛りの数字。盤の上の数字の円・板の目盛りと同じ色・形にして、盤と結び付ける。
// 体数が多い面でもロボットを並べずに数字で出すので、360px幅でも3枚が1行に収まる（盤が途中で縮まない）。
function cardHtml(pos, robots) {
  return `<svg viewBox="0 0 64 64" width="${ICON}" height="${ICON}" aria-hidden="true">${shapeSvg('player')}</svg><span class="flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold text-white" style="background:#5b3a1a">${robots}</span><span class="text-sm font-bold text-amber-900" aria-hidden="true">×</span><span class="flex items-center justify-center w-6 h-6 rounded-md text-sm font-bold text-white" style="background:#b45309">${pos}</span>`;
}

// createFindStrip({ panel, before, find }) -> { add(pos, robots) → 'new'|'dup', count(), clear() }
export function createFindStrip({ panel, before, find }) {
  const el = document.createElement('div');
  el.className = 'flex flex-wrap items-center justify-center gap-1.5 shrink-0';
  el.dataset.foundList = '';
  el.setAttribute('role', 'list');
  panel.insertBefore(el, before);
  const keys = [];

  const cardClass = 'flex items-center gap-0.5 px-1 py-1 rounded-lg border-2 min-h-[36px]';
  function render(pulseKey) {
    el.innerHTML = '';
    keys.forEach((key) => {
      const [pos, robots] = key.split(':').map(Number);
      const card = document.createElement('div');
      card.className = `${cardClass} bg-amber-50 border-amber-400`;
      card.dataset.found = key;
      card.setAttribute('role', 'listitem');
      card.innerHTML = cardHtml(pos, robots);
      el.appendChild(card);
      if (key === pulseKey && !prefersReducedMotion() && card.animate) {
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
      }
    });
    for (let i = keys.length; i < find; i += 1) {
      const slot = document.createElement('div');
      slot.className = `${cardClass} border-dashed border-slate-300`;
      slot.style.minWidth = '56px';
      slot.dataset.foundSlot = '';
      el.appendChild(slot);
    }
  }
  render();
  return {
    // 新しい組なら追加して 'new'、既にある組なら数えずその札を光らせて 'dup'。
    add(pos, robots) {
      const key = `${pos}:${robots}`;
      const dup = keys.includes(key);
      if (!dup) keys.push(key);
      render(key);
      return dup ? 'dup' : 'new';
    },
    count: () => keys.length,
    clear() {
      keys.length = 0;
      render();
    },
  };
}
