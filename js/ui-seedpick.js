// seedPickステップ（れんしゅうのばんごう入力。Issue #69・#398）。3桁の番号（000〜999）をテンキーで入れる。
// 操作画面（play）には置かず、専用の入力画面にする。3桁揃うと「スタート」が押せる。
// 「おまかせ」はテンキー右下。テンキーはこの画面だけの局所部品（docs/components.md の台帳に該当部品なし）。
import { S } from './state.js';
import { CODE_LENGTH, randomNumberCode } from './seed-code.js';
import { createPrimaryButton, goToStep } from './ui-step.js';

export function renderSeedPick(root, step) {
  // 空きマスは''。summaryの「おまかせ」で渡された番号があれば初期値にする。
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

  const keypad = document.createElement('div');
  keypad.className = 'seed-keypad grid grid-cols-3 gap-2 justify-items-center mx-auto my-3 w-fit';
  root.appendChild(keypad);

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
      if (digit !== '') slot.dataset.digit = digit;
      slot.className = `seed-slot btn-tactile w-16 h-16 rounded-xl border-4 bg-white text-3xl font-bold ${
        i === cursor ? 'border-sky-400' : 'border-slate-200'
      }`;
      slot.textContent = digit;
      slot.addEventListener('click', () => {
        cursor = i;
        draw();
      });
      slotRow.appendChild(slot);
    });
    startBtn.disabled = slots.some((d) => d === '');
    startBtn.classList.toggle('opacity-40', startBtn.disabled);
  }

  function keyButton(label, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `seed-key btn-tactile w-16 h-16 rounded-xl border-2 ${extraClass}`;
    btn.textContent = label;
    return btn;
  }

  function addDigitKey(d) {
    const btn = keyButton(String(d), 'bg-white border-slate-200 text-3xl font-bold');
    btn.dataset.key = String(d);
    btn.addEventListener('click', () => {
      slots[cursor] = String(d);
      const next = slots.indexOf('');
      cursor = next === -1 ? Math.min(cursor + 1, CODE_LENGTH - 1) : next;
      draw();
    });
    keypad.appendChild(btn);
  }

  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(addDigitKey);

  // けす：いま選んでいるマスが入っていればそのマス、空なら一つ前のマスを消す。
  const delBtn = keyButton('けす', 'bg-white border-slate-200 text-sm font-bold text-slate-700');
  delBtn.dataset.key = 'del';
  delBtn.addEventListener('click', () => {
    const target = slots[cursor] !== '' ? cursor : Math.max(0, cursor - 1);
    slots[target] = '';
    cursor = target;
    draw();
  });
  keypad.appendChild(delBtn);

  addDigitKey(0);

  const randomBtn = keyButton('おまかせ', 'bg-amber-500 border-amber-600 text-white text-sm font-bold');
  randomBtn.dataset.action = 'random-code';
  randomBtn.addEventListener('click', () => {
    [...randomNumberCode()].forEach((d, i) => {
      slots[i] = d;
    });
    cursor = 0;
    draw();
  });
  keypad.appendChild(randomBtn);

  root.appendChild(startBtn);
  draw();
}
