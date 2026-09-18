// 同期APIのクライアント層。仕様は docs/design-sync.md、Issue #21。
// 同期はオプトイン。loadSyncState().enabled が false の端末は一切fetchしない。
import { SYNC_ENDPOINT } from './config.js';
import { S } from './state.js';
import { loadSyncState, saveSyncState, loadProfile, saveProfile, loadEvents, mergeAndSaveEvents } from './storage.js';

const PUSH_BATCH_SIZE = 500;

function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function authHeader(state) {
  return `Bearer ${S.learnerId}.${state.syncSecret}`;
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
      saveSyncState({ ...state, syncSecret, lastError: `register_failed_${res.status}` });
      return false;
    }
    saveSyncState({ ...state, syncSecret, enabled: true, lastError: null });
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
  for (let i = 0; i < events.length; i += PUSH_BATCH_SIZE) {
    const batch = events.slice(i, i + PUSH_BATCH_SIZE);
    try {
      const res = await fetch(`${SYNC_ENDPOINT}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(state) },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) {
        saveSyncState({ ...state, lastPushedTs, lastError: `push_failed_${res.status}` });
        return;
      }
      lastPushedTs = Math.max(lastPushedTs, ...batch.map((e) => e.ts));
    } catch {
      saveSyncState({ ...state, lastPushedTs, lastError: 'network_error' });
      return;
    }
  }
  saveSyncState({ ...state, lastPushedTs, lastError: null });
}

export async function pull() {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret) return;

  try {
    const res = await fetch(`${SYNC_ENDPOINT}/sync?since=${state.lastPulledTs}`, {
      headers: { Authorization: authHeader(state) },
    });
    if (!res.ok) {
      saveSyncState({ ...state, lastError: `pull_failed_${res.status}` });
      return;
    }
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length > 0) {
      mergeAndSaveEvents(events);
      const maxTs = Math.max(...events.map((e) => e.ts));
      saveSyncState({ ...state, lastPulledTs: maxTs, lastError: null });
    } else {
      saveSyncState({ ...state, lastError: null });
    }
  } catch {
    saveSyncState({ ...state, lastError: 'network_error' });
  }
}

export async function issueLinkCode() {
  const state = loadSyncState();
  if (!state.enabled || !state.syncSecret) return null;

  try {
    const res = await fetch(`${SYNC_ENDPOINT}/link/issue`, {
      method: 'POST',
      headers: { Authorization: authHeader(state) },
    });
    if (!res.ok) {
      saveSyncState({ ...state, lastError: `link_issue_failed_${res.status}` });
      return null;
    }
    const data = await res.json();
    saveSyncState({ ...state, lastError: null });
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
      saveSyncState({ ...state, syncSecret, lastError: `redeem_failed_${res.status}` });
      return false;
    }
    const data = await res.json();
    saveProfile({ ...loadProfile(), learnerId: data.learnerId });
    saveSyncState({ ...state, syncSecret, enabled: true, lastError: null });
    return true;
  } catch {
    saveSyncState({ ...state, syncSecret, lastError: 'network_error' });
    return false;
  }
}
