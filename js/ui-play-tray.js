// ui-play-tray.js: 操作画面（ui-play.js）のどんぐりトレイ（Issue #110・#663 段1）。
// setupTray(ctx) が renderQuestion・fillNextAcornSlot・syncAcornTray を ctx.fn へ登録する。
// 残数の表示要素は ctx.mut.remainingEl（必ず ctx.mut.remainingEl で読み書きする）。
import { shapeSvg, prefersReducedMotion } from './ui-grid.js';
import { paintMiniBoard } from './gimmicks/paint.js';

export function setupTray(ctx) {
  const { spec, local, statusBar, screen } = ctx;

  // renderAcornTray(): どんぐりの残数を「空き枠が埋まる絵」で示す（Issue #110）。
  // data-remaining付きの数字は既存シナリオ（c1-goal-objective等）が読むためsr-onlyで残す
  // （見た目には出さない。sr-onlyは非表示ではないためinnerText()は値を返す）。
  function renderAcornTray() {
    const tray = document.createElement('div');
    tray.className = 'acorn-tray flex items-center justify-center gap-1';
    const filled = spec.items.length - local.remaining;
    for (let i = 0; i < spec.items.length; i += 1) {
      const slot = document.createElement('span');
      const isFilled = i < filled;
      slot.className = `acorn-slot inline-flex items-center justify-center w-5 h-5 rounded-full border-2 ${
        isFilled ? 'border-amber-500 bg-amber-50' : 'border-dashed border-amber-400/50'
      }`;
      if (isFilled) {
        slot.dataset.filled = 'true';
        slot.innerHTML = `<span class="w-3 h-3 inline-block">${shapeSvg('item')}</span>`;
      }
      tray.appendChild(slot);
    }
    statusBar.appendChild(tray);
    const srRemaining = document.createElement('span');
    srRemaining.className = 'sr-only';
    srRemaining.dataset.remaining = 'true';
    srRemaining.textContent = String(local.remaining);
    statusBar.appendChild(srRemaining);
    ctx.mut.remainingEl = srRemaining;
  }

  function renderQuestion() {
    screen.renderQuestion();
    if (spec.paint) statusBar.appendChild(paintMiniBoard(spec));
    if (spec.items.length > 0) {
      renderAcornTray();
    } else {
      ctx.mut.remainingEl = null;
    }
  }

  // fillNextAcornSlot(): どんぐりを1個拾うたびに、次の空き枠を埋める（spring-inで弾む。
  // reduced-motion時は演出なしで即座に埋まる。Issue #110）。
  function fillNextAcornSlot() {
    const slots = statusBar.querySelectorAll('.acorn-slot');
    const filledCount = spec.items.length - local.remaining;
    const slot = slots[filledCount - 1];
    if (!slot) return;
    slot.dataset.filled = 'true';
    slot.classList.remove('border-dashed', 'border-amber-400/50');
    slot.classList.add('border-amber-500', 'bg-amber-50');
    slot.innerHTML = `<span class="w-3 h-3 inline-block ${prefersReducedMotion() ? '' : 'spring-in'}">${shapeSvg('item')}</span>`;
  }

  // syncAcornTray(): local.remainingの値に合わせて、既存のどんぐり枠を（演出無しで）一括同期する。
  // drawBoard()のリセット時に使う（renderQuestion()が直前のlocal.remainingでトレイを作った後
  // なので、リセット後の値へ描き直す必要がある。Issue #110）。
  function syncAcornTray() {
    if (!ctx.mut.remainingEl) return;
    ctx.mut.remainingEl.textContent = String(local.remaining);
    const filled = spec.items.length - local.remaining;
    statusBar.querySelectorAll('.acorn-slot').forEach((slot, i) => {
      const isFilled = i < filled;
      if (isFilled) {
        slot.dataset.filled = 'true';
        slot.classList.add('border-amber-500', 'bg-amber-50');
        slot.classList.remove('border-dashed', 'border-amber-400/50');
        slot.innerHTML = `<span class="w-3 h-3 inline-block">${shapeSvg('item')}</span>`;
      } else {
        delete slot.dataset.filled;
        slot.classList.remove('border-amber-500', 'bg-amber-50');
        slot.classList.add('border-dashed', 'border-amber-400/50');
        slot.innerHTML = '';
      }
    });
  }

  ctx.fn.renderQuestion = renderQuestion;
  ctx.fn.fillNextAcornSlot = fillNextAcornSlot;
  ctx.fn.syncAcornTray = syncAcornTray;
}
