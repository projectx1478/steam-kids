export const name = 'A3 ゴール紙ふぶき: 粒子数≦30・1.5秒で除去・キャラ本体の回転なし';

export default async function run({ page, check }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  const confettiCount = await page.evaluate(() => document.querySelectorAll('.grid-confetti').length);
  await check('ゴールで紙ふぶきが1〜30個生成される', () => confettiCount >= 1 && confettiCount <= 30);

  const noRotation = await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('.grid-player')).transform;
    if (t === 'none') return true;
    const m = new DOMMatrix(t);
    return Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
  });
  await check('キャラ本体のtransformに回転成分がない', () => noRotation);

  await page.waitForTimeout(1600);
  await check('開始1.5秒後に紙ふぶきが0個になる', async () => (await page.$$('.grid-confetti')).length, 0);
}
