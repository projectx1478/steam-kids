// dashboard.htmlの同期セクション描画。判定ロジックは持たず js/sync.js を呼ぶだけ。
// 保護者・教師が読む画面のため、子ども画面と異なりひらがな主体にしない（通常の大人向け表記）。
import { register, issueLinkCode, redeemLinkCode, pull, disable } from './sync.js';
import { loadSyncState, loadProfile } from './storage.js';

const CODE_INVALID_CHARS_RE = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
const REMAINING_UPDATE_MS = 30000;

const ERROR_LABELS = {
  code_expired: 'コードの有効期限が切れています。再発行してください',
  code_already_used: 'このコードは既に使用されています',
  code_not_found: 'コードが見つかりません',
  invalid_code: 'コードの桁数が正しくありません',
  secret_conflict: '別の学習者として登録済みです',
  too_many_requests: 'しばらく時間をおいて再試行してください',
  network_error: '通信に失敗しました',
};

function errorMessage(code) {
  if (!code) return '';
  return ERROR_LABELS[code] || '通信に失敗しました';
}

function formatRemainingMinutes(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000));
}

function formatSyncedAt(ts) {
  if (!ts) return '未同期';
  const d = new Date(ts);
  return `最終同期: ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function learnerIdSuffix() {
  const learnerId = loadProfile()?.learnerId;
  return learnerId ? learnerId.slice(-4) : '----';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBtn(label, action, onClick, className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.action = action;
  btn.textContent = label;
  btn.className = className || 'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-sky-500 text-white text-sm';
  btn.addEventListener('click', onClick);
  return btn;
}

export function renderSyncSection(root, { onChange } = {}) {
  let issuedCode = null;
  let remainingIntervalId = null;

  function stopRemainingInterval() {
    if (remainingIntervalId) clearInterval(remainingIntervalId);
    remainingIntervalId = null;
  }

  function draw() {
    stopRemainingInterval();
    const s = loadSyncState();
    root.innerHTML = '';
    root.dataset.enabled = String(s.enabled);

    root.appendChild(el('h2', 'text-lg font-bold text-slate-800 mb-2', '端末の同期'));
    root.appendChild(el('p', 'text-xs text-slate-500 mb-2', '呼び名は同期されません'));

    const statusRow = el('div', 'flex items-center justify-between mb-1');
    const statusP = el('p', 'text-sm text-slate-600', s.enabled ? '同期: 有効' : '同期: 無効');
    statusP.id = 'sync-status';
    statusRow.appendChild(statusP);
    if (s.enabled) {
      const idP = el('p', 'text-xs text-slate-400', `学習者ID: ****${learnerIdSuffix()}`);
      idP.id = 'sync-learner-id';
      statusRow.appendChild(idP);
    }
    root.appendChild(statusRow);

    const syncedP = el('p', 'text-xs text-slate-500 mb-2', formatSyncedAt(s.lastSyncedAt));
    syncedP.id = 'sync-last-synced';
    root.appendChild(syncedP);

    const message = errorMessage(s.lastError);
    const messageP = el('p', 'sync-message text-sm text-rose-700 mb-2', message);
    messageP.id = 'sync-message';
    messageP.dataset.kind = message ? 'error' : 'none';
    if (!message) messageP.classList.add('hidden');
    root.appendChild(messageP);

    if (!s.enabled) {
      root.appendChild(
        createBtn('同期を始める', 'sync-register', async () => {
          await register();
          draw();
          if (onChange) onChange();
        })
      );
    } else {
      const linkWrap = el('div', 'flex flex-wrap gap-2 mb-3');
      linkWrap.appendChild(
        createBtn('別のタブレットとつなぐ', 'sync-issue-link', async () => {
          issuedCode = await issueLinkCode();
          draw();
        })
      );
      linkWrap.appendChild(
        createBtn(
          '同期をやめる',
          'sync-disable',
          () => {
            disable();
            draw();
            if (onChange) onChange();
          },
          'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-slate-200 text-slate-700 text-sm'
        )
      );
      root.appendChild(linkWrap);

      if (issuedCode) {
        const remaining = formatRemainingMinutes(issuedCode.expiresAt);
        const expired = remaining <= 0;
        const codeBox = el('div', 'p-2 rounded-lg bg-sky-50 text-center mb-3');
        codeBox.id = 'link-code-display';
        codeBox.dataset.expired = String(expired);
        codeBox.appendChild(el('p', 'text-2xl font-bold tracking-widest', issuedCode.code));

        const remainEl = el(
          'p',
          'text-xs text-slate-500',
          expired ? '期限切れ。再発行してください' : `残り${remaining}分`
        );
        remainEl.id = 'link-code-remaining';
        codeBox.appendChild(remainEl);
        root.appendChild(codeBox);

        remainingIntervalId = setInterval(() => {
          const r = formatRemainingMinutes(issuedCode.expiresAt);
          const isExpired = r <= 0;
          codeBox.dataset.expired = String(isExpired);
          remainEl.textContent = isExpired ? '期限切れ。再発行してください' : `残り${r}分`;
        }, REMAINING_UPDATE_MS);
      }
    }

    const redeemWrap = el('div', 'flex flex-col gap-2');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'link-code-input';
    input.placeholder = 'コードを入力';
    input.maxLength = 6;
    input.className =
      'min-h-[48px] w-full px-3 rounded-lg border border-slate-300 text-base tracking-widest text-center';
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(CODE_INVALID_CHARS_RE, '').slice(0, 6);
    });
    redeemWrap.appendChild(input);

    redeemWrap.appendChild(
      createBtn('コードを入力', 'sync-redeem', async () => {
        const ok = await redeemLinkCode(input.value);
        if (ok) {
          await pull();
          draw();
          if (onChange) onChange();
          return;
        }
        draw();
      })
    );
    root.appendChild(redeemWrap);
  }

  draw();
}
