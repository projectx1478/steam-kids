export const name = 'C9 れんしゅう(group): cmd-02-mijikakuのtutorialで同方向連続タップがまとめられる(Issue #98)';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="how-to"]');
  await check('tutorialステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('お手本列の要素数が5個（script長と一致）', async () => (await page.$$('.guide-row [data-guide-index]')).length, 5);
  await check('光っているのはleftボタン', async () => (await page.$('[data-command="left"][data-guide="true"]')) !== null);

  await page.click('[data-command="left"]');
  await check('1回目タップでキュー1個', async () => (await page.$$('.command-chip')).length, 1);
  await check('お手本列index0はdone', async () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'done');
  await check('光っているのはまだleftボタン（groupRepeatsでまとめる対象。Issue #98）', async () => (await page.$('[data-command="left"][data-guide="true"]')) !== null);

  await page.click('[data-command="left"]');
  await check('同方向2回目はまとめられチップは1個のまま', async () => (await page.$$('.command-chip')).length, 1);
  await check('チップの表示が「ひだり ×2」', async () => page.textContent('.command-chip:nth-child(1) span'), 'ひだり ×2');
  await check('お手本列index1もdone', async () => page.getAttribute('[data-guide-index="1"]', 'data-state'), 'done');

  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');
  await check('方向が変わると2個目のチップになる', async () => (await page.$$('.command-chip')).length, 2);
  await check(
    '2個目のチップの表示が「うえ ×2」',
    async () => page.textContent('.command-chip[data-index="1"] span'),
    'うえ ×2'
  );

  await check('4回タップ後、runボタンが光る', async () => page.getAttribute('[data-action="run"]', 'data-guide'), 'true');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await check('区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);

  await page.click('[data-action="continue-to-task"]');
  await check('play(p1)へ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // --- 再訪時は自動でスキップされる（完了記録はレッスン単位。Issue #98） ---
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await check('完了済みは自動でplay(p1)へ(tutorialを飛ばす)', async () => page.getAttribute('#stage', 'data-step'), 'play');
}
