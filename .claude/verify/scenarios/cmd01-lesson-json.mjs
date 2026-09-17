export const name = 'cmd-01-susumu: lessons/*.jsonから読み込み、失敗時はフォールバック文言';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  await check(
    's1の見出しがlessons/cmd-01-susumu.jsonのsteps[0].textと一致',
    async () => page.textContent('#stage p'),
    'ゴールまで すすもう'
  );

  // 200応答だがJSONとして壊れている場合の取得失敗を模す。
  // 実HTTPで4xxを返すと、Chromiumがネットワーク層で自前のconsole.errorを出すため
  // ハーネスの自動失敗条件（console.error/HTTP 4xx検知）に引っかかる。
  // 本シナリオでは200+不正bodyでパース失敗のみを再現する（同じcatch分岐を通る）。
  await page.route('**/lessons/cmd-01-susumu.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' })
  );
  await page.goto('/index.html');
  await check(
    'フォールバック文言が1行かつ20字以内',
    async () => {
      const paragraphs = await page.$$('#stage p');
      if (paragraphs.length !== 1) return null;
      const text = await paragraphs[0].textContent();
      return [...text].length <= 20 ? text : null;
    },
    'よみこみ できませんでした'
  );
}
