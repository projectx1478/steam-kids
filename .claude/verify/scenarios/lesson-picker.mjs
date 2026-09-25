export const name = 'レッスン選択画面: ?lesson無しで5本から選べる(Issue #31, #60)';

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
  await page.goto('/index.html');

  await check('5本のレッスンボタンが表示される', async () => (await page.$$('.lesson-pick-btn')).length, 5);
  await check(
    'レッスン1のタイトルが表示される',
    async () => page.textContent('[data-lesson-id="cmd-01-susumu"]'),
    'すすむ'
  );
  await check(
    'レッスン2のタイトルが表示される',
    async () => page.textContent('[data-lesson-id="cmd-02-mijikaku"]'),
    'みじかくする'
  );
  await check(
    'レッスン3のタイトルが表示される',
    async () => page.textContent('[data-lesson-id="cmd-03-naosu"]'),
    'なおす'
  );
  await check(
    'donguri-01のタイトルが表示される',
    async () => page.textContent('[data-lesson-id="donguri-01-hirou"]'),
    'ひろう'
  );
  await check(
    'donguri-02のタイトルが表示される',
    async () => page.textContent('[data-lesson-id="donguri-02-mawarimichi"]'),
    'まわりみち'
  );
  await check('選択画面のボタンが48px以上', async () => boxesOk(page));
  await check('選択画面の表示文言が20字以内', async () => noLongLine(page));
  await check('選択画面で横スクロールが出ない', async () => noHorizontalScroll(page));

  await page.click('[data-lesson-id="cmd-02-mijikaku"]');
  await check('タップしたレッスンのintroへ遷移する', async () => page.getAttribute('#stage', 'data-step'), 'intro');
}
