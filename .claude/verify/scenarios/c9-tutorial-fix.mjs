export const name = 'C9 れんしゅう(fix): cmd-03-naosuのtutorialで誤った命令を消すとゴールに到達する(Issue #98)';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await check('tutorialステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('お手本列の要素数が2個（remove→run）', async () => (await page.$$('.guide-row [data-guide-index]')).length, 2);
  await check('お手本列0番目が×（remove）', async () => page.locator('[data-guide-index="0"]').innerText(), '×');
  await check('初期チップが3個積まれている', async () => (await page.$$('.command-chip')).length, 3);

  await check('パレットは全てdisabled（removeガイド中はタップ操作を受け付けない）', async () =>
    (await page.$$('[data-command]:not([disabled])')).length === 0
  );
  await check('runボタンもdisabled', async () => page.isDisabled('[data-action="run"]'));
  await check('対象外チップ(0番目)をタップしても消えない', async () => {
    await page.click('[data-index="0"]', { force: true });
    return (await page.$$('.command-chip')).length === 3;
  });

  await check('1番目のチップが光っている（removeガイド対象。Issue #98）', async () =>
    (await page.$('.command-chip[data-index="1"].ring-4')) !== null
  );
  await page.click('[data-index="1"]');
  await check('対象チップをタップすると消えて2個になる', async () => (await page.$$('.command-chip')).length, 2);
  await check('お手本列0番目はdone', async () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'done');
  await check('runボタンが光る', async () => page.getAttribute('[data-action="run"]', 'data-guide'), 'true');

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await check('区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);

  await page.click('[data-action="continue-to-task"]');
  await check('play(p1)へ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('playのp1は初期状態の3個のチップから始まる（tutorialでの編集は残らない）', async () => (await page.$$('.command-chip')).length, 3);

  // --- 再訪時は自動でスキップされる（完了記録はレッスン単位。Issue #98） ---
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await check('完了済みは自動でplay(p1)へ(tutorialを飛ばす)', async () => page.getAttribute('#stage', 'data-step'), 'play');
}
