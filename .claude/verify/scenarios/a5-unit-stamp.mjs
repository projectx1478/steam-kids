export const name = 'A5 単元マップ: クリアでスタンプ、全クリアで旗(Issue #58)';

async function clearLesson1(page) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  for (const c of ['up', 'up', 'up', 'right', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
}

async function clearLesson2(page) {
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  for (const c of ['down', 'down', 'down', 'down', 'down', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
}

async function clearLesson3(page) {
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await page.click('[data-remove-index="2"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
}

export default async function run({ page, check }) {
  await clearLesson1(page);

  await page.goto('/index.html');
  await check(
    'レッスン1クリア後、そのボタンにスタンプが付く',
    async () => (await page.$$('[data-lesson-id="cmd-01-susumu"] ~ .lesson-stamp')).length,
    1
  );
  await check(
    '未クリアのレッスン2にはスタンプが無い',
    async () => (await page.$$('[data-lesson-id="cmd-02-mijikaku"] ~ .lesson-stamp')).length,
    0
  );
  await check('単元未達成の間は旗が無い', async () => (await page.$$('.unit-flag')).length, 0);
  await page.click('[data-lesson-id="cmd-02-mijikaku"]');
  await check(
    '入口から1タップでレッスンへ遷移する',
    async () => page.getAttribute('#stage', 'data-step'),
    'intro'
  );

  await clearLesson2(page);
  await clearLesson3(page);

  await page.goto('/index.html');
  await check('3本ともスタンプが付く', async () => (await page.$$('.lesson-stamp')).length, 3);
  await check('単元全クリアで旗が立つ', async () => (await page.$$('.unit-flag')).length, 1);
}
