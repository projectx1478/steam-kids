// localStorage読み書きの薄い層。パース失敗・書き込み失敗（QuotaExceededError等）は
// 握りつぶし、子ども画面を落とさないことを最優先する。
const EVENTS_KEY = 'steamkids.events';
const PROFILE_KEY = 'steamkids.profile';
const MAX_EVENTS = 5000;

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

export function loadEvents() {
  const events = readJSON(EVENTS_KEY, []);
  return Array.isArray(events) ? events : [];
}

export function appendEvent(event) {
  const events = loadEvents();
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  writeJSON(EVENTS_KEY, events);
}

function isValidProfile(profile) {
  return Boolean(profile) && typeof profile.learnerId === 'string';
}

export function loadProfile() {
  const profile = readJSON(PROFILE_KEY, null);
  return isValidProfile(profile) ? profile : null;
}

export function saveProfile(profile) {
  writeJSON(PROFILE_KEY, profile);
}
