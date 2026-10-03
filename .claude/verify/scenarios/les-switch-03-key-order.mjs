// switch-03-suicchi-kagi：開発者画面から入り、スイッチ→かぎ→ドアの順で最後までクリアできる(Issue #248)。
import { clearStage } from '../helpers.mjs';

export const name = 'switch-03: 開発者画面から入りスイッチ→かぎ→ドアの順で2ステージをクリア(Issue #248)';

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev: switch-03が並ぶ', async () => (await page.$$('[data-lesson-id="switch-03-suicchi-kagi"]')).length, 1);
  await check('通常画面にはswitch-03が出ない', async () => {
    await page.goto('/index.html?view=map');
    return (await page.$$('[data-lesson-id="switch-03-suicchi-kagi"]')).length;
  }, 0);

  await page.goto('/index.html?view=map&dev=1');
  await page.click('[data-lesson-id="switch-03-suicchi-kagi"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  if ((await page.getAttribute('#stage', 'data-step')) === 'tutorial') await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');

  await check('p1: スイッチ1・かぎ1・ドア1が描画される', async () =>
    [(await page.$$('.grid-cell[data-switch]')).length, (await page.$$('.grid-cell[data-key]')).length, (await page.$$('.grid-cell[data-door]')).length].join(), '1,1,1');

  await clearStage(page, ['right', 'right', 'right', 'right', 'right']);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await check('p2へ進む', async () => (await page.$$('.grid-cell')).length, 15);

  await clearStage(page, ['down', 'down', 'right', 'right', 'right', 'right', 'up', 'up']);
  await check('最後までクリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
