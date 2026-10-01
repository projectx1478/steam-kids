// 子ども画面の日次保護者ゲートの最終認証日（Issue #217）。ローカル日付のYYYY-MM-DD。
// toISOStringはUTC基準で0〜9時JSTに前日扱いとなるため使わない。
export const GATE_DATE_KEY = 'steamkids.gateDate';

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isGatePassedToday(now = new Date()) {
  try {
    return localStorage.getItem(GATE_DATE_KEY) === localDateKey(now);
  } catch {
    return false;
  }
}

export function markGatePassedToday(now = new Date()) {
  try {
    localStorage.setItem(GATE_DATE_KEY, localDateKey(now));
  } catch {
    // 容量超過・プライベートモード等。毎回ゲートが出るだけで致命ではない
  }
}
