// 開発者画面（Issue #216）。URLに`dev=1`がある間は学習記録を残さず、全レッスンを解放する。
export const IS_DEV = new URLSearchParams(location.search).get('dev') === '1';

export function withDev(url) {
  if (!IS_DEV) return url;
  return `${url}${url.includes('?') ? '&' : '?'}dev=1`;
}
