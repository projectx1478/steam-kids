export const name = 'cmd-01-susumu: 予想→自動実行→予想と結果を並べて表示';

async function assertNoNegativeWords(page, check) {
  const text = await page.locator('body').innerText();
  await check('否定語(ちがう)が出ない', async () => !text.includes('ちがう'));
  await check('否定語(まちがい)が出ない', async () => !text.includes('まちがい'));
  await check('否定語(ざんねん)が出ない', async () => !text.includes('ざんねん'));
}

export default async function run({ page, check }) {
  // 不正解(A)を選んでも否定語なし・予想と結果が並んで表示される
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('よそうマーカーが表示される', async () => (await page.$('.grid-marker-predicted')) !== null);
  await check('けっかマーカーが表示される', async () => (await page.$('.grid-marker-result')) !== null);
  await assertNoNegativeWords(page, check);

  // 正解(B)でも同様にマーカーが2つ表示される
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('正解時もマーカーが2つ表示される', async () => (await page.$$('.grid-marker')).length, 2);
  await assertNoNegativeWords(page, check);
}
