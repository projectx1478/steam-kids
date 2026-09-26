export const name = 'C2チュートリアル: なぞり操作型（お手本列・光るボタン・イベント非記録）';

async function noScrollX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function eventTypes(page, lessonId) {
  return page.evaluate(async (id) => {
    const { getEvents } = await import('/js/events.js');
    return getEvents().filter((e) => e.lessonId === id).map((e) => e.type);
  }, lessonId);
}

async function animationName(page, selector) {
  return page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).animationName, selector);
}

export default async function run({ page, check }) {
  // --- cmd-01-susumu: text未指定＝文字を読ませない、お手本列＋光るボタンで誘導 ---
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');

  await check('tutorialステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('ステップドットが5個（intro/tutorial/predict/play/summary）', async () => (await page.$$('.step-dot')).length, 5);
  await check('横スクロールが発生しない', async () => noScrollX(page));
  await check('指示文<p>が無い（cmd-01は文字を読ませない）', async () => (await page.$$('#stage p')).length, 0);
  await check('お手本列の要素数が5個（script長と一致）', async () => (await page.$$('.guide-row [data-guide-index]')).length, 5);
  await check('最初のお手本はcurrent', async () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'current');
  await check('光っている操作対象は1個のみ', async () => (await page.$$('[data-guide="true"]')).length, 1);
  await check('光っているのはupボタン', async () => (await page.$('[data-command="up"][data-guide="true"]')) !== null);
  await check('rightボタンは無効', async () => page.isDisabled('[data-command="right"]'));
  await check('runボタンは無効', async () => page.isDisabled('[data-action="run"]'));

  // reduced-motion(既定): リング(box-shadow)は付くがアニメーションは無し
  await check('reduced-motion時、光るボタンにアニメーションが無い', async () => animationName(page, '[data-command="up"]'), 'none');
  await check('reduced-motion時もring(box-shadow)は付く', async () => {
    const shadow = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-command="up"]')).boxShadow
    );
    return shadow !== 'none';
  });

  // 対象外(right)を強制dispatchしてもキューは増えない（disabled属性とJS側ガードの二重防御）
  await page.dispatchEvent('[data-command="right"]', 'click');
  await check('対象外タップではキューが増えない', async () => (await page.$$('.command-chip')).length, 0);

  await page.click('[data-command="up"]');
  await check('1回目タップでキュー1個', async () => (await page.$$('.command-chip')).length, 1);
  await check('お手本列index0はdone', async () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'done');
  await check('お手本列index1はcurrent', async () => page.getAttribute('[data-guide-index="1"]', 'data-state'), 'current');
  await check('「ぜんぶけす」が無い', async () => (await page.$$('[data-action="clear-all"]')).length, 0);
  await check('キューに×ボタンが無い', async () => (await page.$$('.command-remove')).length, 0);

  await page.click('[data-command="up"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await check('4回タップ後、runボタンが光る', async () => page.getAttribute('[data-action="run"]', 'data-guide'), 'true');

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('クリア表示になる', async () => (await page.$$('[data-result="clear"]')).length, 1);
  await check('お手本列は全てdone', async () => (await page.$$('.guide-row [data-state="done"]')).length, 5);

  const cmdEvents = await eventTypes(page, 'cmd-01-susumu');
  await check(
    'チュートリアル完走でrun/clearイベントが記録されない（単元スタンプの誤付与防止）',
    () => !cmdEvents.includes('run') && !cmdEvents.includes('clear')
  );
  await check('step_enter/step_leaveは通常どおり記録される', () => cmdEvents.includes('step_enter'));

  await page.click('[data-action="next"]');
  await check('predictへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'predict');

  // --- no-preference: 光るボタンにpulseアニメーションが付く ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('no-preference時、光るボタンにpulseアニメーション', async () => animationName(page, '[data-command="up"]'), 'pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // --- donguri-01-hirou: textは表示、items連動（回収は実行時のみ反映） ---
  await page.unroute('**/lessons/donguri-01-hirou.json');
  await page.goto('/index.html?lesson=donguri-01-hirou');
  await page.click('[data-action="start"]');
  await check('donguri: tutorialに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check(
    'donguri: 指示文が表示される（視覚で表せないルールのみtext表示）',
    async () => page.textContent('#stage p'),
    'どんぐりを とって ゴール'
  );
  await check('donguri: のこりが1', async () => page.textContent('[data-remaining]'), '1');

  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');
  await page.click('[data-command="right"]');
  await check('donguri: 実行前はのこり1のまま（タップは積むだけ）', async () => page.textContent('[data-remaining]'), '1');

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('donguri: 実行後にのこり0（回収済み）', async () => page.textContent('[data-remaining]'), '0');
  await check('donguri: クリア表示になる', async () => (await page.$$('[data-result="clear"]')).length, 1);

  const donguriEvents = await eventTypes(page, 'donguri-01-hirou');
  await check(
    'donguri: チュートリアル完走でrun/clearイベントが記録されない',
    () => !donguriEvents.includes('run') && !donguriEvents.includes('clear')
  );

  // --- tutorialは各単元1本目のみ（cmd-02/cmd-03/donguri-02には無い） ---
  for (const id of ['cmd-02-mijikaku', 'cmd-03-naosu', 'donguri-02-mawarimichi']) {
    const kinds = await page.evaluate(async (lessonId) => {
      const res = await fetch(`/lessons/${lessonId}.json`);
      const data = await res.json();
      return data.steps.map((s) => s.kind);
    }, id);
    await check(`${id}にtutorialが無い`, () => !kinds.includes('tutorial'));
  }
}
