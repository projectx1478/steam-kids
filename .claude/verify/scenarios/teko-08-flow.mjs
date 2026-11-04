// teko-08-ukabu2（predict-slider の buoyancy。いろいろなふうせん。開発者画面から入る。Issue #670）：
// 8面を面ごとの手順で通す。使わない道具がある面、逆向き、ふうせん過多から減らす、大きい答え、360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-08-flow: teko-08を開発者画面から入り、8面・start値・360px幅(Issue #670)';

async function click(page, action, n = 1) {
  for (let k = 0; k < n; k += 1) await page.click(`[data-action="${action}"]`);
}

async function noOverflow(page, label, check) {
  await page.setViewportSize({ width: 360, height: 640 });
  const o = await page.evaluate(() => {
    const e = document.documentElement;
    return e.scrollWidth <= e.clientWidth;
  });
  await check(`${label}：360px幅で横にはみ出さない`, () => o, true);
  await page.setViewportSize({ width: 1024, height: 640 });
}

async function robotData(page, key) {
  return Number(await page.evaluate((k) => document.querySelector('[data-robot]').dataset[k], key));
}

// 押す回数 → run → 次へ
async function solve(page, { wp = 0, wm = 0, bp = 0, bm = 0 }, last = false) {
  await click(page, 'weight-plus', wp);
  await click(page, 'weight-minus', wm);
  await click(page, 'balloon-plus', bp);
  await click(page, 'balloon-minus', bm);
  await click(page, 'run');
  const next = last ? 'next' : 'next-stage';
  await page.waitForSelector(`[data-action="${next}"]`, { timeout: 10000 });
  if (!last) await click(page, 'next-stage');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-08が並ぶ', async () => (await page.$$('[data-lesson-id="teko-08-ukabu2"]')).length, 1);

  await enterPlay(page, 'teko-08-ukabu2');

  // 1面：強いふうせん。(0,0) から
  await page.waitForSelector('[data-action="balloon-plus"]');
  await check('p1：おもり0個から始まる', async () => await robotData(page, 'weights'), 0);
  await check('p1：ふうせん0個から始まる', async () => await robotData(page, 'balloons'), 0);
  await noOverflow(page, 'p1', check);
  await solve(page, { wp: 1, bp: 1 });

  // 2面：ふうせんを使わない。+ は有効のまま
  await page.waitForSelector('[data-action="balloon-plus"]');
  await check('p2：おもり1個から始まる', async () => await robotData(page, 'weights'), 1);
  await check('p2：ふうせん＋は有効（使わない道具）', () => page.locator('[data-action="balloon-plus"]').isEnabled(), true);
  await solve(page, { wp: 1 });

  // 3面
  await page.waitForSelector('[data-action="balloon-plus"]');
  await solve(page, { wp: 2, bp: 1 });

  // 4面：逆向き混在（おもり3から減らす）
  await page.waitForSelector('[data-action="weight-minus"]');
  await check('p4：おもり3個から始まる', async () => await robotData(page, 'weights'), 3);
  await solve(page, { wm: 1, bp: 1 });

  // 5面：ふうせん過多から減らす
  await page.waitForSelector('[data-action="balloon-minus"]');
  await check('p5：ふうせん2個から始まる', async () => await robotData(page, 'balloons'), 2);
  await solve(page, { wp: 3, bm: 1 });

  // 6面
  await page.waitForSelector('[data-action="balloon-plus"]');
  await solve(page, { wp: 1, bp: 2 });

  // 7面：ふうせん3つから減らしつつ足す
  await page.waitForSelector('[data-action="balloon-minus"]');
  await check('p7：ふうせん3個から始まる', async () => await robotData(page, 'balloons'), 3);
  await solve(page, { wp: 2, bm: 1 });

  // 8面：大きい答え（最終面）
  await page.waitForSelector('[data-action="balloon-plus"]');
  await noOverflow(page, 'p8', check);
  await solve(page, { wp: 4, bp: 1 }, true);
  await check('p8：クリアで「つぎへ」が出る', async () => (await page.$$('[data-action="next"]')).length, 1);
}
