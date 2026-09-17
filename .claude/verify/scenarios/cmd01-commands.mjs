export const name = 'cmd-01-susumu: 命令の追加・個別削除・ぜんぶけす・8個上限';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  await page.click('[data-command="up"]');
  await page.click('[data-command="right"]');
  await check('命令が2個キューに積まれる', async () => (await page.$$('.command-chip')).length, 2);

  await page.click('[data-remove-index="0"]');
  await check('個別削除で1個になる', async () => (await page.$$('.command-chip')).length, 1);

  for (let i = 0; i < 7; i++) {
    await page.click('[data-command="up"]');
  }
  await check('8個で頭打ちになる', async () => (await page.$$('.command-chip')).length, 8);
  await check('追加ボタンがdisabledになる', async () => page.getAttribute('[data-command="up"]', 'disabled'), '');

  await page.click('[data-action="clear-all"]');
  await check('ぜんぶけすで0個になる', async () => (await page.$$('.command-chip')).length, 0);
}
