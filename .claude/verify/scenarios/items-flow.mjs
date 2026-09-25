export const name = 'donguri-01-hirou: item回収なしのゴールはクリアにならず、全回収でクリアする(Issue #60)';

async function sfxLog(page) {
  return page.evaluate(() => window.__sfxLog);
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=donguri-01-hirou');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('itemが2個描画される', async () => (await page.$$('.grid-item')).length, 2);

  // items(1,3)/(2,3)を踏まずにゴールへ直行する経路（up×3, right×3）
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('item未回収のままゴールしてもクリア表示にならない', async () => (await page.$$('[data-result="clear"]')).length, 0);
  await check('itemは2個のまま残る', async () => (await page.$$('.grid-item')).length, 2);
  await check('nextボタンは出ない', async () => (await page.$$('[data-action="next"]')).length, 0);

  await page.click('[data-action="retry"]');
  await page.click('[data-action="clear-all"]');
  for (const c of ['right', 'right', 'right', 'up', 'up', 'up']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('全item回収後はitem要素が0個になる', async () => (await page.$$('.grid-item')).length, 0);
  await check('pickup音が2回以上鳴る', async () => (await sfxLog(page)).filter((n) => n === 'pickup').length >= 2);
  await check('clear音が鳴る', async () => (await sfxLog(page)).includes('clear'));
}
