// 保護者ゲート（dashboard.html）の合言葉管理。Issue #37。
// 閲覧解錠はオフラインでも行えるよう、端末内のPBKDF2照合のみで判定する
// （同期系の特権操作へのサーバー発行トークンはIssue #38・未実装）。
// 生の合言葉は保存せず、salt付きハッシュのみをlocalStorageへ置く。
const GUARDIAN_KEY = 'steamkids.guardian';
const PBKDF2_ITERATIONS = 200000;
const SALT_BYTES = 16;
export const MIN_LENGTH = 4;

// 解錠状態はモジュールスコープの変数のみで保持する（localStorage/sessionStorageに置かない）。
// dashboard.htmlの読み込みごとにこのモジュールは再初期化されfalseに戻るため、
// タブを閉じなくても「子ども画面へ戻ってダッシュボードへ入り直す」だけで再度ロックされる。
let unlocked = false;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過等。書き込みを諦めるだけで例外を投げない（js/storage.jsと同方針）。
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveHash(passcode, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function loadGuardianState() {
  const state = readJSON(GUARDIAN_KEY, null);
  return state && typeof state.saltB64 === 'string' && typeof state.hashB64 === 'string' ? state : null;
}

export function hasPasscode() {
  return loadGuardianState() !== null;
}

export async function setPasscode(passcode) {
  if (!passcode || passcode.length < MIN_LENGTH) return false;
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hashB64 = await deriveHash(passcode, saltBytes);
  writeJSON(GUARDIAN_KEY, { saltB64: bytesToBase64(saltBytes), hashB64 });
  return true;
}

export async function verifyPasscode(passcode) {
  const state = loadGuardianState();
  if (!state || !passcode) return false;
  const hashB64 = await deriveHash(passcode, base64ToBytes(state.saltB64));
  return hashB64 === state.hashB64;
}

// 現在の合言葉照合に成功した場合のみ変更する。エラーコードを返す（成功時はnull）。
export async function changePasscode(currentPasscode, newPasscode) {
  const ok = await verifyPasscode(currentPasscode);
  if (!ok) return 'wrong_current';
  if (!newPasscode || newPasscode.length < MIN_LENGTH) return 'too_short';
  await setPasscode(newPasscode);
  return null;
}

export function isUnlocked() {
  return unlocked;
}

export function markUnlocked() {
  unlocked = true;
}

export function lock() {
  unlocked = false;
}
