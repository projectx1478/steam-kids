export const name = 'donguri-01/02: UI規則（タップ領域48px以上・文言20字以内・img0個・外部リンク0個）';

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

async function checkCommon(page, check, lessonId) {
  await check(`[${lessonId}] imgが0個`, async () => (await page.$$('img')).length, 0);
  await check(`[${lessonId}] 外部リンクが0個`, async () => (await page.$$('a[href^="http"]')).length, 0);
  await check(`[${lessonId}] introの全ボタンが48px以上`, async () => boxesOk(page));
  await check(`[${lessonId}] introの表示文言が20字以内`, async () => noLongLine(page));
}

// donguri-01-hirouはconfig.mjsが凍結した旧構造（predict込み・単一play）で検証する（他シナリオと同じ）。
async function checkDonguri01(page, check) {
  const lessonId = 'donguri-01-hirou';
  await page.goto(`/index.html?lesson=${lessonId}`);
  await checkCommon(page, check, lessonId);

  await page.click('[data-action="start"]');
  await check(`[${lessonId}] predictの全ボタンが48px以上`, async () => boxesOk(page));
  await check(`[${lessonId}] predictの表示文言が20字以内`, async () => noLongLine(page));

  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check(`[${lessonId}] 予想結果表示の文言が20字以内`, async () => noLongLine(page));

  await page.click('[data-action="next"]');
  await check(`[${lessonId}] playの全ボタンが48px以上`, async () => boxesOk(page));
  await check(`[${lessonId}] playの表示文言が20字以内`, async () => noLongLine(page));
}

// donguri-02-mawarimichiは実JSON（よそう全廃・3ステージ。Issue #104）で検証する。
async function checkDonguri02(page, check) {
  const lessonId = 'donguri-02-mawarimichi';
  await page.goto(`/index.html?lesson=${lessonId}`);
  await checkCommon(page, check, lessonId);

  await page.click('[data-action="start"]');
  await check(`[${lessonId}] playの全ボタンが48px以上`, async () => boxesOk(page));
  await check(`[${lessonId}] playの表示文言が20字以内`, async () => noLongLine(page));
}

export default async function run({ page, check }) {
  await checkDonguri01(page, check);
  await checkDonguri02(page, check);
}
