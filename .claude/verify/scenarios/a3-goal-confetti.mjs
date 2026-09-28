export const name = 'A3 ゴール紙ふぶき: ステージクリアは60粒・2秒で除去・キャラ本体の回転なし(Issue #104)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'cmd-01-susumu');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  const confettiCount = await page.evaluate(() => document.querySelectorAll('.grid-confetti').length);
  // ステージクリア（showSuccess）は60粒・2秒で使う（単発クリアの反応が薄いという指摘への対応。Issue #104）。
  await check('ステージクリアで紙ふぶきが60個生成される', () => confettiCount, 60);

  const noRotation = await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('.grid-player')).transform;
    if (t === 'none') return true;
    const m = new DOMMatrix(t);
    return Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
  });
  await check('キャラ本体のtransformに回転成分がない', () => noRotation);

  await page.waitForTimeout(2100);
  await check('開始2秒後に紙ふぶきが0個になる', async () => (await page.$$('.grid-confetti')).length, 0);
}
