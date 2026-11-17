// U2（Issue #741）：実行ボタン（run / #egg-try）が同じ行の「もどす」系より右にある。play では ← (#back-btn) が見えない。
import { enterPlay } from '../helpers.mjs';

export const name = 'U2 実行ボタンが右端・playで←が出ない（Issue #741）';

const LESSONS = ['sort-01-recipe', 'unfold-01-cube', 'egg-01-michi', 'teko-01-tsuriai'];

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const id of LESSONS) {
    await enterPlay(page, id);
    const sel = id.startsWith('egg') ? '#egg-try' : '[data-action="run"]';
    await check(`${id}: 実行ボタンが「もどす」系より右`, () =>
      page.evaluate((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        const row = document.querySelector(s).parentElement;
        return [...row.querySelectorAll('button')].filter((b) => b !== document.querySelector(s) && b.checkVisibility())
          .every((b) => { const q = b.getBoundingClientRect(); return r.left + r.width / 2 > q.left + q.width / 2; });
      }, sel), true);
    await check(`${id}: play で #back-btn が見えない`, () => page.evaluate(() => !document.querySelector('#back-btn')?.checkVisibility()), true);
  }
}
