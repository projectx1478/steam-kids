// 子ども向け確認ダイアログ（もどる・えらぶ がめんへ用）。window.confirmは使わない
// 自作モーダル。48px以上のボタン2つのみ（Issue #93）。
import { vibrate } from './ui-commands.js';

// showConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm }) -> void
export function showConfirmDialog({ message, confirmLabel = 'もどる', cancelLabel = 'つづける', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4';

  const panel = document.createElement('div');
  panel.className = 'bg-white rounded-2xl shadow-lg p-4 flex flex-col items-center gap-3 max-w-xs w-full';
  overlay.appendChild(panel);

  const msg = document.createElement('p');
  msg.className = 'text-lg text-center';
  msg.textContent = message;
  panel.appendChild(msg);

  const row = document.createElement('div');
  row.className = 'flex gap-2 w-full';
  panel.appendChild(row);

  function close() {
    overlay.remove();
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.dataset.action = 'confirm-cancel';
  cancelBtn.textContent = cancelLabel;
  cancelBtn.className = 'flex-1 min-h-[48px] rounded-lg bg-slate-200 text-slate-700 font-bold transition-transform duration-100 active:scale-95';
  cancelBtn.addEventListener('click', () => {
    vibrate();
    close();
  });
  row.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.dataset.action = 'confirm-ok';
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = 'flex-1 min-h-[48px] rounded-lg bg-sky-500 text-white font-bold transition-transform duration-100 active:scale-95';
  confirmBtn.addEventListener('click', () => {
    vibrate();
    close();
    onConfirm();
  });
  row.appendChild(confirmBtn);

  document.body.appendChild(overlay);
}
