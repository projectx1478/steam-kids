export const name = 'A1 効果音: 命令追加/削除・実行・壁停止・ゴール・ステップ遷移・予想の答え合わせ';

async function sfxLog(page) {
  return page.evaluate(() => window.__sfxLog);
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('startでwhooshが鳴る', async () => (await sfxLog(page)).includes('whoosh'));

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('予想実行開始でrunが鳴る', async () => (await sfxLog(page)).includes('run'));
  await check('予想実行中にstepが鳴る', async () => (await sfxLog(page)).includes('step'));
  await check('予想の答え合わせでrevealが鳴る', async () => (await sfxLog(page)).includes('reveal'));

  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // 盤外へ進む1手だけを実行してbumpを確認する（start(0,3)からleftは盤外）
  await page.click('[data-command="left"]');
  await check('命令追加でtapが鳴る', async () => (await sfxLog(page)).includes('tap'));
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('盤外へ進んでbumpが鳴る', async () => (await sfxLog(page)).includes('bump'));

  await page.click('[data-action="retry"]');
  await page.click('[data-action="clear-all"]');
  await check('ぜんぶけすでremoveが鳴る', async () => (await sfxLog(page)).includes('remove'));

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('ゴール到達でclearが鳴る', async () => (await sfxLog(page)).includes('clear'));

  const before = (await sfxLog(page)).length;
  await page.click('[data-action="next"]');
  await check('summaryへの遷移でもログが増える', async () => (await sfxLog(page)).length > before);
  const log = await sfxLog(page);
  await check('最後に鳴った音はwhoosh', () => log[log.length - 1], 'whoosh');
}
