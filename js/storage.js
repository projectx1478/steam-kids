// localStorage読み書きの薄い層。パース失敗・書き込み失敗（QuotaExceededError等）は
// 握りつぶし、子ども画面を落とさないことを最優先する。
import { mergeEvents } from './merge.js';

// セーブスロット（Issue #218）。スロット0（A）は従来のキーをそのまま使い、B/Cは
// `steamkids.s2.*`／`steamkids.s3.*`。events/profile/sync/tutorialDoneがスロット単位、
// guardian・gateDate・soundは端末単位。
export const SLOT_COUNT = 3;
const SLOTS_KEY = 'steamkids.slots';
const MAX_EVENTS = 5000;
let activeSlot = null;
const DEFAULT_SYNC_STATE = {
  enabled: false,
  syncSecret: null,
  lastPushedTs: 0,
  lastError: null,
  lastSyncedAt: null,
  workerVersionMismatch: false,
};

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
    // 容量超過等。書き込みを諦めるだけで例外を投げない。
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 無視（子ども画面を落とさない）
  }
}

function keyFor(base, slot) {
  return slot === 0 ? `steamkids.${base}` : `steamkids.s${slot + 1}.${base}`;
}

function isValidProfile(profile) {
  return Boolean(profile) && typeof profile.learnerId === 'string';
}

function isValidSyncState(state) {
  return Boolean(state) && typeof state === 'object';
}

function readEvents(slot) {
  const events = readJSON(keyFor('events', slot), []);
  return Array.isArray(events) ? events : [];
}

function readProfile(slot) {
  const profile = readJSON(keyFor('profile', slot), null);
  return isValidProfile(profile) ? profile : null;
}

function readSyncState(slot) {
  const state = readJSON(keyFor('sync', slot), null);
  return isValidSyncState(state) ? { ...DEFAULT_SYNC_STATE, ...state } : { ...DEFAULT_SYNC_STATE };
}

function isValidSlots(slots) {
  return (
    Boolean(slots) &&
    Number.isInteger(slots.active) &&
    slots.active >= 0 &&
    slots.active < SLOT_COUNT &&
    Array.isArray(slots.occupied) &&
    slots.occupied.length === SLOT_COUNT
  );
}

// 初回（steamkids.slots無し）は旧データの有無でスロットAの使用中を判定して保存する。
// events1件以上／呼び名あり／同期有効のどれにも当たらない自動生成profileは空き扱い。
export function loadSlots() {
  const stored = readJSON(SLOTS_KEY, null);
  if (isValidSlots(stored)) return { active: stored.active, occupied: stored.occupied.map(Boolean) };
  const profile = readProfile(0);
  const legacy =
    profile !== null && (Boolean(profile.label) || readEvents(0).length > 0 || readSyncState(0).enabled);
  const slots = { active: 0, occupied: [legacy, false, false] };
  writeJSON(SLOTS_KEY, slots);
  return slots;
}

export function saveSlots(slots) {
  writeJSON(SLOTS_KEY, slots);
}

export function getActiveSlot() {
  if (activeSlot === null) activeSlot = loadSlots().active;
  return activeSlot;
}

// persist=trueで次回起動時のアクティブスロットも切り替える。ダッシュボードのタブ切替は
// persist=falseにし、子どもが次に遊ぶスロットを変えない。
export function setActiveSlot(slot, { persist = false } = {}) {
  activeSlot = slot;
  if (persist) saveSlots({ ...loadSlots(), active: slot });
}

export function readSlotSummary(slot) {
  return { profile: readProfile(slot), events: readEvents(slot) };
}

function newProfile() {
  return { learnerId: crypto.randomUUID(), label: null, createdAt: Date.now() };
}

// 空きスロットを使用中にする。そのスロットに自動生成profileが残っていれば learnerId を引き継ぐ。
export function createSlot(slot, label = null) {
  const profile = { ...(readProfile(slot) ?? newProfile()), label };
  writeJSON(keyFor('profile', slot), profile);
  const slots = loadSlots();
  slots.occupied[slot] = true;
  saveSlots(slots);
  return profile;
}

// 使用中スロットを初期化して新しいlearnerIdで作り直す（上書き「はじめから」用）。他スロットには触れない。
export function resetSlot(slot) {
  removeKey(keyFor('events', slot));
  removeKey(keyFor('sync', slot));
  try {
    const prefix = keyFor('tutorialDone.', slot);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 無視
  }
  const profile = newProfile();
  writeJSON(keyFor('profile', slot), profile);
  const slots = loadSlots();
  slots.occupied[slot] = true;
  saveSlots(slots);
  return profile;
}

export function isTutorialDoneStored(lessonId) {
  try {
    return localStorage.getItem(keyFor(`tutorialDone.${lessonId}`, getActiveSlot())) === 'true';
  } catch {
    return false;
  }
}

export function markTutorialDoneStored(lessonId) {
  try {
    localStorage.setItem(keyFor(`tutorialDone.${lessonId}`, getActiveSlot()), 'true');
  } catch {
    // 容量超過等は無視（チュートリアル表示が続くだけで機能上は問題ない）
  }
}

export function loadEvents() {
  return readEvents(getActiveSlot());
}

export function appendEvent(event) {
  const events = loadEvents();
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  writeJSON(keyFor('events', getActiveSlot()), events);
}

export function loadProfile() {
  return readProfile(getActiveSlot());
}

export function saveProfile(profile) {
  writeJSON(keyFor('profile', getActiveSlot()), profile);
}

export function loadSyncState() {
  return readSyncState(getActiveSlot());
}

export function saveSyncState(state) {
  writeJSON(keyFor('sync', getActiveSlot()), state);
}

export function mergeAndSaveEvents(incoming, max = MAX_EVENTS) {
  const merged = mergeEvents(loadEvents(), incoming, max);
  writeJSON(keyFor('events', getActiveSlot()), merged);
  return merged;
}
