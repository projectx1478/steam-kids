// teko-07-ukabu（predict-slider の buoyancy。うかぶ面。開発者画面から入る。Issue #288）：
// 浮く失敗→ヒント→やりなおし→おもり＋でクリア→p3は沈む失敗→おもり＋ふうせんでクリア→360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-07-flow: teko-07を開発者画面から入り、浮く・沈むヒント・クリア・360px幅(Issue #288)';

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

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-07が並ぶ', async () => (await page.$$('[data-lesson-id="teko-07-ukabu"]')).length, 1);

  await enterPlay(page, 'teko-07-ukabu');
  await noOverflow(page, 'p1', check);

  // p1 失敗（おもり1個＝浮く）
  await click(page, 'run');
  await page.waitForSelector('[data-hint="buoyancy"]', { timeout: 10000 });
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('p1：浮くヒントに「うかんだ」', async () => (await page.textContent('[data-hint="buoyancy"]')).includes('うかんだ'), true);
  await click(page, 'retry');
  await page.waitForSelector('[data-action="run"]');

  // p1 クリア
  await click(page, 'weight-plus');
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // p2：おもり＋2回
  await page.waitForSelector('[data-action="weight-plus"]');
  await noOverflow(page, 'p2', check);
  await click(page, 'weight-plus', 2);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // p3：ふうせん0個で − は押せない。開始のまま沈む
  await page.waitForSelector('[data-action="balloon-minus"]');
  await check('p3：ふうせん−は無効（0個）', () => page.locator('[data-action="balloon-minus"]').isDisabled(), true);
  await noOverflow(page, 'p3', check);
  await click(page, 'run');
  await page.waitForSelector('[data-hint="buoyancy"]', { timeout: 10000 });
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('p3：沈むヒントに「しずんだ」', async () => (await page.textContent('[data-hint="buoyancy"]')).includes('しずんだ'), true);
  await click(page, 'retry');
  await page.waitForSelector('[data-action="run"]');

  // p3 クリア（おもり2個・ふうせん2個）
  await click(page, 'weight-plus');
  await click(page, 'balloon-plus', 2);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
}
