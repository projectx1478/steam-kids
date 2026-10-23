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
  removeKey(keyFor('lastHint', slot));
  try {
    const prefix = keyFor('tutorialDone.', slot);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 無視
  }
  try {
    const endSeenPrefix = keyFor('unitEndSeen.', slot);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(endSeenPrefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 無視
  }
  try {
    const resumePrefix = keyFor('resume.', slot);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(resumePrefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 無視
  }
  try {
    const draftPrefix = keyFor('draft.', slot);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(draftPrefix))
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

// レッスンの途中再開（Issue #242）。値は {stepId, ts} のみ。壊れた値・型違いは null。
export function readResume(lessonId) {
  const v = readJSON(keyFor(`resume.${lessonId}`, getActiveSlot()), null);
  return Boolean(v) && typeof v.stepId === 'string' && typeof v.ts === 'number'
    ? { stepId: v.stepId, ts: v.ts }
    : null;
}

export function writeResume(lessonId, stepId, ts = Date.now()) {
  writeJSON(keyFor(`resume.${lessonId}`, getActiveSlot()), { stepId, ts });
}

export function clearResume(lessonId) {
  removeKey(keyFor(`resume.${lessonId}`, getActiveSlot()));
}

// 命令列の下書き（Issue #556）。値は {stepId, commands, ts}。レッスンごと最新1件、端末内のみ。
// 壊れた値・型違い・長さ超過・30日超・未来の ts は null（呼び出し側は空で開始する）。
const DRAFT_MAX_LEN = 100;
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isDraftCommand(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  if (c.pause === true) return true;
  if (Array.isArray(c.box)) return c.box.length <= DRAFT_MAX_LEN && typeof c.times === 'number';
  return typeof c.dir === 'string' && typeof c.times === 'number';
}

export function readDraft(lessonId) {
  const v = readJSON(keyFor(`draft.${lessonId}`, getActiveSlot()), null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (typeof v.stepId !== 'string' || typeof v.ts !== 'number') return null;
  const age = Date.now() - v.ts;
  if (!(age >= 0 && age <= DRAFT_MAX_AGE_MS)) return null;
  if (!Array.isArray(v.commands) || v.commands.length > DRAFT_MAX_LEN) return null;
  if (!v.commands.every(isDraftCommand)) return null;
  return { stepId: v.stepId, commands: v.commands, ts: v.ts };
}

export function writeDraft(lessonId, stepId, commands, ts = Date.now()) {
  writeJSON(keyFor(`draft.${lessonId}`, getActiveSlot()), { stepId, commands, ts });
}

export function clearDraft(lessonId) {
  removeKey(keyFor(`draft.${lessonId}`, getActiveSlot()));
}

// 最後に手がかりを見せたレッスン（Issue #282）。値は lessonId の文字列1項目。壊れた値・型違いは null。
export function readLastHint() {
  const v = readJSON(keyFor('lastHint', getActiveSlot()), null);
  return typeof v === 'string' && v !== '' ? v : null;
}

export function writeLastHint(lessonId) {
  writeJSON(keyFor('lastHint', getActiveSlot()), lessonId);
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

// 単元をはじめて全クリアした印（Issue #267）。スロット単位。
export function isUnitEndSeenStored(unitId) {
  try {
    return localStorage.getItem(keyFor(`unitEndSeen.${unitId}`, getActiveSlot())) === 'true';
  } catch {
    return false;
  }
}

export function markUnitEndSeenStored(unitId) {
  try {
    localStorage.setItem(keyFor(`unitEndSeen.${unitId}`, getActiveSlot()), 'true');
  } catch {
    // 容量超過等は無視（演出がもう一度出るだけ）
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
