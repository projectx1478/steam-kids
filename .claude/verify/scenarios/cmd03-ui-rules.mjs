export const name = 'cmd-03-naosu: UI規則（タップ領域48px以上・文言20字以内・横スクロール無し）';

async function boxesOk(page) {
  const boxes = [];
  for (const el of await page.$$('button')) {
    const box = await el.boundingBox();
    if (box) boxes.push(box);
  }
  return boxes.every((b) => b.width >= 48 && b.height >= 48);
}

async function noLongLine(page) {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .every((l) => l.length <= 20);
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-03-naosu');

  await check('introの全ボタンが48px以上', async () => boxesOk(page));
  await check('introの表示文言が20字以内', async () => noLongLine(page));
  await check('introで横スクロールが出ない', async () => noHorizontalScroll(page));

  await page.click('[data-action="start"]');
  await check('predictの全ボタンが48px以上', async () => boxesOk(page));
  await check('predictの表示文言が20字以内', async () => noLongLine(page));
  await check('predictで横スクロールが出ない', async () => noHorizontalScroll(page));

  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('予想結果表示の文言が20字以内', async () => noLongLine(page));

  await page.click('[data-action="next"]');
  await check('playの全ボタンが48px以上（初期チップ込み）', async () => boxesOk(page));
  await check('playの表示文言が20字以内', async () => noLongLine(page));
  await check('playで横スクロールが出ない', async () => noHorizontalScroll(page));
}
