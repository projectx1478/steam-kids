// 確認ダイアログの共通部品（Issue #542 段1）。<dialog>要素は使わず、div の覆いを body に足す。
// 縦並び：上＝「続ける」側（大。240×72）、下＝「離れる」側（小。96×64）、間隔32px。
// 覆いのタップ＝「続ける」。文言は呼び出し側から渡す（部品は文言を持たない）。
// 用途：レッスンせんたくがめんへ離れる確認（ui-step.js）・ほごしゃの画面を開く確認（ui-menu.js）。
// 見本: review/design/557-549-542/mock/mock-360.png

import { vibrate } from './ui-commands.js';

// confirmDialog({ question, keepLabel, leaveLabel, onLeave, onKeep, overlayId, keepAction, leaveAction, leaveId, keepId })
// 戻り値: { close }（開いた確認を呼び出し側から閉じる。閉じ済みなら何もしない）。
export function confirmDialog({
  question,
  keepLabel,
  leaveLabel,
  onLeave,
  onKeep = () => {},
  overlayId,
  keepId,
  leaveId,
  keepAction,
  leaveAction,
}) {
  const overlay = document.createElement('div');
  if (overlayId) overlay.id = overlayId;
  overlay.className = 'leave-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.4)';

  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl shadow-xl p-4 text-center';
  card.style.cssText = 'max-width:90vw;max-height:95vh;display:flex;flex-direction:column;align-items:center;gap:32px';

  const msg = document.createElement('p');
  msg.className = 'text-xl font-bold text-slate-700';
  msg.textContent = question;

  const close = () => overlay.remove();

  const keep = document.createElement('button');
  keep.type = 'button';
  if (keepId) keep.id = keepId;
  if (keepAction) keep.dataset.action = keepAction;
  keep.className = 'btn-tactile bg-sky-500 text-white font-bold text-xl';
  keep.style.cssText = 'width:240px;max-width:100%;min-height:72px;height:72px';
  keep.textContent = keepLabel;
  keep.addEventListener('click', () => {
    vibrate();
    close();
    onKeep();
  });

  const leave = document.createElement('button');
  leave.type = 'button';
  if (leaveId) leave.id = leaveId;
  if (leaveAction) leave.dataset.action = leaveAction;
  leave.className = 'btn-tactile bg-slate-200 text-slate-700 font-bold text-base';
  leave.style.cssText = 'min-width:96px;min-height:64px;padding:0 16px';
  leave.textContent = leaveLabel;
  leave.addEventListener('click', () => {
    close();
    onLeave();
  });

  // 覆い（カードの外）のタップ＝「続ける」。
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) keep.click();
  });

  card.append(msg, keep, leave);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return { close };
}
