// switch-05-koori：開発者画面から入り、氷の上のスイッチを滑走で通過して対象を開け、最後までクリアできる(Issue #249)。
import { clearStage } from '../helpers.mjs';

export const name = 'switch-05: 開発者画面から入り氷上スイッチの滑走通過で2ステージをクリア(Issue #249)';

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev: switch-05が並ぶ', async () => (await page.$$('[data-lesson-id="switch-05-koori"]')).length, 1);
  await check('通常画面にはswitch-05が出ない', async () => {
    await page.goto('/index.html?view=map');
    return (await page.$$('[data-lesson-id="switch-05-koori"]')).length;
  }, 0);

  await page.goto('/index.html?view=map&dev=1');
  await page.click('[data-lesson-id="switch-05-koori"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');

  await check('p1: スイッチが氷の上にあり、対象が1つ描画される', async () =>
    [(await page.$$('.grid-cell[data-switch][data-ice]')).length, (await page.$$('.grid-cell[data-switch-wall]')).length].join(), '1,1');

  await clearStage(page, ['right', 'down', 'down', 'right']);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await check('p2へ進む', async () => (await page.$$('.grid-cell')).length, 20);

  await clearStage(page, ['up', 'right', 'right', 'right', 'right', 'down', 'down', 'down']);
  await check('最後までクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
