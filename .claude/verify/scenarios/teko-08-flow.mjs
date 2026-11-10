// teko-08-ukabu2（predict-slider の buoyancy。「？の はこを はかろう」。開発者画面から入る。Issue #670・#710）：
// 段1では8面を道具ボタンで通す（3〜8面は段2・3で置き換わるまでの暫定の値）。2面は沈むにもつ、360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-08-flow: teko-08を開発者画面から入り、8面・道具ボタン・360px幅(Issue #670/#710)';

const SOLUTIONS = [['w3', 'b2'], ['b1', 'b2'], ['w3', 'b2'], ['w3', 'b2'], ['w3', 'b2'], ['w3', 'b2'], ['w3', 'b2'], ['w3', 'b2']];

async function noOverflow(page, label, check) {
  await page.setViewportSize({ width: 360, height: 640 });
  const o = await page.evaluate(() => {
    const e = document.documentElement;
    return e.scrollWidth <= e.clientWidth;
  });
  await check(`${label}：360px幅で横にはみ出さない`, () => o, true);
  await page.setViewportSize({ width: 1024, height: 640 });
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-08が並ぶ', async () => (await page.$$('[data-lesson-id="teko-08-ukabu2"]')).length, 1);

  await enterPlay(page, 'teko-08-ukabu2');

  for (let i = 0; i < SOLUTIONS.length; i += 1) {
    const label = `p${i + 1}`;
    await page.waitForSelector('[data-action^="tool-"]');
    await check(`${label}：道具ボタンは4個`, async () => await page.evaluate(() => document.querySelectorAll('[data-action^="tool-"]').length), 4);
    await check(`${label}：点は無い`, async () => await page.evaluate(() => document.querySelectorAll('[data-dots]').length), 0);
    if (i === 0 || i === 7) await noOverflow(page, label, check);
    if (i === 1) {
      // 2面：何も付けないと にもつが重くて沈む
      await page.click('[data-action="run"]');
      await page.waitForSelector('[data-hint="buoyancy"]', { timeout: 10000 });
      await check('p2：沈むヒント', async () => (await page.textContent('[data-hint="buoyancy"]')).includes('しずんだ'), true);
      await page.click('[data-action="retry"]');
      await page.waitForSelector('[data-action="run"]');
    }
    for (const id of SOLUTIONS[i]) await page.click(`[data-action="tool-${id}"]`);
    await page.click('[data-action="run"]');
    const last = i === SOLUTIONS.length - 1;
    await page.waitForSelector(`[data-action="${last ? 'next' : 'next-stage'}"]`, { timeout: 10000 });
    if (!last) await page.click('[data-action="next-stage"]');
  }
  await check('p8：クリアで「つぎへ」が出る', async () => (await page.$$('[data-action="next"]')).length, 1);
}
