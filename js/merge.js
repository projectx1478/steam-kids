// ローカルイベントとサーバーからの受信イベントをマージする純粋関数。
export function mergeEvents(local, incoming, max = 5000) {
  const byId = new Map();
  for (const e of local) {
    if (e && typeof e.eventId === 'string') byId.set(e.eventId, e);
  }
  for (const e of incoming) {
    if (e && typeof e.eventId === 'string') byId.set(e.eventId, e);
  }
  const merged = Array.from(byId.values()).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  if (merged.length > max) merged.splice(0, merged.length - max);
  return merged;
}
