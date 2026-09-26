export const name = 'C1: 予想はゴール非表示・playはもくひょう行とテキスト(Issue #80)';

async function noLongLine(page) {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .every((l) => l.length <= 20);
}

function noScrollX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

export default async function run({ page, check }) {
  // predictステップの盤面にゴールが出ない（星をゴール/答えと誤解された対策）
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('predict盤面のゴール要素が0個', async () => (await page.$$('[data-goal]')).length, 0);
  await check('predictの文言が20字以内', async () => noLongLine(page));

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('予想結果表示でもゴール要素が0個', async () => (await page.$$('[data-goal]')).length, 0);
  await page.click('[data-action="next"]');

  // playステップ：ゴールは旗＋文字（星のpolygonではない）、指示文はlessonのplay.text
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('playのゴール要素が1個', async () => (await page.$$('[data-goal]')).length, 1);
  await check(
    'ゴールセルに「ゴール」の文字がある',
    async () => (await page.locator('[data-goal]').innerText()).includes('ゴール')
  );
  await check(
    'ゴールセルに星のpolygonが無い',
    async () => (await page.locator('[data-goal]').innerHTML()).includes('polygon'),
    false
  );
  await check(
    '指示文がlessonのplay.text',
    async () => page.locator('.objective-row').first().locator('xpath=preceding-sibling::p[1]').innerText(),
    'ロボットを ゴールへ うごかそう'
  );
  await check('もくひょう行に「ゴール」表示がある', async () => (await page.locator('.objective-row').innerText()).includes('ゴール'));
  await check('items無レッスンにのこり表示が無い', async () => (await page.$$('[data-remaining]')).length, 0);
  await check('playで横スクロールが発生しない', async () => noScrollX(page));

  // play.text未指定時の既定文言（items無=cmd-02のtextを外したフィクスチャ）
  await page.route('**/lessons/cmd-02-mijikaku.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lessonId: 'cmd-02-mijikaku',
        unitId: 'commands',
        title: 'みじかくする',
        type: 'grid-runtime',
        estimatedMinutes: 5,
        steps: [
          { stepId: 's1', kind: 'intro', text: 'おなじ{道|みち}をみじかくしよう' },
          {
            stepId: 's2',
            kind: 'predict',
            text: 'ロボットは どこで とまる？',
            commands: ['down', 'down', 'down'],
            optionCells: [
              { id: 'A', x: 0, y: 3 },
              { id: 'B', x: 0, y: 2 },
              { id: 'C', x: 1, y: 3 },
            ],
            options: ['A', 'B', 'C'],
            answer: 'A',
          },
          {
            stepId: 's3',
            kind: 'play',
            grid: { cols: 3, rows: 6 },
            start: { x: 0, y: 0 },
            goal: { x: 2, y: 5 },
            walls: [],
            allowedCommands: ['up', 'down', 'left', 'right'],
            maxCommands: 3,
            groupRepeats: true,
          },
          { stepId: 's4', kind: 'summary', text: 'おなじむきは まとめよう' },
        ],
      }),
    })
  );
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check(
    'play.text未指定・items無の既定文言',
    async () => page.locator('.objective-row').first().locator('xpath=preceding-sibling::p[1]').innerText(),
    'ロボットを ゴールへ うごかそう'
  );

  // play.text未指定時の既定文言（items有=donguri-02のtextを外したフィクスチャ）
  await page.route('**/lessons/donguri-02-mawarimichi.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lessonId: 'donguri-02-mawarimichi',
        unitId: 'donguri',
        title: 'まわりみち',
        type: 'grid-runtime',
        estimatedMinutes: 5,
        steps: [
          { stepId: 's1', kind: 'intro', text: 'どんぐりを さがしに いこう' },
          {
            stepId: 's2',
            kind: 'predict',
            text: 'ロボットは どこで とまる？',
            commands: ['down', 'down', 'down'],
            optionCells: [
              { id: 'A', x: 0, y: 3 },
              { id: 'B', x: 0, y: 2 },
              { id: 'C', x: 2, y: 3 },
            ],
            options: ['A', 'B', 'C'],
            answer: 'A',
          },
          {
            stepId: 's3',
            kind: 'play',
            grid: { cols: 3, rows: 4 },
            start: { x: 0, y: 0 },
            goal: { x: 2, y: 0 },
            walls: [],
            items: [{ x: 1, y: 3 }],
            allowedCommands: ['up', 'down', 'left', 'right'],
            maxCommands: 9,
          },
          { stepId: 's4', kind: 'summary', text: 'とおまわりでも ぜんぶ ひろおう' },
        ],
      }),
    })
  );
  await page.goto('/index.html?lesson=donguri-02-mawarimichi');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check(
    'play.text未指定・items有の既定文言',
    async () => page.locator('.objective-row').first().locator('xpath=preceding-sibling::p[1]').innerText(),
    'どんぐりを ぜんぶ とって ゴール'
  );

  // donguri-01: のこり表示の初期値・回収での減少・もういちどでのリセット
  await page.goto('/index.html?lesson=donguri-01-hirou');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('のこり初期値が2', async () => page.locator('[data-remaining]').innerText(), '2');
  await check('donguri-01のもくひょう行を含めて横スクロールが発生しない', async () => noScrollX(page));

  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('1個回収でのこりが1', async () => page.locator('[data-remaining]').innerText(), '1');

  await page.click('[data-action="retry"]');
  await check('もういちどでのこりが2に戻る', async () => page.locator('[data-remaining]').innerText(), '2');
}
