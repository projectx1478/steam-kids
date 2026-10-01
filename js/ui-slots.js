// セーブスロット選択・上書き確認・名前入力（Issue #218）。名前は必ずtextContentで表示する。
import { SLOT_COUNT, loadSlots, readSlotSummary, resetSlot } from './storage.js';
import { displayName, normalizeName, clearCount, lastPlayed } from './slot-utils.js';
import { openParentalGate } from './ui-parental-gate.js';
import { vibrate } from './ui-commands.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function slotCard(slot, mode, units, occupied, onPick) {
  const btn = el('button', 'slot-card btn-tactile flex-1 min-h-[96px] flex flex-col items-center justify-center gap-1 px-3 py-3');
  btn.type = 'button';
  btn.dataset.action = 'slot-pick';
  btn.dataset.slot = String(slot);
  btn.dataset.occupied = String(occupied);
  if (occupied) {
    const { profile, events } = readSlotSummary(slot);
    btn.classList.add('bg-sky-500', 'text-white');
    btn.appendChild(el('span', 'slot-name text-xl font-bold', displayName(profile?.label, slot)));
    btn.appendChild(el('span', 'slot-clears text-base', `クリア ${clearCount(events, units)}`));
    const played = lastPlayed(events);
    if (played) btn.appendChild(el('span', 'slot-played text-sm', played));
  } else {
    btn.classList.add('bg-orange-500', 'text-white');
    btn.appendChild(el('span', 'text-lg font-bold', mode === 'new' ? 'あたらしく はじめる' : 'あき'));
    if (mode === 'continue') btn.disabled = true;
  }
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    vibrate();
    onPick(slot, occupied);
  });
  return btn;
}

// mode: 'new'（はじめから）／'continue'（つづきから）。
// onNew(slot): 新しく始める準備（空き枠、または上書き確認＋保護者ゲート通過後）ができた時。
// onContinue(slot): データのある枠を選んだ時。onBack(): もどる。
export function renderSlotSelect(stage, { mode, units, onNew, onContinue, onBack }) {
  stage.innerHTML = '';
  stage.dataset.screen = 'slots';

  const wrap = el('div', 'flex flex-col items-center justify-center gap-6 flex-1 wood-panel rounded-2xl py-8 px-4');
  wrap.appendChild(el('h1', 'text-2xl font-bold text-sky-700 text-child-title', 'だれが あそぶ？'));

  const row = el('div', 'flex gap-3 w-full max-w-xl');
  const { occupied } = loadSlots();
  const confirmSlot = (slot) => {
    const { profile } = readSlotSummary(slot);
    const overlay = el('div', 'fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center px-4');
    overlay.id = 'slot-overwrite-confirm';
    const card = el('div', 'bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4');
    card.appendChild(
      el('p', 'text-lg font-bold text-center', `${displayName(profile?.label, slot)}さんの データを けして、はじめから に しますか？`)
    );
    const erase = el('button', 'btn-tactile bg-rose-500 text-white text-lg px-6 py-3', 'けす');
    erase.type = 'button';
    erase.dataset.action = 'slot-erase';
    erase.addEventListener('click', async () => {
      erase.disabled = true;
      const ok = await openParentalGate({ cancellable: true });
      if (!ok) {
        erase.disabled = false;
        return;
      }
      resetSlot(slot);
      overlay.remove();
      onNew(slot);
    });
    const cancel = el('button', 'btn-tactile bg-slate-200 text-slate-700 text-lg px-6 py-3', 'やめる');
    cancel.type = 'button';
    cancel.dataset.action = 'slot-erase-cancel';
    cancel.addEventListener('click', () => overlay.remove());
    card.append(erase, cancel);
    overlay.appendChild(card);
    stage.appendChild(overlay);
  };

  for (let i = 0; i < SLOT_COUNT; i++) {
    row.appendChild(
      slotCard(i, mode, units, occupied[i], (slot, isOccupied) => {
        if (mode === 'continue') onContinue(slot);
        else if (isOccupied) confirmSlot(slot);
        else onNew(slot);
      })
    );
  }
  wrap.appendChild(row);

  const back = el('button', 'btn-tactile bg-slate-200 text-slate-700 text-base px-6 py-2', 'もどる');
  back.type = 'button';
  back.dataset.action = 'slot-back';
  back.addEventListener('click', onBack);
  wrap.appendChild(back);

  stage.appendChild(wrap);
}

// onSubmit(name): 整形済みの名前（空ならnull）。
export function renderNameEntry(stage, onSubmit) {
  stage.innerHTML = '';
  stage.dataset.screen = 'name';

  const wrap = el('div', 'flex flex-col items-center justify-center gap-6 flex-1 wood-panel rounded-2xl py-8 px-4');
  wrap.appendChild(el('h1', 'text-2xl font-bold text-sky-700 text-child-title', 'なまえを 入力してね'));

  const input = el('input', 'min-h-[64px] w-full max-w-xs px-4 rounded-xl border-2 border-sky-300 text-2xl text-center');
  input.type = 'text';
  input.id = 'name-input';
  input.maxLength = 10;
  input.autocomplete = 'off';
  wrap.appendChild(input);

  const submit = el('button', 'btn-tactile bg-orange-500 text-white text-xl px-8 py-3', 'けってい');
  submit.type = 'button';
  submit.dataset.action = 'name-submit';
  submit.addEventListener('click', () => {
    if (submit.disabled) return;
    submit.disabled = true;
    vibrate();
    onSubmit(normalizeName(input.value));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit.click();
  });
  wrap.appendChild(submit);

  stage.appendChild(wrap);
  input.focus();
}
