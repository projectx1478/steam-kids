// dashboard.htmlの保護者ゲート（#auth-gate）描画・初回設定フロー。Issue #37。
// 子ども画面(index.html)の歯車リンクから無認証でダッシュボードへ入れ、呼び名編集・同期操作・
// リンクコード発行/入力まで子どもが実行できてしまう不備への対応。
// kids-playerの管理画面ゲート（admin-auth.js）のbfcache対策に準拠する。
import {
  hasPasscode,
  setPasscode,
  verifyPasscode,
  verifyPasscodeAgainstServer,
  checkServerGuardianExists,
  registerServerPasscode,
  isUnlocked,
  markUnlocked,
  lock,
  MIN_LENGTH,
} from './guardian.js';
import { redeemLinkCode } from './sync.js';

const CODE_INVALID_CHARS_RE = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

export function initGate({ onUnlock }) {
  const gate = document.getElementById('auth-gate');
  const app = document.getElementById('dashboard-app');
  const setupForm = document.getElementById('gate-setup');
  const loginForm = document.getElementById('gate-login');
  const loginHint = document.getElementById('gate-login-hint');
  let remoteVerify = false;

  function showApp() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
  }

  // ローカルに合言葉未設定の端末は、サーバー側で既に他端末が設定済みか確認してから
  // 「設定」と「ログイン」のどちらを出すか決める(Issue #45)。オフライン・未確認時は
  // 従来どおり「設定」にフォールバックする。
  async function showGate() {
    app.classList.add('hidden');
    gate.classList.remove('hidden');
    if (hasPasscode()) {
      remoteVerify = false;
      setupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginHint.classList.add('hidden');
      return;
    }
    remoteVerify = await checkServerGuardianExists();
    if (remoteVerify) {
      setupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginHint.classList.remove('hidden');
    } else {
      loginForm.classList.add('hidden');
      loginHint.classList.add('hidden');
      setupForm.classList.remove('hidden');
    }
  }

  function relock() {
    lock();
    showGate();
  }

  // bfcache復元時（戻る操作等）はJSの状態（unlocked変数含む）がそのまま残るため、
  // 強制的にリロードして未ロック状態を作らない（kids-playerのadmin-auth.jsと同方式）。
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  // 空のunloadリスナーもkids-playerのadmin-auth.jsと同様に追加する
  // （ブラウザによってはunloadリスナーの有無がbfcache適格性に影響するため）。
  window.addEventListener('unload', () => {});
  // pageshow.persistedが発火しないブラウザ向けの保険。back_forwardナビゲーションなら
  // 念のためゲートを再表示する。
  try {
    const navEntries = performance.getEntriesByType('navigation');
    const navType = navEntries[0] && navEntries[0].type;
    if (navType === 'back_forward') relock();
  } catch {
    // Navigation Timing Level 2 未対応ブラウザ。既定のロック状態のまま進める。
  }

  document.getElementById('gate-setup-submit').onclick = async () => {
    const status = document.getElementById('gate-setup-status');
    const passcode = document.getElementById('gate-setup-passcode').value;
    const confirmValue = document.getElementById('gate-setup-confirm').value;
    if (passcode.length < MIN_LENGTH) {
      status.textContent = `合言葉は${MIN_LENGTH}文字以上にしてください`;
      return;
    }
    if (passcode !== confirmValue) {
      status.textContent = '確認用の合言葉が一致しません';
      return;
    }
    await setPasscode(passcode);
    markUnlocked();
    showApp();
    onUnlock();
    registerServerPasscode(passcode); // オンライン時のみサーバーへ伝播（Issue #38）。表示はブロックしない
  };

  // 2台目以降は、まだ同期未有効(state.enabled=false)のこの時点では#guardian/existsが
  // 判定できず「初回設定」しか出せない(Issue #45)。合言葉を決める前にリンクコードで
  // 先に接続できる入口をここに用意し、接続後にshowGate()を再実行して判定し直す。
  const linkToggleBtn = document.getElementById('gate-setup-link-toggle');
  const linkForm = document.getElementById('gate-setup-link-form');
  if (linkToggleBtn) {
    linkToggleBtn.onclick = () => linkForm.classList.toggle('hidden');
  }
  const linkCodeInput = document.getElementById('gate-setup-link-code');
  if (linkCodeInput) {
    linkCodeInput.addEventListener('input', () => {
      linkCodeInput.value = linkCodeInput.value.toUpperCase().replace(CODE_INVALID_CHARS_RE, '').slice(0, 6);
    });
  }
  document.getElementById('gate-setup-link-submit').onclick = async () => {
    const status = document.getElementById('gate-setup-link-status');
    const ok = await redeemLinkCode(linkCodeInput.value);
    if (!ok) {
      status.textContent = 'コードを確認してください';
      return;
    }
    status.textContent = '';
    await showGate(); // 接続成功。サーバー側の合言葉確認へ進む
  };

  document.getElementById('gate-login-submit').onclick = async () => {
    const status = document.getElementById('gate-login-status');
    const input = document.getElementById('gate-login-passcode');
    const ok = remoteVerify ? await verifyPasscodeAgainstServer(input.value) : await verifyPasscode(input.value);
    if (!ok) {
      status.textContent = '合言葉が違います';
      input.value = '';
      return;
    }
    status.textContent = '';
    markUnlocked();
    showApp();
    onUnlock();
  };

  const submitOnEnter = (inputId, btnId) => {
    document.getElementById(inputId).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById(btnId).click();
    });
  };
  submitOnEnter('gate-setup-confirm', 'gate-setup-submit');
  submitOnEnter('gate-setup-link-code', 'gate-setup-link-submit');
  submitOnEnter('gate-login-passcode', 'gate-login-submit');

  const lockBtn = document.getElementById('gate-lock-btn');
  if (lockBtn) lockBtn.onclick = relock;

  if (isUnlocked() && hasPasscode()) {
    showApp();
    onUnlock();
  } else {
    showGate();
  }
}
