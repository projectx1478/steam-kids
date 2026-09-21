export const name = 'cmd-02-mijikaku: 同方向連続タップがまとめられ、3チップでゴールに到達する(Issue #48)';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  for (let i = 0; i < 5; i++) {
    await page.click('[data-command="down"]');
  }
  await check('した×5が1チップにまとまる', async () => (await page.$$('.command-chip')).length, 1);
  await check('チップの表示が「した ×5」', async () => page.textContent('.command-chip:nth-child(1) span'), 'した ×5');

  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await check('みぎ×2がまとまり合計2チップ', async () => (await page.$$('.command-chip')).length, 2);
  await check(
    '2個目のチップの表示が「みぎ ×2」',
    async () => page.textContent('.command-chip:nth-child(2) span'),
    'みぎ ×2'
  );

  await check(
    'maxCommands=3に対しチップ2個なので追加ボタンはdisabledにならない',
    async () => page.getAttribute('[data-command="up"]', 'disabled'),
    null
  );

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('ゴールに到達し「やったね」が表示される', async () => (await page.$('.clear-reaction')) !== null);
}
