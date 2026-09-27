export const name = 'C2b やりかた帯・無操作促し: 全単元のplay/predictに常時表示・段階連動・しつこくない';

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
  return (await page.$$('.howto-strip [data-phase]')).length;
}

async function stateOf(page, phase) {
  return page.getAttribute(`[data-phase="${phase}"]`, 'data-state');
}

// cmd-01-susumu・donguri-01-hirouはintro直後にtutorialがある（Issue #81）。
// このシナリオの主眼はplay/predictの帯なので、tutorialが出たらお手本通りに最短で通過する。
async function skipTutorialIfAny(page, dirs) {
  if ((await page.getAttribute('#stage', 'data-step')) !== 'tutorial') return;
  for (const dir of dirs) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await page.click('[data-action="next"]');
}

export default async function run({ page, check }) {
  // config.mjsがcmd-01-susumu・donguri-01-hirouを凍結fixture（tutorial追加前）へ差し替えている
  // （Issue #81・既存シナリオ保護用）。本シナリオは現行の構造（tutorialの有無）を見るため解除する。
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- 5レッスン全てのplay/predictに帯があり、tutorialには無い ---
  for (const id of ['cmd-01-susumu', 'cmd-02-mijikaku', 'cmd-03-naosu', 'donguri-01-hirou', 'donguri-02-mawarimichi']) {
    await page.goto(`/index.html?lesson=${id}`);
    await page.click('[data-action="start"]');
    if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') {
      await check(`[${id}] tutorialに帯が無い`, async () => (await page.$$('.howto-strip')).length, 0);
      continue;
    }
    await check(`[${id}] predictに帯がある`, async () => (await page.$$('.howto-strip')).length, 1);
  }

  // --- cmd-01-susumu: 通常play（groupRepeats/initialCommandsなし）の段階連動 ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await skipTutorialIfAny(page, ['up', 'up', 'right', 'right']);

  await check('predictに帯が1ブロック', async () => blockCount(page), 1);
  await check('predictの帯は20字以内', async () => noLongLine(page));
  await check('predictで横スクロールなし', async () => noScrollX(page));

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('予想後は帯の強調が無い', async () => stateOf(page, 1), 'todo');
  await page.click('[data-action="next"]');

  await check('playに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('playの帯が3ブロック', async () => blockCount(page), 3);
  await check('playの帯は20字以内', async () => noLongLine(page));
  await check('playで横スクロールなし', async () => noScrollX(page));
  await check('帯内にbuttonが0個', async () => (await page.$$('.howto-strip button')).length, 0);
  await check('帯内にpが0個', async () => (await page.$$('.howto-strip p')).length, 0);
  await check('空キューでは①が強調', async () => stateOf(page, 1), 'current');
  await check('②③はtodo', async () => [await stateOf(page, 2), await stateOf(page, 3)].every((s) => s === 'todo'));

  await page.click('[data-command="up"]');
  await check('コマンド追加で③が強調', async () => stateOf(page, 3), 'current');
  await check('①②はdone', async () => [await stateOf(page, 1), await stateOf(page, 2)].every((s) => s === 'done'));

  await page.click('[data-action="clear-all"]');
  await check('ぜんぶけすで①へ戻る', async () => stateOf(page, 1), 'current');

  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('実行後（結果表示中）は帯の強調が無い', async () => stateOf(page, 3), 'todo');

  // --- cmd-03-naosu: なおす（initialCommandsあり）は編集済みか否かのみで①/③ ---
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('なおすの帯が3ブロック（×で けす/やじるしで たす/じっこう）', async () => blockCount(page), 3);
  await check('なおすの初期状態は①（×で けす）が強調', async () => stateOf(page, 1), 'current');

  await page.click('.command-remove');
  await check('×タップ後は③（じっこう）が強調', async () => stateOf(page, 3), 'current');
  await check('②はdone（経由扱い）', async () => stateOf(page, 2), 'done');

  // --- 無操作促し: 8秒後に光り、3秒後に消える。無操作が続けば最大2回まで（page.clockで検証） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.install();
  await page.click('[data-action="start"]');
  await skipTutorialIfAny(page, ['up', 'up', 'right', 'right']);
  await page.click('[data-option="B"]');
  await page.clock.fastForward(2000);
  await page.click('[data-action="next"]');
  await check('play到着直後は促しが無い', async () => (await page.$$('[data-nudge="true"]')).length, 0);

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
  await page.click('[data-option="B"]');
  await page.clock.fastForward(2000);
  await page.click('[data-action="next"]');
  await page.clock.fastForward(8000);
  await check(
    'no-preference時、促しにpulseアニメーション',
    async () => page.evaluate(() => getComputedStyle(document.querySelector('[data-nudge="true"]')).animationName),
    'pulse'
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
