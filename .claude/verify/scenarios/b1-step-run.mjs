// B1 1コマずつ実行: 「👣 1コマ」ボタンがタップごとに1手だけ進め、じっこうと同じ判定
// （clear・失敗時のロック）を通ることを確認する（Issue #111）。

export const name = 'B1 1コマずつ実行: タップごとに1手進み、じっこうと同じ判定になる(Issue #111)';

async function toPlay(page) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
}

export default async function run({ page, check }) {
  await toPlay(page);
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await check('命令が6個積まれている', async () => (await page.$$('.command-chip')).length, 6);

  // --- 1回目のタップ: 1手だけ進み、パレット・編集ボタン・←がロックされる ---
  await page.click('[data-action="step"]');
  await check('1回目のタップで足あとが1個', async () => (await page.$$('.grid-footprint')).length, 1);
  await check('黄色の強調が1個だけ付く', async () => (await page.$$('.command-chip.ring-4.ring-yellow-400')).length, 1);
  await check(
    '強調は1番目のチップに付く',
    () => page.$eval('.command-chip.ring-4.ring-yellow-400', (el) => el.dataset.index),
    '0'
  );
  await check('ロック中: パレットが全てdisabled', async () => (await page.$$('[data-command]:not([disabled])')).length, 0);
  await check('ロック中: ⌫ けすがdisabled', () => page.$eval('[data-action="remove-last"]', (b) => b.disabled), true);
  await check('ロック中: ←がdisabled', () => page.$eval('#back-btn', (b) => b.disabled), true);

  const eventsAfterStart = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events')));
  const stepRunEvent = eventsAfterStart.find((e) => e.type === 'run' && e.payload?.mode === 'step');
  await check('runイベントにmode:"step"が記録される', () => Boolean(stepRunEvent));
  await check('runイベントのcommandCountは6', () => stepRunEvent?.payload.commandCount, 6);

  // --- 2回目のタップ: 強調がとなりのチップへ移る ---
  await page.click('[data-action="step"]');
  await check('2回目のタップで足あとが2個', async () => (await page.$$('.grid-footprint')).length, 2);
  await check(
    '強調が2番目のチップへ移る',
    () => page.$eval('.command-chip.ring-4.ring-yellow-400', (el) => el.dataset.index),
    '1'
  );

  // --- 途中で「▶ じっこう」を押すと残りを自動で進める ---
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('自動継続後、6マス成功移動で足あとが6個', async () => (await page.$$('.grid-footprint')).length, 6);
  await check('完了後は強調が消える', async () => (await page.$$('.command-chip.ring-4.ring-yellow-400')).length, 0);
  await check('完了後: ←が押せる', () => page.$eval('#back-btn', (b) => b.disabled), false);

  // --- 失敗時のロックも1コマ実行から同じ判定になる（別セッションで検証） ---
  await toPlay(page);
  await page.click('[data-command="left"]'); // start(0,3)からleftは盤外
  await page.click('[data-action="step"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('1コマ実行の失敗でtryAgain音が鳴る', () => page.evaluate(() => window.__sfxLog.includes('tryAgain')));
  await check('1コマ実行の失敗: もういちどだけ押せる', () => page.$eval('[data-action="retry"]', (b) => b.disabled), false);
  await check('1コマ実行の失敗: パレットが全てdisabled', async () => (await page.$$('[data-command]:not([disabled])')).length, 0);
  await check('1コマ実行の失敗: 1コマ自体もdisabled', () => page.$eval('[data-action="step"]', (b) => b.disabled), true);
}
