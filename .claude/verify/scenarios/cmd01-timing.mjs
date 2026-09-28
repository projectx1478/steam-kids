export const name = 'cmd-01-susumu: 実行タイミング（2手目のdata-activeが600ms±100ms）';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await enterPlay(page, 'cmd-01-susumu');

  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');
  await page.click('[data-command="up"]');

  // クリック送信・DOM監視ともにページ内で完結させ、Playwright側のIPC往復時間を測定に含めない
  const elapsed = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        document.querySelector('[data-action="run"]').click();
        const poll = () => {
          const el = document.querySelector('.command-chip[data-index="1"]');
          if (el && el.dataset.active === 'true') {
            resolve(performance.now() - start);
          } else {
            requestAnimationFrame(poll);
          }
        };
        requestAnimationFrame(poll);
      })
  );
  await check('2手目のdata-activeが600ms±100msで付く', async () => elapsed >= 500 && elapsed <= 700);
}
