export const name =
  'C2b やりかた帯: 課題カードに静的表示（Issue #93で操作画面から分離）・無操作促しは操作画面に残る';

async function noScrollX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function noLongLine(page) {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .every((l) => l.length <= 20);
}

async function blockCount(page) {
  return (await page.$$('.task-card .howto-strip [data-phase]')).length;
}

// cmd-01-susumu・donguri-01-hirouはintro直後にtutorialがある（Issue #81）。
// このシナリオの主眼は課題カードの帯なので、tutorialが出たらお手本通りに最短で通過する。
async function skipTutorialIfAny(page, dirs) {
  if ((await page.getAttribute('#stage', 'data-step')) !== 'tutorial') return;
  for (const dir of dirs) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await page.click('[data-action="continue-to-task"]');
}

export default async function run({ page, check }) {
  // 課題カードは検証ハーネスの既定でOFF（.claude/verify/config.mjs、Issue #93）。
  // このシナリオの主題そのものなのでONに戻す（c5-layout-flow.mjsと同じ考え方）。
  await page.addInitScript(() => localStorage.setItem('steamkids.taskCard', 'on'));
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- 5レッスン全てのpredict/playの課題カードに帯があり、tutorialには無い ---
  for (const id of ['cmd-01-susumu', 'cmd-02-mijikaku', 'cmd-03-naosu', 'donguri-01-hirou', 'donguri-02-mawarimichi']) {
    await page.goto(`/index.html?lesson=${id}`);
    await page.click('[data-action="start"]');
    if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') {
      await check(`[${id}] tutorialに帯が無い`, async () => (await page.$$('.howto-strip')).length, 0);
      continue;
    }
    await check(`[${id}] 課題カードに帯がある`, async () => (await page.$$('.task-card .howto-strip')).length, 1);
  }

  // --- cmd-01-susumu: predictは1ブロック、playは2ブロック（「めいれいが ならぶ」は削除。Issue #93） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await skipTutorialIfAny(page, ['up', 'up', 'right', 'right']);

  await check('predictの課題カードの帯が1ブロック', async () => blockCount(page), 1);
  await check('課題カードの文言は20字以内', async () => noLongLine(page));
  await check('課題カードで横スクロールなし', async () => noScrollX(page));
  await check('帯内にbuttonが0個', async () => (await page.$$('.task-card .howto-strip button')).length, 0);
  await check('帯内にpが0個', async () => (await page.$$('.task-card .howto-strip p')).length, 0);

  await page.click('[data-action="begin-task"]');
  await check('操作画面に帯が無い（Issue #93）', async () => (await page.$$('.predict-screen .howto-strip')).length, 0);
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');

  await check('playに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('playの課題カードの帯が2ブロック', async () => blockCount(page), 2);
  await check('課題カードで横スクロールなし(play)', async () => noScrollX(page));

  await page.click('[data-action="begin-task"]');
  await check('操作画面に帯が無い(play)', async () => (await page.$$('.play-screen .howto-strip')).length, 0);
  await check(
    '操作画面に区分バナー・デモが無い',
    async () => (await page.$$('.play-screen .category-banner, .play-screen .demo-widget')).length,
    0
  );

  // --- cmd-03-naosu: なおすの帯は3ブロック（×で けす/やじるしで たす/じっこう）のまま ---
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await page.click('[data-action="begin-task"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('なおすの帯が3ブロック（×で けす/やじるしで たす/じっこう）', async () => blockCount(page), 3);

  // --- 無操作促し: 操作画面に入ってから8秒後に光り、3秒後に消える。無操作が続けば最大2回まで ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.install();
  await page.click('[data-action="start"]');
  await skipTutorialIfAny(page, ['up', 'up', 'right', 'right']);
  await page.click('[data-action="begin-task"]');
  await page.click('[data-option="B"]');
  await page.clock.fastForward(2000);
  await page.click('[data-action="next"]');
  await page.click('[data-action="begin-task"]');
  await check('操作画面到着直後は促しが無い', async () => (await page.$$('[data-nudge="true"]')).length, 0);

  await page.clock.fastForward(8000);
  await check('8秒無操作でパレットが光る（1回目）', async () => (await page.$$('[data-nudge="true"]')).length > 0);
  await check(
    'reduced-motion時、促しにアニメーションが無い',
    async () => page.evaluate(() => getComputedStyle(document.querySelector('[data-nudge="true"]')).animationName),
    'none'
  );

  await page.click('[data-command="up"]');
  await check('タップで促しが消える（poke）', async () => (await page.$$('[data-nudge="true"]')).length, 0);

  await page.clock.fastForward(8000);
  await check('タップ後も無操作が続くと再度光る（2回目・対象はじっこうに変化）', async () =>
    (await page.$$('[data-nudge="true"]')).length > 0
  );
  await page.clock.fastForward(3000);
  await check('3秒後に消える', async () => (await page.$$('[data-nudge="true"]')).length, 0);

  await page.clock.fastForward(8000);
  await check('2回で打ち止め（3回目は光らない）', async () => (await page.$$('[data-nudge="true"]')).length, 0);

  // --- no-preferenceではpulseアニメーションが付く ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.install();
  await page.click('[data-action="start"]');
  await skipTutorialIfAny(page, ['up', 'up', 'right', 'right']);
  await page.click('[data-action="begin-task"]');
  await page.click('[data-option="B"]');
  await page.clock.fastForward(2000);
  await page.click('[data-action="next"]');
  await page.click('[data-action="begin-task"]');
  await page.clock.fastForward(8000);
  await check(
    'no-preference時、促しにpulseアニメーション',
    async () => page.evaluate(() => getComputedStyle(document.querySelector('[data-nudge="true"]')).animationName),
    'pulse'
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
