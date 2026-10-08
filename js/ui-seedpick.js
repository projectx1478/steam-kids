// seedPickステップ（れんしゅうのたねコード入力。Issue #69）。8種の絵から4マスをタップだけで埋める。
// 操作画面（play）には置かず、専用の入力画面にする。コードが4マス揃うと「スタート」が押せる。
import { S } from './state.js';
import { CODE_LENGTH, PICTURES, PICTURE_COUNT, randomCode } from './seed-code.js';
import { createPrimaryButton, goToStep } from './ui-step.js';

export function renderSeedPick(root, step) {
  // 空きマスは''。「ちがう マップ」・summaryからの戻りで渡されたコードがあれば初期値にする。
  const slots = S.seedDraft ? [...S.seedDraft] : Array(CODE_LENGTH).fill('');
  S.seedDraft = null;
  let cursor = Math.max(0, slots.indexOf(''));
  if (slots.every((d) => d !== '')) cursor = 0;

  const question = document.createElement('p');
  question.className = 'status-bar text-center text-xl font-bold my-3'; // allow-component:screen たねえらびの問い文で、操作画面の枠（盤面・パネル）ではないため対象外
  question.textContent = step.text;
  root.appendChild(question);

  const slotRow = document.createElement('div');
  slotRow.className = 'seed-slots flex justify-center gap-2 my-3';
  root.appendChild(slotRow);

  const palette = document.createElement('div');
  palette.className = 'seed-palette grid grid-cols-4 gap-2 justify-items-center my-3';
  root.appendChild(palette);

  const startBtn = createPrimaryButton('スタート', () => {
    S.seed = slots.join('');
    // 別のマップへ替えた時に、前のマップの命令列の下書きが残らないようにする。
    S.drafts = {};
    goToStep(S.stepIndex + 1);
  }, 'start');

  function draw() {
    slotRow.innerHTML = '';
    slots.forEach((digit, i) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.dataset.slot = String(i);
      if (digit !== '') slot.dataset.picture = digit;
      slot.className = `seed-slot btn-tactile w-16 h-16 p-1 rounded-xl border-4 bg-white ${
        i === cursor ? 'border-sky-400' : 'border-slate-200'
      }`;
      slot.innerHTML = digit === '' ? '' : PICTURES[Number(digit)].svg;
      slot.addEventListener('click', () => {
        cursor = i;
        draw();
      });
      slotRow.appendChild(slot);
    });
    startBtn.disabled = slots.some((d) => d === '');
    startBtn.classList.toggle('opacity-40', startBtn.disabled);
  }

  for (let d = 0; d < PICTURE_COUNT; d += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.pictureBtn = String(d);
    btn.setAttribute('aria-label', PICTURES[d].name);
    btn.className = 'seed-picture btn-tactile w-16 h-16 p-1 rounded-xl bg-white border-2 border-slate-200';
    btn.innerHTML = PICTURES[d].svg;
    btn.addEventListener('click', () => {
      slots[cursor] = String(d);
      const next = slots.indexOf('');
      cursor = next === -1 ? Math.min(cursor + 1, CODE_LENGTH - 1) : next;
      draw();
    });
    palette.appendChild(btn);
  }

  root.appendChild(startBtn);
  const randomBtn = createPrimaryButton('ちがう マップ', () => {
    [...randomCode()].forEach((d, i) => {
      slots[i] = d;
    });
    cursor = 0;
    draw();
  }, 'random-code');
  randomBtn.className = randomBtn.className.replace('bg-sky-500', 'bg-amber-500');
  root.appendChild(randomBtn);
  draw();
}
