export const name = 'cmd-01-susumu: レイアウト（scrollWidth <= clientWidth）';

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

export default async function run({ page, check }) {
  await page.goto('/index.html');
  await check('introで横スクロールが出ない', async () => noHorizontalScroll(page));

  await page.click('[data-action="start"]');
  await check('predictで横スクロールが出ない', async () => noHorizontalScroll(page));

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playで横スクロールが出ない', async () => noHorizontalScroll(page));
}
