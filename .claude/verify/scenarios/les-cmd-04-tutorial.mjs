export const name = 'les-cmd-04 れんしゅう: はこ→みぎ→した→かいすう→とじる→じっこうの順で進む(Issue #139・#167)';

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-04-kurikaeshi.json').catch(() => {});
  await page.goto('/index.html?lesson=cmd-04-kurikaeshi');
  await page.click('[data-action="start"]');
  await check('tutorialに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('案内文「はこの なかを くりかえすよ」', async () => (await page.textContent('.tutorial-prompt')).includes('くりかえすよ'), true);
  await check('お手本列が6個', async () => (await page.$$('.guide-row [data-guide-index]')).length, 6);
  await check('はこだけ有効', async () => page.getAttribute('[data-action="box-open"]', 'data-guide'), 'true');
  await check('方向ボタンは無効', async () => page.isDisabled('[data-command="right"]'), true);

  await page.click('[data-action="box-open"]');
  await check('箱が開く', async () => page.getAttribute('.command-chip[data-box]', 'data-open'), 'true');
  await check('じっこうがかいすう・とじるに替わる', async () => [!!(await page.$('[data-action="run"]')), !!(await page.$('[data-action="box-times"]')), !!(await page.$('[data-action="box-close"]'))], [false, true, true]);
  await check('みぎが光る', async () => page.getAttribute('[data-command="right"]', 'data-guide'), 'true');
  await page.click('[data-command="right"]');
  await check('箱に1個入る', async () => (await page.$$('.command-chip [data-inner]')).length, 1);
  await check('したが光る', async () => page.getAttribute('[data-command="down"]', 'data-guide'), 'true');
  await page.click('[data-command="down"]');
  await check('箱に2個入る', async () => (await page.$$('.command-chip [data-inner]')).length, 2);
  await check('かいすうが光る', async () => page.getAttribute('[data-action="box-times"]', 'data-guide'), 'true');
  await check('とじるは無効', async () => page.isDisabled('[data-action="box-close"]'), true);
  await page.click('[data-action="box-times"]');
  await check('回数が×3', async () => page.textContent('.box-times'), 'はこ ×3');
  await page.click('[data-action="box-close"]');
  await check('箱が閉じる', async () => (await page.$('.command-chip[data-open]')) === null);
  await check('キャプションが「はこの なかを 3かい」', async () => page.textContent('.ghost-caption'), 'はこの なかを 3かい');
  await check('じっこうが光る', async () => page.getAttribute('[data-action="run"]', 'data-guide'), 'true');
  await check('横スクロールなし', async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.click('[data-action="run"]');
  await check('実行中、箱チップにdata-roundが付く', async () => page.waitForSelector('.command-chip[data-box][data-round]', { timeout: 4000 }).then(() => true), true);
  await check('周回の点は3個（実行中は塗りつぶされる）', async () => page.$$eval('.box-rounds .box-round-dot', (els) => els.length), 3);
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await check('区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);
  await page.click('[data-action="continue-to-task"]');
  await check('play(p1)へ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');
}
