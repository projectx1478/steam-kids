// teko-08-ukabu2（predict-slider の buoyancy。「？の はこを はかろう」。開発者画面から入る。Issue #670・#710）：
// 8面を道具ボタンで通す（7・8面は段3で置き換わるまでの暫定の値）。2面は沈むにもつ、3面は別の組合せ（find:2）、4〜6面は？のはこ、360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-08-flow: teko-08を開発者画面から入り、8面・道具ボタン・360px幅(Issue #670/#710)';

const SOLUTIONS = [['w3', 'b2'], ['b1', 'b2'], ['w1', 'b2'], ['w3', 'b1'], ['w3', 'b2'], ['w2', 'b3'], ['w3', 'b2'], ['w3', 'b2']];
const SECOND_P3 = ['w2', 'b3'];

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
    if (i >= 3 && i <= 5) {
      await check(`${label}：？のはこは「？」だけで点も数字も無い`, async () => await page.evaluate(() => {
        const c = document.querySelector('[data-crate]');
        return !!c && c.textContent === '？' && !c.querySelector('.bu-dot') && !c.hasAttribute('data-dots');
      }), true);
    }
    for (const id of SOLUTIONS[i]) await page.click(`[data-action="tool-${id}"]`);
    await page.click('[data-action="run"]');
    if (i === 2) {
      // 3面（find:2）：1つ目のぴたりで道具が全部外れ、同じ組は「それは さっきと おなじ」、別の組でクリア
      const hintText = async () => (await page.textContent('[data-hint="buoyancy"]')) ?? '';
      await page.waitForFunction(() => document.querySelector('[data-hint="buoyancy"]')?.textContent.includes('べつの くみあわせも あるよ'), null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-action^="tool-"][aria-pressed="true"]').length === 0, null, { timeout: 10000 });
      await check('p3：1つ目のぴたりの後はクリアにならず編集に戻る', async () => (await page.$$('[data-action="next-stage"]')).length, 0);
      for (const id of SOLUTIONS[i]) await page.click(`[data-action="tool-${id}"]`);
      await page.click('[data-action="run"]');
      await page.waitForFunction(() => document.querySelector('[data-hint="buoyancy"]')?.textContent.includes('それは さっきと おなじ'), null, { timeout: 10000 });
      await check('p3：同じ組は「それは さっきと おなじ」', async () => (await hintText()).includes('それは さっきと おなじ'), true);
      await page.waitForFunction(() => document.querySelectorAll('[data-action^="tool-"][aria-pressed="true"]').length === 0, null, { timeout: 10000 });
      for (const id of SECOND_P3) await page.click(`[data-action="tool-${id}"]`);
      await page.click('[data-action="run"]');
    }
    const last = i === SOLUTIONS.length - 1;
    await page.waitForSelector(`[data-action="${last ? 'next' : 'next-stage'}"]`, { timeout: 10000 });
    if (!last) await page.click('[data-action="next-stage"]');
  }
  await check('p8：クリアで「つぎへ」が出る', async () => (await page.$$('[data-action="next"]')).length, 1);
}
