// 同期APIのクライアント層。仕様は docs/design-sync.md、Issue #21・#22。
// 同期はオプトイン。loadSyncState().enabled が false の端末は一切fetchしない。
import { SYNC_ENDPOINT } from './config.js';
import { S } from './state.js';
import { loadSyncState, saveSyncState, loadProfile, saveProfile, loadEvents, mergeAndSaveEvents } from './storage.js';
import { ensureGuardianToken } from './guardian.js';

const PUSH_BATCH_SIZE = 500;
// Workerの WORKER_VERSION（workers/steam-kids-sync/src/index.js）と同じ値にする。
// API仕様を変えるPRでは両方を必ず同時に更新する（Issue #29。運用ルールは docs/design-sync.md 参照）。
export const EXPECTED_WORKER_VERSION = 'steam-kids-sync-v2';

// ヘッダ無し（デプロイ前の旧Worker）も不一致として扱う。クライアント配信(GitHub Pages・自動)と
// Workerデプロイ(手動wrangler deploy)の非対称により「クライアントだけ新しい」状態を検知する。
function readWorkerVersionMismatch(res) {
  return res.headers.get('X-Worker-Version') !== EXPECTED_WORKER_VERSION;
}

function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function authHeader(state) {
  return `Bearer ${S.learnerId}.${state.syncSecret}`;
}

// サーバーのエラー応答（{ error: 'code_expired' }等）をUI表示用のコードとして取り出す。
// パース不能な場合はHTTPステータスへフォールバックする。
async function errorTag(res) {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ボディがJSONでない場合はステータスのみ使う
  }
  return `http_${res.status}`;
}

export function disable() {
  const state = loadSyncState();
  saveSyncState({ ...state, enabled: false });
}

export async function register() {
  const state = loadSyncState();
  const syncSecret = state.syncSecret || generateSecret();
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learnerId: S.learnerId, syncSecret }),
    });
    if (!res.ok) {
      saveSyncState({ ...state, syncSecret, lastError: await errorTag(res) });
      return false;
    }
    saveSyncState({ ...state, syncSecret, enabled: true, lastError: null, lastSyncedAt: Date.now() });
    return true;
  } catch {
    saveSyncState({ ...state, syncSecret, lastError: 'network_error' });
    return false;
  }
}

export async function push() {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret) return;

  const events = loadEvents().filter((e) => e.ts >= state.lastPushedTs);
  if (events.length === 0) return;

  let lastPushedTs = state.lastPushedTs;
  let workerVersionMismatch = state.workerVersionMismatch;
  for (let i = 0; i < events.length; i += PUSH_BATCH_SIZE) {
    const batch = events.slice(i, i + PUSH_BATCH_SIZE);
    try {
      const res = await fetch(`${SYNC_ENDPOINT}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(state) },
        body: JSON.stringify({ events: batch }),
      });
      workerVersionMismatch = readWorkerVersionMismatch(res);
      if (!res.ok) {
        saveSyncState({ ...state, lastPushedTs, workerVersionMismatch, lastError: await errorTag(res) });
        return;
      }
      lastPushedTs = Math.max(lastPushedTs, ...batch.map((e) => e.ts));
    } catch {
      saveSyncState({ ...state, lastPushedTs, workerVersionMismatch, lastError: 'network_error' });
      return;
    }
  }
  saveSyncState({ ...state, lastPushedTs, workerVersionMismatch, lastError: null, lastSyncedAt: Date.now() });
}

export async function pull() {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret) return;

  // 常に全件取得する（差分取得はしない）。他端末からのリンクコード乗り換えでこの学習者IDへ
  // 事後的に付け替わったイベントはtsが過去のままのため、tsベースの差分取得では以後
  // 二度と取得できなくなる(Issue #35)。イベント数は少ないため全件取得の負荷は無視できる。
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/sync?since=0`, {
      headers: { Authorization: authHeader(state) },
    });
    const workerVersionMismatch = readWorkerVersionMismatch(res);
    if (!res.ok) {
      saveSyncState({ ...state, workerVersionMismatch, lastError: await errorTag(res) });
      return;
    }
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length > 0) mergeAndSaveEvents(events);
    saveSyncState({ ...state, workerVersionMismatch, lastError: null, lastSyncedAt: Date.now() });
  } catch {
    saveSyncState({ ...state, lastError: 'network_error' });
  }
}

export async function issueLinkCode() {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret) return null;

  const guardianToken = await ensureGuardianToken();
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/link/issue`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(state),
        ...(guardianToken ? { 'X-Guardian-Token': guardianToken } : {}),
      },
    });
    if (!res.ok) {
      saveSyncState({ ...state, lastError: await errorTag(res) });
      return null;
    }
    const data = await res.json();
    saveSyncState({ ...state, lastError: null, lastSyncedAt: Date.now() });
    return data;
  } catch {
    saveSyncState({ ...state, lastError: 'network_error' });
    return null;
  }
}

export async function redeemLinkCode(code) {
  const state = loadSyncState();
  const syncSecret = state.syncSecret || generateSecret();

  try {
    const res = await fetch(`${SYNC_ENDPOINT}/link/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, syncSecret }),
    });
    if (!res.ok) {
      saveSyncState({ ...state, syncSecret, lastError: await errorTag(res) });
      return false;
    }
    const data = await res.json();
    saveProfile({ ...loadProfile(), learnerId: data.learnerId });
    S.learnerId = data.learnerId;
    // 乗り換え前のlastPushedTsを引き継ぐと、旧learnerIdの間に既に送信済みだったイベントのts境界が
    // そのまま残り、新learnerId側へ未送信のローカル履歴を送りそびれる可能性がある。0へリセットする。
    // pull()は常に全件取得のためlastPulledTsの概念はそもそも無い(Issue #35)。
    saveSyncState({
      ...state,
      syncSecret,
      enabled: true,
      lastPushedTs: 0,
      lastError: null,
      lastSyncedAt: Date.now(),
    });
    return true;
  } catch {
    saveSyncState({ ...state, syncSecret, lastError: 'network_error' });
    return false;
  }
}
