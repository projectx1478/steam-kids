export const name = 'A3 ゴール紙ふぶき: ステージクリアはトースト時にDOM紙ふぶき0個・結果ダイアログで canvas 紙吹雪が出て約2秒で消える・キャラ本体の回転なし(Issue #104・#347)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'cmd-01-susumu');

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result="clear"]', { timeout: 8000 });

  // トースト時（ui-clear.js は showSuccess に confetti:false を渡す）は盤面のDOM紙ふぶきを出さない。
  await check('トースト時にDOMの紙ふぶき(.grid-confetti)が0個', async () => (await page.$$('.grid-confetti')).length, 0);

  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  const hasCanvas = await page.evaluate(
    () => document.querySelectorAll('[data-result-row] canvas[data-clear-confetti="true"]').length,
  );
  await check('結果ダイアログ表示時に canvas[data-clear-confetti] が1つある', () => hasCanvas, 1);
  await check('結果ダイアログ表示後もDOMの紙ふぶきは0個', async () => (await page.$$('.grid-confetti')).length, 0);

  const noRotation = await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('.grid-player')).transform;
    if (t === 'none') return true;
    const m = new DOMMatrix(t);
    return Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
  });
  await check('キャラ本体のtransformに回転成分がない', () => noRotation);

  await page.waitForTimeout(2600);
  await check('ダイアログ表示の約2秒後に紙吹雪の canvas が消える', async () => (await page.$$('canvas[data-clear-confetti]')).length, 0);
}
