// セーブスロットの表示用の純関数（Issue #218）。DOM・localStorageに依存しない。
import { summarize } from './analytics.js';
import { lessonOrder } from './unlock.js';

const MAX_NAME_LENGTH = 10;

// 前後の空白を除き、コードポイント単位で10文字に切る。空ならnull（表示側でプレイヤーNに置き換える）。
export function normalizeName(raw) {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return null;
  return Array.from(trimmed).slice(0, MAX_NAME_LENGTH).join('');
}

export function displayName(label, slot) {
  return label || `プレイヤー${slot + 1}`;
}

// れんしゅう（practiceIds）は数えず、通常レッスンのクリア数だけを返す。
export function clearCount(events, units, now = Date.now()) {
  const { lessons } = summarize(events, now);
  return lessonOrder(units).filter((id) => lessons[id]?.status === 'cleared').length;
}

// 最終プレイ日を「M/D」（ローカル時刻）で返す。イベントが無ければnull。
export function lastPlayed(events) {
  if (events.length === 0) return null;
  const ts = events.reduce((max, e) => (e.ts > max ? e.ts : max), 0);
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
