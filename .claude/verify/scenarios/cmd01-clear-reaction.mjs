export const name = 'cmd-01-susumu: ゴール到達時のみ肯定的なリアクションが表示される';

async function toPlayStep(page) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
}

export default async function run({ page, check }) {
  // ゴール到達時: リアクション演出とdata-result="clear"が付く
  await toPlayStep(page);
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('到達時にclear-reaction演出が表示される', async () => (await page.$('.clear-reaction')) !== null);
  await check('resultElにdata-result="clear"が付く', async () => page.getAttribute('#stage [data-result]', 'data-result'), 'clear');

  // 未達成時: 演出は出ず「もういちど」のみ
  await toPlayStep(page);
  await page.click('[data-command="up"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('未達成時はclear-reaction演出が出ない', async () => (await page.$('.clear-reaction')) === null);
  await check('未達成時はdata-resultが付かない', async () => (await page.$('#stage [data-result]')) === null);
}
