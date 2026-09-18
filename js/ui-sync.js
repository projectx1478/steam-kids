// dashboard.htmlの同期セクション描画。判定ロジックは持たず js/sync.js を呼ぶだけ。
import { register, issueLinkCode, redeemLinkCode, pull } from './sync.js';
import { loadSyncState } from './storage.js';

const CODE_INVALID_CHARS_RE = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
const REMAINING_UPDATE_MS = 30000;

const ERROR_LABELS = {
  code_expired: 'コードの きげんが きれています。もういちど はっこうしてください',
  code_already_used: 'この コードは もう つかわれています',
  code_not_found: 'コードが みつかりません',
  invalid_code: 'コードの けたすうが ちがいます',
  secret_conflict: 'べつの がくしゅうしゃに とうろくずみです',
  too_many_requests: 'すこし じかんを おいて ためしてください',
  network_error: 'つうしんに しっぱいしました',
};

function errorMessage(code) {
  if (!code) return '';
  return ERROR_LABELS[code] || 'つうしんに しっぱいしました';
}

function formatRemainingMinutes(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000));
}

function formatSyncedAt(ts) {
  if (!ts) return 'まだ どうき していません';
  const d = new Date(ts);
  return `さいごに どうき: ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBtn(label, action, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.action = action;
  btn.textContent = label;
  btn.className = 'min-w-[48px] min-h-[48px] px-4 rounded-lg bg-sky-500 text-white text-sm';
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

    root.appendChild(el('h2', 'text-lg font-bold text-slate-800 mb-2', 'たんまつの どうき'));
    root.appendChild(el('p', 'text-xs text-slate-500 mb-2', 'よびなは どうき されません'));

    const statusP = el('p', 'text-sm text-slate-600 mb-1', s.enabled ? 'どうき ゆうこう' : 'どうき むこう');
    statusP.id = 'sync-status';
    root.appendChild(statusP);

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
        createBtn('どうきを はじめる', 'sync-register', async () => {
          await register();
          draw();
        })
      );
    } else {
      const linkWrap = el('div', 'flex flex-col gap-2 mb-3');
      linkWrap.appendChild(
        createBtn('べつの タブレットと つなぐ', 'sync-issue-link', async () => {
          issuedCode = await issueLinkCode();
          draw();
        })
      );

      if (issuedCode) {
        const remaining = formatRemainingMinutes(issuedCode.expiresAt);
        const expired = remaining <= 0;
        const codeBox = el('div', 'p-2 rounded-lg bg-sky-50 text-center');
        codeBox.id = 'link-code-display';
        codeBox.dataset.expired = String(expired);
        codeBox.appendChild(el('p', 'text-2xl font-bold tracking-widest', issuedCode.code));

        const remainEl = el(
          'p',
          'text-xs text-slate-500',
          expired ? 'きげんぎれ。もういちど はっこうしてください' : `のこり ${remaining}ふん`
        );
        remainEl.id = 'link-code-remaining';
        codeBox.appendChild(remainEl);
        linkWrap.appendChild(codeBox);

        remainingIntervalId = setInterval(() => {
          const r = formatRemainingMinutes(issuedCode.expiresAt);
          const isExpired = r <= 0;
          codeBox.dataset.expired = String(isExpired);
          remainEl.textContent = isExpired ? 'きげんぎれ。もういちど はっこうしてください' : `のこり ${r}ふん`;
        }, REMAINING_UPDATE_MS);
      }

      root.appendChild(linkWrap);
    }

    const redeemWrap = el('div', 'flex flex-col gap-2');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'link-code-input';
    input.placeholder = 'コードを にゅうりょく';
    input.maxLength = 6;
    input.className =
      'min-h-[48px] w-full px-3 rounded-lg border border-slate-300 text-base tracking-widest text-center';
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(CODE_INVALID_CHARS_RE, '').slice(0, 6);
    });
    redeemWrap.appendChild(input);

    redeemWrap.appendChild(
      createBtn('コードを いれる', 'sync-redeem', async () => {
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
