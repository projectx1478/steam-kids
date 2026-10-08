export const name =
  'C4 実機フィードバック一括対応: ヘッダー(もどる・えらぶ がめんへ)・反応統一・ヒント・もういちど・まとめ(Issue #91/#93/#104)';

import { enterPlay, clearStage, clickRetry } from '../helpers.mjs';

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

// cmd-02-mijikaku/cmd-03-naosuのtutorial（group/fix）をボタンでとばす。完了記録はレッスン単位
// のため、同じレッスンへ2回目以降に入る時は既に自動スキップ済みでボタンが無い（Issue #98）。
async function skipTutorialButton(page) {
  if ((await page.getAttribute('#stage', 'data-step')) !== 'tutorial') return;
  await page.click('[data-action="skip-tutorial"]');
}

export default async function run({ page, check }) {
  // config.mjsが凍結しているcmd-01-susumu・donguri-01-hirouは現行構造で検証する（c2・c3と同じ）。
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- 1. ヘッダー（タイトル・区分チップ・もどる・えらぶ がめんへ）・introのデモ ---
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await check('introではもどるが非表示', async () => page.isHidden('#back-btn'));
  await check('introでも えらぶ がめんへ は表示される', async () => page.isVisible('#home-btn'));
  await check('ヘッダーに単元名・レッスン名が表示される', async () => page.textContent('#lesson-title'), 'めいれいでうごかす ・ なおす');
  await check('introの区分チップ「はじめに」', async () => page.textContent('#step-kind-chip'), 'はじめに');
  await check('introにゴールデモが表示される', async () => (await page.$$('.demo-widget[data-demo="goal"]')).length, 1);
  await check(
    'reduced-motion時でもデモに「もういちど みる」がある（1回だけ自動再生し、再生はボタンで行う。Issue #104）',
    async () => (await page.$$('.demo-widget [data-action="demo-replay"]')).length,
    1
  );

  await page.click('[data-action="start"]');
  await check('はじめるは直接play(p1)へ進む（tutorialは「そうさほうほう」から。Issue #236）', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await skipTutorialButton(page);
  await check('playの区分チップ「うごかす 1/3」（複数ステージ構成。Issue #104）', async () => page.textContent('#step-kind-chip'), 'うごかす 1/3');
  await check('よそうは全廃。Issue #104', async () => page.getAttribute('#stage', 'data-step'), 'play');
  // cmd-03-naosuのp1はinitialCommands(3個)がmaxCommands(3)と同数のため、パレットは
  // 最初から満杯でdisabled。チップの取り消しで最初の操作を行う。
  await page.click('[data-remove-index="2"]');

  // --- もどる・えらぶ がめんへは確認ダイアログを挟まず即座に遷移する。誤タップの保険は
  // 確認ダイアログではなく命令列の下書き保持で行う（c6-tactile-ui.mjsで検証。Issue #95） ---
  await check('確認ダイアログは存在しない', async () => (await page.$$('.confirm-dialog')).length, 0);
  await page.click('#back-btn');
  // ← もどるはtutorial(fix)を飛ばしてintroへ戻る（Issue #236）。
  await check('確認無しでintroへ戻る', async () => page.getAttribute('#stage', 'data-step'), 'intro');

  await page.click('#home-btn');
  await check('えらぶ がめんへ も確認無しで即座に遷移する', async () => page.url().endsWith('/index.html?view=map'));

  // --- 2. playの失敗ヒント（壁）・その場でもういちど・ひとつ けす ---
  // 壁を持つのはp2（4x4, start(0,3), goal(3,0), walls[(2,2)]）なので、p1をクリアしてp2へ進む。
  await enterPlay(page, 'cmd-01-susumu');
  await check('play(p1)に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await clearStage(page, ['up', 'up', 'left', 'left']);
  await check('play(p2)に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('p2の区分チップ「うごかす 2/3」', async () => page.textContent('#step-kind-chip'), 'うごかす 2/3');

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

  // --- 不正解後は「もういちど」以外の操作をロックする（Issue #106）。編集ではなく
  //     もういちどのみで復帰させる ---
  await check('不正解後: ひとつ けすがdisabled', () => page.$eval('[data-action="remove-last"]', (b) => b.disabled), true);
  await check('不正解後: ぜんぶ けすがdisabled', () => page.$eval('[data-action="clear-all"]', (b) => b.disabled), true);
  await check('不正解後: 命令パレットが全てdisabled', async () => (await page.$$('[data-command]:not([disabled])')).length, 0);
  // このシナリオはreduced-motion既定（config.mjs）のため、ゆれる代わりに盤面へ0.5秒の
  // 静止リングが付く（Issue #106のreduced-motion分岐。ゆれ自体はc8-fail-lock.mjsで検証）。
  await check('不正解後: reduced-motionでは盤面に静止リングが付く', async () => (await page.$$('[data-sk-screen="board"].ring-amber-400')).length, 1);
  await check('不正解後: tryAgain音が鳴る', () => page.evaluate(() => window.__sfxLog.includes('tryAgain')));
  // ロック中はチップ×を押しても何も起きない（pointer-events-noneで受け付けない）
  await page.click('[data-remove-index="0"]', { force: true });
  await check('ロック中のチップ×は無反応', async () => (await page.$$('.command-chip')).length, 1);

  await clickRetry(page);
  await check('もういちどで[data-action="run"]に戻る', async () => (await page.$$('[data-action="run"]')).length, 1);
  await check('もういちどでヒント表示が消える', async () => (await page.$$('[data-hint]')).length, 0);
  await check('もういちどでチップが0個に戻る', async () => (await page.$$('.command-chip')).length, 0);
  await check('もういちどでロックが解除される（命令パレットが押せる）', () => page.$eval('[data-command="up"]', (b) => b.disabled), false);

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

  // --- もういちど（失敗後のretry）は正解・不正解に関わらず命令列をリセットする（Issue #104） ---
  await clickRetry(page);
  await check('retryで命令列は0個に戻る（前回の命令を残さない）', async () => (await page.$$('.command-chip')).length, 0);

  // --- item未回収ヒント（donguri-01-hirou）。items(1,3)/(2,3)を持つp2で検証する ---
  await enterPlay(page, 'donguri-01-hirou');
  await check('donguri play(p1)に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await clearStage(page, ['right', 'right', 'up', 'up']);
  await check('donguri play(p2)に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  // items(1,3)/(2,3)を踏まずにゴールへ直行する経路（up×3, right×3）
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('item未回収ヒント: 残りitemが2個とも点滅マーク', async () => (await page.$$('.grid-item[data-hint="true"]')).length, 2);
  await check('item未回収ヒントパネル', async () => (await page.$$('[data-hint="items"]')).length, 1);
  await check('item未回収ヒントは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'play item未回収ヒント');

  // --- 3. スマホの操作画面（375x667）：じっこうが画面内、横スクロール無し、全ボタン48px以上 ---
  await page.setViewportSize({ width: 375, height: 667 });
  await enterPlay(page, 'cmd-03-naosu');
  await check('mobile: playへ即座に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('mobile: じっこうボタンの下端が画面内', async () => {
    const box = await page.locator('[data-action="run"]').boundingBox();
    return box.y + box.height <= 667;
  });
  await check('mobile: 横スクロールが発生しない', async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  );
  await check('mobile: 全ボタンが64px以上', async () => {
    const boxes = [];
    for (const el of await page.$$('button')) {
      const b = await el.boundingBox();
      if (b) boxes.push(b);
    }
    return boxes.every((b) => b.width >= 64 && b.height >= 64);
  });
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- 4. ステージクリア演出（Issue #104: 拡大・fanfare・ジャンプ・紙ふぶき60粒）と、
  // クリア後「もういちど」で命令列がリセットされること ---
  await enterPlay(page, 'cmd-01-susumu');
  for (const c of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await check('ステージクリアで大きな「やったね！」（text-2xl）が出る', async () => {
    const cls = await page.getAttribute('.clear-reaction', 'class');
    return cls?.includes('text-2xl');
  });
  await check('ステージクリアの反応イベント数が増えている（fanfare音）', async () =>
    page.evaluate(() => window.__sfxLog.includes('fanfare'))
  );
  await check('途中ステージのクリアは「つぎの ステージ」が出る', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
  await check('途中ステージのクリアでも「もういちど」が出る', async () => (await page.$$('[data-action="replay"]')).length, 1);
  await page.click('[data-action="replay"]');
  await check('もういちどで結果表示が消える', async () => (await page.$$('#stage [data-result]')).length, 0);
  await check('もういちどで命令列は0個にリセットされる（Issue #104）', async () => (await page.$$('.command-chip')).length, 0);
  await clearStage(page, ['up', 'up', 'left', 'left']);
  await check('つぎの ステージでp2に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // --- なおす系（cmd-03）は「もういちど」で初期の「ずれた」列に戻る ---
  await enterPlay(page, 'cmd-03-naosu');
  await check('なおすp1は初期状態で3個のチップ', async () => (await page.$$('.command-chip')).length, 3);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  // 不正解直後は編集がロックされるため、もういちどを押してから直す（Issue #106）。
  await clickRetry(page);
  await page.click('[data-remove-index="1"]');
  await check('編集後は2個', async () => (await page.$$('.command-chip')).length, 2);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="replay"]');
  await check(
    'なおす系のもういちどは初期の「ずれた」列(3個)に戻る（空にすると直す題材が消えるため。Issue #104）',
    async () => (await page.$$('.command-chip')).length,
    3
  );

  // --- 5. まとめ：3ステージぶんの「できたこと」カード・単元スタンプ・つぎのレッスンへ ---
  await enterPlay(page, 'cmd-01-susumu');
  await clearStage(page, ['up', 'up', 'left', 'left']); // p1(最短4)
  await clearStage(page, ['up', 'up', 'up', 'right', 'right', 'right']); // p2(最短6)
  // p3(5x5, start(0,4), goal(4,0), 壁は列x=2のy=2のみ空き): up×2, right×4, up×2 = 最短8
  await clearStage(page, ['up', 'up', 'right', 'right', 'right', 'right', 'up', 'up']);

  await check('summaryに入る', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check(
    'できたことカードが3枚（3ステージクリア・1かいでゴール・最短）',
    async () => (await page.$$('.achievement-card')).length,
    3
  );
  await check('「3つの ステージを クリア！」が表示される', async () =>
    (await page.locator('.achievement-cards').innerText()).includes('3つの ステージを クリア！')
  );
  await check('単元スタンプがlessonIds数(3)だけ表示される', async () => (await page.$$('.unit-progress [data-stamp]')).length, 3);
  await check('つぎの レッスンへボタンが出る', async () => (await page.$$('[data-action="next-lesson"]')).length, 1);
  const boxSize = async (sel) => {
    const b = await (await page.$(sel)).boundingBox();
    return [Math.round(b.width), Math.round(b.height)];
  };
  await check('「つぎへ」と「おわる」が同じ大きさで並ぶ（Issue #263）', async () => (await boxSize('[data-action="next-lesson"]')), await boxSize('[data-action="finish"]'));
  await check('「つぎへ」の横に「おわる」がある', async () => {
    const a = await (await page.$('[data-action="next-lesson"]')).boundingBox();
    const b = await (await page.$('[data-action="finish"]')).boundingBox();
    return Math.abs(a.y - b.y) < 1 && b.x > a.x;
  });
  await check('summaryは20字以内', () => noLongLine(page));
  await assertNoNegativeWords(page, check, 'summary');

  // --- 不正解・複数回クリアでは別のカード文言になる（最短でもない） ---
  await enterPlay(page, 'donguri-02-mawarimichi');
  await clearStage(page, ['right', 'down', 'right', 'right', 'up', 'right']); // p1(最短6)
  await clearStage(page, ['down', 'down', 'right', 'right', 'right', 'up', 'up', 'right']); // p2(最短8)
  // p3は1回失敗させてから、最短(9)ではない手数(11)でクリアする
  await page.click('[data-command="down"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await clickRetry(page);
  for (const c of [
    'up', 'up',
    'right', 'left',
    'right', 'right', 'right',
    'down',
    'right', 'right',
    'down',
  ]) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await page.click('[data-action="next"]');
  await check('donguri-02 summaryに入る', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check(
    'あきらめずクリアのカード文言になる（最短カードは出ない）',
    async () => (await page.locator('.achievement-cards').innerText()).includes('あきらめずに')
  );
  await check(
    '最短カードは出ない（p3は最短9に対し11手でクリアしたため）',
    async () => !(await page.locator('.achievement-cards').innerText()).includes('いちばん みじかい')
  );
  await check('最終レッスンでは「つぎの レッスンへ」が出ない', async () => (await page.$$('[data-action="next-lesson"]')).length, 0);
  await check('最終レッスンでも「ほかのレッスンへ」は出る', async () => (await page.$$('[data-action="back-to-picker"]')).length, 1);
  await check('最終レッスンでも「おわる」は出る', async () => (await page.$$('[data-action="finish"]')).length, 1);
  await check('「しま クリア！」という表現は出ない', async () => !(await page.textContent('#stage')).includes('しま クリア'));
  await page.click('[data-action="finish"]');
  await page.waitForSelector('#stage[data-screen="title"]');
  await check('「おわる」でタイトル画面へ戻る', async () => page.getAttribute('#stage', 'data-screen'), 'title');

  // --- 単元ぜんぶクリア：cmd-02・cmd-03も片付けて「めいれいでうごかす」を全クリアする
  // （tutorial(group/fix)はとばす。Issue #98） ---
  await enterPlay(page, 'cmd-02-mijikaku');
  await clearStage(page, ['down', 'down', 'down', 'left', 'left']); // p1(2チップ)
  await clearStage(page, ['down', 'down', 'down', 'down', 'down', 'right', 'right']); // p2(2チップ)
  await clearStage(page, ['right', 'right', 'down', 'down', 'down', 'down', 'right']); // p3(3チップ)
  await check('cmd-02もsummaryに入る', async () => page.getAttribute('#stage', 'data-step'), 'summary');

  await enterPlay(page, 'cmd-03-naosu');
  await page.click('[data-remove-index="1"]'); // p1: 誤ったdownを消す
  await clearStage(page, []);
  await page.click('[data-remove-index="2"]'); // p2: 誤ったupを消す
  await clearStage(page, []);
  await page.click('[data-remove-index="6"]'); // p3: 誤ったupを消す
  await clearStage(page, []);
  // cmd-04・cmd-05は開発者画面専用（Issue #216）のため、cmd-03が単元の最終レッスンになる。
  await check('単元ぜんぶクリアで単元名を含む文言が出る（Issue #104）', async () =>
    (await page.textContent('#stage')).includes('めいれいでうごかす ぜんぶ クリア！')
  );
  await check('単元ぜんぶクリアでもメダルが表示される', async () => (await page.$$('#stage svg')).length > 0);
  await check('単元ぜんぶクリアでgrandFanfare音が鳴る', async () => page.evaluate(() => window.__sfxLog.includes('grandFanfare')));

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

    const singleStageEvents = [
      { lessonId: 'l', ts: 1, type: 'predict', payload: { correct: true } },
      { lessonId: 'l', ts: 2, type: 'run', payload: { commandCount: 6 } },
      { lessonId: 'l', ts: 3, type: 'clear', payload: {} },
    ];
    const multiStageEvents = [
      { lessonId: 'l', ts: 1, type: 'run', payload: { commandCount: 4 } },
      { lessonId: 'l', ts: 2, type: 'stage_clear', payload: { stage: 1 } },
      { lessonId: 'l', ts: 3, type: 'run', payload: { commandCount: 6 } },
      { lessonId: 'l', ts: 4, type: 'stage_clear', payload: { stage: 2 } },
      { lessonId: 'l', ts: 5, type: 'run', payload: { commandCount: 8 } },
      { lessonId: 'l', ts: 6, type: 'clear', payload: {} },
    ];

    return {
      wallReason: diagnose(wallResult, ['left'], spec).reason,
      goalReason: diagnose(goalResult, ['up'], spec).reason,
      itemsReason: diagnose(itemsResult, ['up', 'up', 'up', 'right', 'right', 'right'], itemsSpec).reason,
      // playStepIds省略時は単一ステージ扱い（1回で通したかの基準=1。既存の単一play教材との互換）。
      achievementsAllMatch: lessonAchievements(singleStageEvents, 'l', 0, { shortest: 6 }),
      achievementsNoShortestData: lessonAchievements(singleStageEvents, 'l', 0, {}),
      achievementsFilteredBySince: lessonAchievements(singleStageEvents, 'l', 10, { shortest: 6 }),
      achievementsMultiStage: lessonAchievements(multiStageEvents, 'l', 0, {
        shortest: 8,
        playStepIds: ['p1', 'p2', 'p3'],
      }),
    };
  });
  await check('diagnose: 盤外はwall', () => boundary.wallReason, 'wall');
  await check('diagnose: 未到達はgoal', () => boundary.goalReason, 'goal');
  await check('diagnose: item未回収はitems', () => boundary.itemsReason, 'items');
  await check(
    'lessonAchievements: 正解・1回目・最短が全て揃う（単一ステージ扱い）',
    () => boundary.achievementsAllMatch,
    ['よそうが ぴったり！', '1かいで ゴール！', 'いちばん みじかい めいれい！']
  );
  await check(
    'lessonAchievements: shortest未指定なら最短カードは出ない',
    () => boundary.achievementsNoShortestData,
    ['よそうが ぴったり！', '1かいで ゴール！']
  );
  await check('lessonAchievements: sinceTs以降のイベントが無ければ空配列', () => boundary.achievementsFilteredBySince, []);
  await check(
    'lessonAchievements: playStepIdsを渡すと3ステージぶんのカードになる（Issue #104）',
    () => boundary.achievementsMultiStage,
    ['3つの ステージを クリア！', '1かいで ゴール！', 'いちばん みじかい めいれい！']
  );
}
