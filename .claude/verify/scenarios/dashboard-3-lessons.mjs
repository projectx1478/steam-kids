export const name = 'ダッシュボード: 3本を完走するとレッスンカードが3枚表示される(Issue #31)';

const PASSCODE = 'testtest';

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
  await clearLesson2(page);
  await clearLesson3(page);

  await page.goto('/dashboard.html');
  await page.evaluate(async (passcode) => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode(passcode);
  }, PASSCODE);
  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');

  await check('3本ぶんのレッスンカードが表示される', async () => (await page.$$('.lesson-card')).length, 3);
  await check(
    '3本ともクリア状態(cleared)で表示される',
    async () => (await page.$$('.lesson-card[data-status="cleared"]')).length,
    3
  );
}
