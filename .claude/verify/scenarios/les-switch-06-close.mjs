// switch-06-kabe-deru：開発者画面から入り、スイッチを避けて2ステージをクリアできる(Issue #149)。
import { clearStage } from '../helpers.mjs';

export const name = 'switch-06: 開発者画面から入りスイッチを避けて2ステージをクリア(Issue #149)';

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev: switch-06が並ぶ', async () => (await page.$$('[data-lesson-id="switch-06-kabe-deru"]')).length, 1);
  await check('通常画面にはswitch-06が出ない', async () => {
    await page.goto('/index.html?view=map');
    return (await page.$$('[data-lesson-id="switch-06-kabe-deru"]')).length;
  }, 0);

  await page.goto('/index.html?view=map&dev=1');
  await page.click('[data-lesson-id="switch-06-kabe-deru"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');

  await check('p1: スイッチ1つ、対象は最初は床(off)', async () =>
    [(await page.$$('.grid-cell[data-switch]')).length, await page.$$eval('.grid-cell[data-switch-wall]', (cs) => cs.map((c) => c.dataset.switchWall).join())].join('/'), '1/off');

  await clearStage(page, ['right', 'up', 'right', 'right', 'right', 'down']);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await check('p2へ進む', async () => (await page.$$('.grid-cell')).length, 20);

  await clearStage(page, ['right', 'up', 'up', 'right', 'right', 'down', 'down', 'right']);
  await check('最後までクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
