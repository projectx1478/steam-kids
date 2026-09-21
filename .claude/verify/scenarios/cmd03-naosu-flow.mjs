export const name = 'cmd-03-naosu: 誤った初期命令列を消して直すとゴールに到達する(Issue #31)';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await check('初期ステップはintro', async () => page.getAttribute('#stage', 'data-step'), 'intro');

  await page.click('[data-action="start"]');
  await check('predictへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'predict');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');

  await check('初期状態で4個のチップが積まれている', async () => (await page.$$('.command-chip')).length, 4);

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('誤った命令列のままではゴールに到達しない（もういちどが出る）', async () => (await page.$('.clear-reaction')) === null);

  await page.click('[data-remove-index="2"]');
  await check('誤った命令(3番目のup)を消すと3個になる', async () => (await page.$$('.command-chip')).length, 3);

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('直した命令列でゴールに到達する', async () => (await page.$('.clear-reaction')) !== null);

  await page.click('[data-action="next"]');
  await check('summaryへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('「ほかのレッスンへ」ボタンが表示される', async () => (await page.$('[data-action="back-to-picker"]')) !== null);
}
