// 保護者ゲート（dashboard.html）の合言葉管理。Issue #37・#38。
// 閲覧解錠はオフラインでも行えるよう、端末内のPBKDF2照合のみで判定する。
// 生の合言葉は保存せず、salt付きハッシュのみをlocalStorageへ置く。
// 同期系の特権操作（リンクコード発行）向けのサーバー発行トークン取得もここで扱う（Issue #38）。
import { SYNC_ENDPOINT } from './config.js';
import { loadSyncState } from './storage.js';
import { S } from './state.js';

const GUARDIAN_KEY = 'steamkids.guardian';
const PBKDF2_ITERATIONS = 200000;
const SALT_BYTES = 16;
export const MIN_LENGTH = 4;

// 解錠状態・直近の合言葉(平文)・サーバートークンはモジュールスコープの変数のみで保持する
// （localStorage/sessionStorageに置かない）。dashboard.htmlの読み込みごとにこのモジュールは
// 再初期化されfalseに戻るため、タブを閉じなくても「子ども画面へ戻ってダッシュボードへ入り直す」
// だけで再度ロックされる。
let unlocked = false;
let cachedPasscode = null;
let serverToken = null; // { token, exp }

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
  const ok = hashB64 === state.hashB64;
  // サーバートークン取得(ensureGuardianToken)を後から遅延実行できるよう、成功時のみ平文を
  // メモリに保持する。ネットワークはここでは呼ばない（オフライン解錠を妨げないため）。
  if (ok) cachedPasscode = passcode;
  return ok;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function deviceAuthHeader(state) {
  return `Bearer ${S.learnerId}.${state.syncSecret}`;
}

async function guardianRequest(method, path, body) {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret || !isOnline()) return null;
  const res = await fetch(`${SYNC_ENDPOINT}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: deviceAuthHeader(state),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) return null;
  return res.json();
}

async function postGuardian(path, body) {
  return guardianRequest('POST', path, body);
}

// ローカルに合言葉未設定の端末が「初回設定」画面に入る前に、サーバー側で既に他端末が
// 設定済みかどうかを確認する(Issue #45)。オフライン・通信失敗時はfalseを返し、
// 呼び出し元(ui-gate.js)は従来どおり初回設定画面にフォールバックする。
export async function checkServerGuardianExists() {
  try {
    const data = await guardianRequest('GET', '/guardian/exists');
    return Boolean(data && data.exists);
  } catch {
    return false;
  }
}

// ローカルに合言葉未設定の端末で、他端末が既に設定した合言葉をサーバー側(/guardian/auth)で
// 照合する(Issue #45)。成功したらローカルにもハッシュを保存し、以後この端末でもオフラインで
// 解錠できるようにする。
export async function verifyPasscodeAgainstServer(passcode) {
  if (!passcode) return false;
  try {
    const data = await guardianRequest('POST', '/guardian/auth', { passcode });
    if (data && typeof data.token === 'string' && typeof data.exp === 'number') {
      serverToken = { token: data.token, exp: data.exp };
      cachedPasscode = passcode;
      await setPasscode(passcode);
      return true;
    }
  } catch {
    // 通信失敗。解錠しない
  }
  return false;
}

// dashboard.htmlの初回設定(gate-setup-submit)からのみ呼ぶ想定。サーバー側は未設定時のみ
// passHashを保存するため、既に設定済みなら何もしない。失敗してもローカル層は既に有効なため
// エラーを表に出さず無視する。
export async function registerServerPasscode(passcode) {
  try {
    await postGuardian('/guardian/set', { passcode });
  } catch {
    // オフライン・通信失敗。ローカル層は既に成功しているため無視する
  }
}

// リンクコード発行など同期系の特権操作の直前に呼ぶ。キャッシュ済みの有効なトークンがあれば
// 再利用し、無ければ直近ログイン時の合言葉でサーバーへ問い合わせる。取得できなければnullを返し、
// 呼び出し元（sync.js）はトークン無しでリクエストしサーバー側の401に委ねる。
export async function ensureGuardianToken() {
  if (serverToken && serverToken.exp > Date.now()) return serverToken.token;
  serverToken = null;
  if (!cachedPasscode) return null;
  try {
    const data = await postGuardian('/guardian/auth', { passcode: cachedPasscode });
    if (data && typeof data.token === 'string' && typeof data.exp === 'number') {
      serverToken = { token: data.token, exp: data.exp };
      return serverToken.token;
    }
  } catch {
    // 通信失敗。トークン無しで続行する
  }
  return null;
}

// 現在の合言葉照合に成功した場合のみ変更する。エラーコードを返す（成功時はnull）。
export async function changePasscode(currentPasscode, newPasscode) {
  const ok = await verifyPasscode(currentPasscode);
  if (!ok) return 'wrong_current';
  if (!newPasscode || newPasscode.length < MIN_LENGTH) return 'too_short';
  await setPasscode(newPasscode);
  try {
    await postGuardian('/guardian/change', { current: currentPasscode, next: newPasscode });
  } catch {
    // オフライン・通信失敗。ローカル層の変更は既に成功しているため無視する
  }
  // passHashが変わり旧トークンはサーバー側で自動失効するため、キャッシュも破棄し次回取り直す
  cachedPasscode = newPasscode;
  serverToken = null;
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
  cachedPasscode = null;
  serverToken = null;
}
