// 子ども画面の日次保護者ゲート（Issue #217）。openParentalGate()は他画面（上書き確認等）からも再利用する。
// 合言葉の保存・照合はguardian.jsを流用する（新しいハッシュ方式・保存キーは作らない）。
import {
  hasPasscode,
  setPasscode,
  verifyPasscode,
  verifyPasscodeAgainstServer,
  checkServerGuardianExists,
  registerServerPasscode,
  MIN_LENGTH,
} from './guardian.js';
import { isGatePassedToday, markGatePassedToday } from './gate-date.js';

const MAX_MISSES = 5;
const LOCK_SECONDS = 30;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function passInput(id, placeholder) {
  const input = el('input', 'min-h-[48px] w-full px-3 rounded-lg border border-slate-300 text-base mb-2');
  input.type = 'password';
  input.id = id;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  return input;
}

// 通過でtrue。日次ゲートは閉じる手段が無く、通過するまでPromiseは解決しない。
// cancellable=trueの時だけ「やめる」を置き、押すとfalseで解決する（上書き確認等。Issue #218）。
export async function openParentalGate({ cancellable = false } = {}) {
  const needSetup = !hasPasscode() && !(await checkServerGuardianExists());
  const remoteVerify = !hasPasscode() && !needSetup;

  return new Promise((resolve) => {
    const overlay = el('div', 'fixed inset-0 z-50 bg-slate-100 flex items-center justify-center px-4');
    overlay.id = 'parental-gate';
    const card = el('div', 'bg-white border border-slate-200 rounded-lg shadow-sm p-6 w-full max-w-sm');
    const status = el('p', 'text-sm text-center text-red-500 min-h-[1.25rem] mt-2');
    status.id = 'parental-gate-status';
    const submit = el('button', 'min-h-[48px] w-full bg-sky-600 text-white text-sm font-bold rounded-lg');
    submit.id = 'parental-gate-submit';
    submit.type = 'button';
    submit.dataset.mode = needSetup ? 'setup' : 'login';

    const finish = () => {
      markGatePassedToday();
      overlay.remove();
      resolve(true);
    };

    if (needSetup) {
      const input = passInput('parental-gate-passcode', `合言葉(${MIN_LENGTH}文字以上)`);
      const confirmInput = passInput('parental-gate-confirm', '確認のためもう一度');
      card.append(
        el('h1', 'text-lg font-bold text-slate-800 mb-1', '保護者の方へ：合言葉を設定してください'),
        el('p', 'text-sm text-slate-500 mb-4', `${MIN_LENGTH}文字以上。毎日はじめに入力します。`),
        input,
        confirmInput,
        submit,
        status
      );
      submit.textContent = '設定する';
      submit.onclick = async () => {
        if (input.value.length < MIN_LENGTH) {
          status.textContent = `合言葉は${MIN_LENGTH}文字以上にしてください`;
          return;
        }
        if (input.value !== confirmInput.value) {
          status.textContent = '確認用の合言葉が一致しません';
          return;
        }
        await setPasscode(input.value);
        registerServerPasscode(input.value); // オンライン時のみ。表示はブロックしない
        finish();
      };
      confirmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit.click();
      });
    } else {
      const input = passInput('parental-gate-passcode', '合言葉');
      card.append(el('h1', 'text-lg font-bold text-slate-800 mb-1', '保護者の方へ：合言葉を入力してください'));
      if (remoteVerify) {
        card.append(
          el('p', 'text-xs text-sky-700 mb-3', '他の端末で設定した合言葉を入力してください（オンラインでの確認が必要です）')
        );
      }
      card.append(input, submit, status);
      submit.textContent = '入る';
      let misses = 0;
      let locked = false;
      const startLock = () => {
        locked = true;
        submit.disabled = true;
        input.disabled = true;
        let remain = LOCK_SECONDS;
        status.textContent = `あと${remain}秒 入力できません`;
        const timer = setInterval(() => {
          remain -= 1;
          if (remain > 0) {
            status.textContent = `あと${remain}秒 入力できません`;
            return;
          }
          clearInterval(timer);
          locked = false;
          misses = 0;
          submit.disabled = false;
          input.disabled = false;
          status.textContent = '';
        }, 1000);
      };
      submit.onclick = async () => {
        if (locked) return;
        const ok = remoteVerify ? await verifyPasscodeAgainstServer(input.value) : await verifyPasscode(input.value);
        if (ok) {
          finish();
          return;
        }
        input.value = '';
        input.classList.remove('gate-shake');
        void input.offsetWidth; // 連続ミスでもアニメーションを再生し直す
        input.classList.add('gate-shake');
        misses += 1;
        if (misses >= MAX_MISSES) startLock();
        else status.textContent = '合言葉が違います';
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit.click();
      });
    }

    if (cancellable) {
      const cancel = el('button', 'min-h-[48px] w-full mt-2 text-sm text-slate-500 underline', 'やめる');
      cancel.id = 'parental-gate-cancel';
      cancel.type = 'button';
      cancel.onclick = () => {
        overlay.remove();
        resolve(false);
      };
      card.appendChild(cancel);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

// 起動時：当日未認証の場合のみゲートを出す。
export async function ensureDailyGate() {
  if (isGatePassedToday()) return;
  await openParentalGate();
}
