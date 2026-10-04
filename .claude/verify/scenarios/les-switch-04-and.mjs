// switch-04-ryouhou：開発者画面から入り、2スイッチを両方踏んで共有の壁を開けて最後までクリアできる(Issue #250)。
import { clearStage } from '../helpers.mjs';

export const name = 'switch-04: 開発者画面から入り2スイッチのANDで2ステージをクリア(Issue #250)';

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev: switch-04が並ぶ', async () => (await page.$$('[data-lesson-id="switch-04-ryouhou"]')).length, 1);
  await check('通常画面にはswitch-04が出ない', async () => {
    await page.goto('/index.html?view=map');
    return (await page.$$('[data-lesson-id="switch-04-ryouhou"]')).length;
  }, 0);

  await page.goto('/index.html?view=map&dev=1');
  await page.click('[data-lesson-id="switch-04-ryouhou"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');

  await check('p1: スイッチ2つ・共有の壁1つが描画される', async () =>
    [(await page.$$('.grid-cell[data-switch]')).length, (await page.$$('.grid-cell[data-switch-wall]')).length].join(), '2,1');

  await clearStage(page, ['right', 'up', 'down', 'down', 'up', 'right', 'right', 'right']);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await check('p2へ進む', async () => (await page.$$('.grid-cell')).length, 16);

  await clearStage(page, ['right', 'down', 'down', 'down', 'left', 'up', 'right', 'right', 'right', 'down']);
  await check('最後までクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
