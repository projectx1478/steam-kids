// dashboard.htmlの保護者ゲート（#auth-gate）描画・初回設定フロー。Issue #37。
// 子ども画面(index.html)の歯車リンクから無認証でダッシュボードへ入れ、呼び名編集・同期操作・
// リンクコード発行/入力まで子どもが実行できてしまう不備への対応。
// kids-playerの管理画面ゲート（admin-auth.js）のbfcache対策に準拠する。
import { hasPasscode, setPasscode, verifyPasscode, isUnlocked, markUnlocked, lock, MIN_LENGTH } from './guardian.js';

export function initGate({ onUnlock }) {
  const gate = document.getElementById('auth-gate');
  const app = document.getElementById('dashboard-app');
  const setupForm = document.getElementById('gate-setup');
  const loginForm = document.getElementById('gate-login');

  function showApp() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
  }

  function showGate() {
    app.classList.add('hidden');
    gate.classList.remove('hidden');
    if (hasPasscode()) {
      setupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
    } else {
      loginForm.classList.add('hidden');
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
  };

  document.getElementById('gate-login-submit').onclick = async () => {
    const status = document.getElementById('gate-login-status');
    const input = document.getElementById('gate-login-passcode');
    const ok = await verifyPasscode(input.value);
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
