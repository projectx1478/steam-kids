export const name =
  'C2チュートリアル: 説明専用画面（お手本列・ゴースト矢印・区切り画面・スキップ・自動スキップ。Issue #93）';

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
  // --- cmd-01-susumu: text未指定＝文字を読ませない、お手本列＋光るボタン＋ゴースト矢印で誘導 ---
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');

  await check('tutorialステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('見出しが「れんしゅう」', async () => page.textContent('.tutorial-screen h2'), 'れんしゅう');
  await check('ステップドットが6個（intro/tutorial/p1/p2/p3/summary）', async () => (await page.$$('.step-dot')).length, 6);
  await check('横スクロールが発生しない', async () => noScrollX(page));
  await check('指示文<p>が無い（cmd-01は文字を読ませない）', async () => (await page.$$('.tutorial-prompt')).length, 0);
  await check('お手本列の要素数が5個（script長と一致）', async () => (await page.$$('.guide-row [data-guide-index]')).length, 5);
  await check('最初のお手本はcurrent', async () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'current');
  await check('光っている操作対象は1個のみ', async () => (await page.$$('[data-guide="true"]')).length, 1);
  await check('光っているのはupボタン', async () => (await page.$('[data-command="up"][data-guide="true"]')) !== null);
  await check('rightボタンは無効', async () => page.isDisabled('[data-command="right"]'));
  await check('runボタンは無効', async () => page.isDisabled('[data-action="run"]'));
  await check('スキップボタンがある', async () => (await page.$('[data-action="skip-tutorial"]')) !== null);

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

  // 結果の見える化：タップごとに番号付きゴースト矢印＋1行キャプション（Issue #93）
  await check('ゴースト矢印が1個（①）', async () => (await page.$$('.grid-marker-ghost')).length, 1);
  await check('ゴーストの番号は1', async () => page.getAttribute('.grid-marker-ghost', 'data-ghost-order'), '1');
  await check('1行キャプションが20字以内', async () => (await page.textContent('.ghost-caption')).length <= 20);
  await check('キャプションに向きの言葉がある', async () => (await page.textContent('.ghost-caption')).includes('うえ'));

  // --- 途中でスキップしても即座に次(play=p1)へ進み、単元スタンプは付かない ---
  await page.click('[data-action="skip-tutorial"]');
  await check('スキップでplay(p1)へ進む', async () => page.getAttribute('#stage', 'data-step'), 'play');
  const skippedEvents = await eventTypes(page, 'cmd-01-susumu');
  await check(
    'スキップでもrun/clearイベントが記録されない（単元スタンプの誤付与防止）',
    () => !skippedEvents.includes('run') && !skippedEvents.includes('clear')
  );

  // --- 再訪時は自動でスキップされ、introに「れんしゅう する」が出る ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('introに「れんしゅう する」がある(スキップ済み)', async () => (await page.$('[data-action="redo-tutorial"]')) !== null);
  await page.click('[data-action="start"]');
  await check('完了済みは自動でplay(p1)へ(tutorialを飛ばす)', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // --- 「れんしゅう する」で明示的に入り直し、実行完了→区切り画面まで確認 ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="redo-tutorial"]');
  await check('れんしゅう するでtutorialへ入り直せる', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');

  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await check('4回タップ後、runボタンが光る', async () => page.getAttribute('[data-action="run"]', 'data-guide'), 'true');

  await page.click('[data-action="run"]');
  // ゴール演出（本番と同じshowSuccess）が先に出て、カードは約1.5秒後に盤面へ重なる（Issue #132）
  await page.waitForSelector('.tutorial-result [data-result="clear"], [data-result="clear"]', { timeout: 8000 });
  await check('ゴール時にfanfareが鳴る', async () => page.evaluate(() => window.__sfxLog.includes('fanfare')));
  await check('ゴール時にdata-result="clear"が出る', async () => (await page.$$('[data-result="clear"]')).length, 1);
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await check('区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);
  await check('オーバーレイが画面全体を覆う', async () => {
    const b = await page.evaluate(() => {
      const r = document.querySelector('.tutorial-divider').getBoundingClientRect();
      return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    });
    return b.w >= b.vw && b.h >= b.vh;
  });
  await check('オーバーレイ表示後も盤面が残る', async () => (await page.$$('.grid-player')).length >= 1);
  await check('カードが画面内に収まる', async () => {
    const b = await page.evaluate(() => {
      const r = document.querySelector('.tutorial-divider > div').getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight };
    });
    return b.l >= 0 && b.t >= 0 && b.r <= b.vw && b.b <= b.vh;
  });
  await check('区切り画面に「れんしゅう おしまい」がある', async () => (await page.textContent('.tutorial-divider')).includes('れんしゅう おしまい'));
  await check('区切り画面に「じゅんばんに うごいたね」がある', async () => (await page.textContent('.tutorial-divider')).includes('じゅんばんに うごいたね'));

  const cmdEvents = await eventTypes(page, 'cmd-01-susumu');
  await check(
    'チュートリアル完走でrun/clearイベントが記録されない（単元スタンプの誤付与防止）',
    () => !cmdEvents.includes('run') && !cmdEvents.includes('clear')
  );
  await check('step_enter/step_leaveは通常どおり記録される', () => cmdEvents.includes('step_enter'));

  await page.click('[data-action="continue-to-task"]');
  await check('play(p1)へ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // --- no-preference: 光るボタンにpulseアニメーションが付く ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="redo-tutorial"]');
  await check('no-preference時、光るボタンにpulseアニメーション', async () => animationName(page, '[data-command="up"]'), 'pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // --- donguri-01-hirou: textは表示、items連動（回収は実行時のみ反映） ---
  await page.unroute('**/lessons/donguri-01-hirou.json');
  await page.goto('/index.html?lesson=donguri-01-hirou');
  await page.click('[data-action="start"]');
  await check('donguri: tutorialに入る', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check(
    'donguri: 指示文が表示される（視覚で表せないルールのみtext表示）',
    async () => page.textContent('.tutorial-prompt'),
    'どんぐりを とって ゴール'
  );
  await check('donguri: のこりが1', async () => page.textContent('[data-remaining]'), '1');

  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');
  await page.click('[data-command="right"]');
  await check('donguri: 実行前はのこり1のまま（タップは積むだけ）', async () => page.textContent('[data-remaining]'), '1');

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  // 完了後は区切り画面に差し替わり、のこり表示ごと消える（回収自体はonPickupでの減算をplay側で確認済み）。
  await check('donguri: 区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);

  const donguriEvents = await eventTypes(page, 'donguri-01-hirou');
  await check(
    'donguri: チュートリアル完走でrun/clearイベントが記録されない',
    () => !donguriEvents.includes('run') && !donguriEvents.includes('clear')
  );

  // --- tutorialは新しい操作が初登場するレッスンに置く。donguri-02は追加操作が無いため無し
  // （cmd-02/cmd-03のtutorial(group/fixモード)はc9-tutorial-group.mjs・c9-tutorial-fix.mjsで
  // 検証。Issue #98） ---
  for (const id of ['donguri-02-mawarimichi']) {
    const kinds = await page.evaluate(async (lessonId) => {
      const res = await fetch(`/lessons/${lessonId}.json`);
      const data = await res.json();
      return data.steps.map((s) => s.kind);
    }, id);
    await check(`${id}にtutorialが無い`, () => !kinds.includes('tutorial'));
  }
}
