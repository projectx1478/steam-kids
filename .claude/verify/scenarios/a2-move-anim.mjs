export const name = 'A2 移動アニメーション: 通常移動450ms・壁バウンス250ms・足あと要素数';

async function animLog(page) {
  return page.evaluate(() => window.__gridAnimLog);
}

export default async function run({ page, check }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });

  const predictLog = await animLog(page);
  await check('予想の自動実行で450msのmoveが記録される', () => predictLog.some((e) => e.type === 'move' && e.ms === 450));

  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // 盤外(壁)へ進む1手だけを実行してbounceを確認する（start(0,3)からleftは盤外）
  await page.click('[data-command="left"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  const bounceLog = await animLog(page);
  await check('壁で250msのbounceが記録される', () => bounceLog.some((e) => e.type === 'bounce' && e.ms === 250));

  await page.click('[data-action="retry"]');
  await page.click('[data-action="clear-all"]');
  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('6マス成功移動で足あとが6個', async () => (await page.$$('.grid-footprint')).length, 6);
}
