// 錠を押したときの返事（Issue #742）。押した錠をゆらし、先に遊ぶレッスンを枠で光らせ、ことりが画面下で言う。
// 音は鳴らさない（錠は aria-disabled。initClickSfx は鳴らさない）。reduced-motion では揺れず枠だけ。
import { createFaceSvg } from './ui-bird.js';
import { prefersReducedMotion } from './ui-grid.js';

const HINT_TEXT = 'さきに ここを クリアしよう';
const RING = ['ring-4', 'ring-amber-400', 'ring-offset-2', 'motion-safe:animate-pulse'];
const RING_MS = 2000;
const BUBBLE_MS = 2500;

// showLockHint(lockBtn, targetBtn): targetBtn が無いとき（全クリア済みなど）は揺れと吹き出しだけ。
export function showLockHint(lockBtn, targetBtn) {
  if (!prefersReducedMotion()) {
    lockBtn.classList.remove('gate-shake');
    void lockBtn.offsetWidth;
    lockBtn.classList.add('gate-shake');
    setTimeout(() => lockBtn.classList.remove('gate-shake'), 300);
  }
  if (targetBtn) {
    targetBtn.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    targetBtn.classList.add(...RING);
    clearTimeout(targetBtn._lockHintTimer);
    targetBtn._lockHintTimer = setTimeout(() => targetBtn.classList.remove(...RING), RING_MS);
  }
  document.querySelector('[data-lock-hint]')?.remove();
  const bubble = document.createElement('div');
  bubble.dataset.lockHint = 'true';
  bubble.setAttribute('aria-live', 'polite');
  bubble.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:16px;z-index:50;pointer-events:none;display:flex;align-items:center;gap:8px;' +
    'padding:8px 12px;border-radius:1rem;background:#fff;border:2px solid #1d7f5e;font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;';
  const text = document.createElement('span');
  text.textContent = HINT_TEXT;
  bubble.append(createFaceSvg(), text);
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), BUBBLE_MS);
}
