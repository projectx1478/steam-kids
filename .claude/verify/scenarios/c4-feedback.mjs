export const name =
  'C4 実機フィードバック一括対応: ヘッダー(もどる・えらぶ がめんへ＋確認ダイアログ)・反応統一・ヒント・もういちど・まとめ(Issue #91/#93)';

async function noLongLine(page) {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .every((l) => l.length <= 20);
}

async function assertNoNegativeWords(page, check, label) {
  const text = await page.locator('body').innerText();
  await check(`${label}: 否定語(ちがう)が出ない`, () => !text.includes('ちがう'));
  await check(`${label}: 否定語(まちがい)が出ない`, () => !text.includes('まちがい'));
  await check(`${label}: 否定語(ざんねん)が出ない`, () => !text.includes('ざんねん'));
}

// cmd-01-susumu/donguri-01-hirouのtutorial（up,up,right,right/up,up,right）を最短で通過する。
// 課題カードは検証ハーネスの既定でOFFのため、predict/playは操作画面へ即座に入る（config.mjs）。
async function skipTutorial(page, dirs) {
  if ((await page.getAttribute('#stage', 'data-step')) !== 'tutorial') return;
  for (const dir of dirs) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await page.click('[data-action="continue-to-task"]');
}

export default async function run({ page, check }) {
  // config.mjsが凍結しているcmd-01-susumu・donguri-01-hirouは現行構造で検証する（c2・c3と同じ）。
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- 1. ヘッダー（タイトル・区分チップ・もどる・えらぶ がめんへ＋確認ダイアログ）・introのデモ ---
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await check('introではもどるが非表示', async () => page.isHidden('#back-btn'));
  await check('introでも えらぶ がめんへ は表示される', async () => page.isVisible('#home-btn'));
  await check('ヘッダーに単元名・レッスン名が表示される', async () => page.textContent('#lesson-title'), 'めいれいでうごかす ・ なおす');
  await check('introの区分チップ「はじめに」', async () => page.textContent('#step-kind-chip'), 'はじめに');
  await check('introにplayデモが表示される', async () => (await page.$$('.demo-widget[data-demo="play"]')).length, 1);
  await check('reduced-motion時、デモに「もういちど みる」が無い', async () => (await page.$$('.demo-widget [data-action="demo-replay"]')).length, 0);

  await page.click('[data-action="start"]');
  await check('predictの区分チップ「よそう」', async () => page.textContent('#step-kind-chip'), 'よそう');
  await check('predictでもどるが表示される', async () => page.isVisible('#back-btn'));

  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');

  await check('playの区分チップ「うごかす」', async () => page.textContent('#step-kind-chip'), 'うごかす');
  // cmd-03-naosuのplayはinitialCommands(4個)がmaxCommands(4)と同数のため、パレットは
  // 最初から満杯でdisabled。チップの取り消しで最初の操作を行う。
  await page.click('[data-remove-index="2"]');

  // --- もどる・えらぶ がめんへは操作中に押すと確認ダイアログを挟む（window.confirmは使わない。Issue #93） ---
  await page.click('#back-btn');
  await check('もどるで確認ダイアログが出る', async () => (await page.$$('.confirm-dialog')).length, 1);
  await check('確認ダイアログの文言は20字以内', async () => (await page.textContent('.confirm-dialog p')).length <= 20);
  const dialogBtnBoxes = [];
  for (const el of await page.$$('.confirm-dialog button')) {
    dialogBtnBoxes.push(await el.boundingBox());
  }
  await check('確認ダイアログのボタンは48px以上', () => dialogBtnBoxes.every((b) => b.height >= 48));
  await page.click('[data-action="confirm-cancel"]');
  await check('つづけるでダイアログが閉じ、playのまま', async () => {
    const dialogGone = (await page.$$('.confirm-dialog')).length === 0;
    const stillPlay = (await page.getAttribute('#stage', 'data-step')) === 'play';
    return dialogGone && stillPlay;
  });

  await page.click('#back-btn');
  await page.click('[data-action="confirm-ok"]');
  await check('もどる確定で1つ前のpredictへ戻る', async () => page.getAttribute('#stage', 'data-step'), 'predict');

  await page.click('#home-btn');
  await check('えらぶ がめんへ も確認ダイアログを挟む', async () => (await page.$$('.confirm-dialog')).length, 1);
  await page.click('[data-action="confirm-cancel"]');
  await check('つづけるでpredictのまま', async () => page.getAttribute('#stage', 'data-step'), 'predict');

  // --- 2. predictの正解・不正解の反応統一・もういちど よそう ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await skipTutorial(page, ['up', 'up', 'right', 'right']);
  await check('predictに入る', async () => page.getAttribute('#stage', 'data-step'), 'predict');

  await page.click('[data-option="A"]'); // cmd-01-susumuの正解はB。Aは不正解。
  await page.waitForSelector('[data-hint="predict"]', { timeout: 4000 });
  await check('不正解でヒントパネルが1個', async () => (await page.$$('[data-hint="predict"]')).length, 1);
  await check('不正解でclear-reactionは出ない', async () => (await page.$$('.clear-reaction')).length, 0);
  await check('不正解でも足あとが残る', async () => (await page.$$('.grid-footprint')).length > 0);
  await check('不正解ヒントは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'predict不正解');

  await page.click('[data-action="retry-predict"]');
  await check('もういちど よそうで選び直せる状態に戻る', async () => (await page.$$('[data-hint="predict"]')).length, 0);
  await check('選択肢が再表示される', async () => (await page.$$('[data-option]')).length, 3);

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('正解でclear-reactionが1個', async () => (await page.$$('.clear-reaction')).length, 1);
  await check('正解でdata-result="clear"が付く', async () => page.getAttribute('#stage [data-result]', 'data-result'), 'clear');
  await check('正解でも「もういちど よそう」が出る（Issue #93）', async () => (await page.$$('[data-action="retry-predict"]')).length, 1);
  await page.click('[data-action="next"]');

  // --- 3. playの失敗ヒント（壁）・その場でもういちど・ひとつ けす ---
  await check('playに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await page.click('[data-command="left"]'); // start(0,3)からleftは盤外
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('壁ヒント: じっこう位置がretryになる', async () => (await page.$$('[data-action="run"]')).length, 0);
  await check('壁ヒント: ヒットしたチップに黄色リング', async () => (await page.$$('.command-chip.ring-amber-400')).length, 1);
  await check('壁ヒント: 盤面にwallマーカー', async () => (await page.$$('.grid-marker-wall[data-hint="true"]')).length, 1);
  await check('壁ヒント: ヒントパネル表示', async () => (await page.$$('[data-hint="wall"]')).length, 1);
  await check('壁ヒントは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'play壁ヒント');
  await check('壁ヒントではdata-resultが付かない', async () => (await page.$$('#stage [data-result]')).length, 0);

  await page.click('[data-action="remove-last"]');
  await check('編集で[data-action="run"]に戻る', async () => (await page.$$('[data-action="run"]')).length, 1);
  await check('編集でヒント表示が消える', async () => (await page.$$('[data-hint]')).length, 0);
  await check('ひとつ けすでチップが0個に戻る', async () => (await page.$$('.command-chip')).length, 0);

  // --- 未到達ヒント ---
  await page.click('[data-command="up"]'); // start(0,3)->(0,2)。壁にもゴールにも届かない。
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('未到達ヒント: stopped/goal-hintマーカーが1個ずつ', async () => {
    const stopped = await page.$$('.grid-marker-stopped');
    const goalHint = await page.$$('.grid-marker-goal-hint');
    return stopped.length === 1 && goalHint.length === 1;
  });
  await check('未到達ヒントパネル', async () => (await page.$$('[data-hint="goal"]')).length, 1);
  await assertNoNegativeWords(page, check, 'play未到達ヒント');

  // --- item未回収ヒント（donguri-01-hirou） ---
  await page.goto('/index.html?lesson=donguri-01-hirou');
  await page.click('[data-action="start"]');
  await skipTutorial(page, ['up', 'up', 'right']);
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('donguri playに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('item未回収ヒント: 残りitemが2個とも点滅マーク', async () => (await page.$$('.grid-item[data-hint="true"]')).length, 2);
  await check('item未回収ヒントパネル', async () => (await page.$$('[data-hint="items"]')).length, 1);
  await check('item未回収ヒントは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'play item未回収ヒント');

  // --- 4. スマホの操作画面（375x667）：じっこうが画面内、横スクロール無し、全ボタン48px以上 ---
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('mobile: じっこうボタンの下端が画面内', async () => {
    const box = await page.locator('[data-action="run"]').boundingBox();
    return box.y + box.height <= 667;
  });
  await check('mobile: 横スクロールが発生しない', async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );
  await check('mobile: 全ボタンが48px以上', async () => {
    const boxes = [];
    for (const el of await page.$$('button')) {
      const b = await el.boundingBox();
      if (b) boxes.push(b);
    }
    return boxes.every((b) => b.width >= 48 && b.height >= 48);
  });
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- 5. まとめ：できたことカード・単元スタンプ・つぎのレッスンへ ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await skipTutorial(page, ['up', 'up', 'right', 'right']);
  await page.click('[data-option="B"]'); // 正解
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`); // 最短6手・1回目でクリア
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  // --- クリア時は「つぎへ」に加え「もういちど」が出る（Issue #93） ---
  await check('クリアで「もういちど」が出る', async () => (await page.$$('[data-action="replay"]')).length, 1);
  await page.click('[data-action="replay"]');
  await check('もういちどで結果表示が消える', async () => (await page.$$('#stage [data-result]')).length, 0);
  await check('もういちどで命令列は残る', async () => (await page.$$('.command-chip')).length, 6);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  await page.click('[data-action="next"]');
  await check('summaryに入る', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('できたことカードが3枚（よそう正解・1回でクリア・最短）', async () => (await page.$$('.achievement-card')).length, 3);
  await check('単元スタンプがlessonIds数(3)だけ表示される', async () => (await page.$$('.unit-progress [data-stamp]')).length, 3);
  await check('つぎの レッスンへボタンが出る', async () => (await page.$$('[data-action="next-lesson"]')).length, 1);
  await check('summaryは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'summary');

  // --- 不正解・複数回クリアでは別のカード文言になる（最短でもない） ---
  await page.goto('/index.html?lesson=donguri-02-mawarimichi');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]'); // donguri-02の正解はA。Bは不正解。
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await page.click('[data-command="down"]');
  await page.click('[data-action="run"]'); // 1回目は失敗させる（未到達）
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await page.click('[data-action="retry"]');
  for (const c of ['down', 'down', 'down', 'right', 'up', 'up', 'up', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await page.click('[data-action="next"]');
  await check('donguri-02 summaryに入る', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check(
    '不正解・複数回クリアのカード文言になる',
    async () => (await page.locator('.achievement-cards').innerText()).includes('たしかめたね') &&
      (await page.locator('.achievement-cards').innerText()).includes('あきらめずに')
  );
  await check('最終レッスンでは「つぎの レッスンへ」が出ない', async () => (await page.$$('[data-action="next-lesson"]')).length, 0);
  await check('最終レッスンでも「ほかのレッスンへ」は出る', async () => (await page.$$('[data-action="back-to-picker"]')).length, 1);

  // --- 6. diagnose・lessonAchievementsの境界値をpage.evaluateから直接確認 ---
  const boundary = await page.evaluate(async () => {
    const { diagnose } = await import('/js/ui-reaction.js');
    const { lessonAchievements } = await import('/js/analytics.js');
    const { simulate } = await import('/js/engine-grid.js');

    const spec = { grid: { cols: 4, rows: 4 }, start: { x: 0, y: 3 }, goal: { x: 3, y: 0 }, walls: [{ x: 2, y: 2 }] };
    const wallResult = simulate(['left'], spec);
    const goalResult = simulate(['up'], spec);
    const itemsSpec = { ...spec, items: [{ x: 1, y: 3 }] };
    const itemsResult = simulate(['up', 'up', 'up', 'right', 'right', 'right'], itemsSpec);

    const events = [
      { lessonId: 'l', ts: 1, type: 'predict', payload: { correct: true } },
      { lessonId: 'l', ts: 2, type: 'run', payload: { commandCount: 6 } },
      { lessonId: 'l', ts: 3, type: 'clear', payload: {} },
    ];

    return {
      wallReason: diagnose(wallResult, ['left'], spec).reason,
      goalReason: diagnose(goalResult, ['up'], spec).reason,
      itemsReason: diagnose(itemsResult, ['up', 'up', 'up', 'right', 'right', 'right'], itemsSpec).reason,
      achievementsAllMatch: lessonAchievements(events, 'l', 0, { shortest: 6 }),
      achievementsNoShortestData: lessonAchievements(events, 'l', 0, {}),
      achievementsFilteredBySince: lessonAchievements(events, 'l', 10, { shortest: 6 }),
    };
  });
  await check('diagnose: 盤外はwall', () => boundary.wallReason, 'wall');
  await check('diagnose: 未到達はgoal', () => boundary.goalReason, 'goal');
  await check('diagnose: item未回収はitems', () => boundary.itemsReason, 'items');
  await check(
    'lessonAchievements: 正解・1回目・最短が全て揃う',
    () => boundary.achievementsAllMatch,
    ['よそうが ぴったり！', '1かいで ゴール！', 'いちばん みじかい めいれい！']
  );
  await check(
    'lessonAchievements: shortest未指定なら最短カードは出ない',
    () => boundary.achievementsNoShortestData,
    ['よそうが ぴったり！', '1かいで ゴール！']
  );
  await check('lessonAchievements: sinceTs以降のイベントが無ければ空配列', () => boundary.achievementsFilteredBySince, []);
}
