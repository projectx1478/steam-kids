// ⚙メニューのクレジット・ほごしゃの かたは、レッスン外（title・map）だけに出す（Issue #552 段1）。
// intro・tutorial・play・まとめ・teko の play では出さない。play のメニューで「離れる」と「とじる」の間は16px以上。
// 表示中のメニュー内ボタンは短辺64px以上。クレジット表示中の本体側メニューの扱いは段1の対象外（別 Issue）。
// 期待値は isEqual（正規表現は使えない）。期待値なしの check は真偽。

export const name = 'C15 ⚙メニュー: クレジット・ほごしゃはレッスン外のみ／離れると とじる の間16px以上／ボタン64px以上(Issue #552)';
import { enterTutorial, enterPlay, clearLesson } from '../helpers.mjs';

const LESSON = 'cmd-01-susumu';
const TEKO = 'teko-01-tsuriai';

// 開く⚙は、play・れんしゅうでは吹き出し欄右端の [data-action="menu"]、ほかはヘッダーの #gear-btn。見えているほうを押す。
async function openMenu(page) {
  const gear = page.locator('#gear-btn');
  if (await gear.isVisible()) await gear.click();
  else await page.click('[data-action="menu"]');
  await page.waitForSelector('#gear-menu:not([hidden])');
}

const smallButtons = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#gear-menu button')]
      .filter((b) => b.checkVisibility())
      .filter((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height) < 64 - 0.5)
      .map((b) => b.id)
  );

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });

  // predict は凍結fixtureの cmd-01（intro → predict）でしか見られないので、実JSONに替える前に見る（ui-gear-table と同じ）。
  await page.goto(`/index.html?lesson=${LESSON}`);
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'predict');
  await openMenu(page);
  await check('predict: 離れる が出る', () => page.isVisible('#menu-home'), true);
  await page.click('#menu-close');

  await page.unroute(`**/lessons/${LESSON}.json`);

  const closeMenu = () => page.click('#menu-close');
  const visible = (sel) => page.isVisible(sel);
  const outside = async (tag) => {
    await openMenu(page);
    await check(`${tag}: クレジットは出ない`, () => visible('#menu-credit-open'), false);
    await check(`${tag}: ほごしゃの かたは出ない`, () => visible('#menu-guardian'), false);
    await check(`${tag}: メニュー内のボタンは短辺64px以上`, () => smallButtons(page), []);
  };

  // --- レッスン外：title・map は出る ---
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/index.html');
  await page.waitForSelector('#stage[data-screen="title"]');
  await openMenu(page);
  await check('title: クレジットが見える', () => visible('#menu-credit-open'), true);
  await check('title: ほごしゃの かたが見える', () => visible('#menu-guardian'), true);
  await check('title: メニュー内のボタンは短辺64px以上', () => smallButtons(page), []);
  await page.click('#menu-credit-open');
  await check('title: クレジット側の ほごしゃの かた・とじる が見える', () =>
    page.evaluate(() => ['menu-credit-guardian', 'menu-credit-close'].every((id) => document.getElementById(id).checkVisibility())), true);
  const shown = (id) => page.evaluate((i) => document.getElementById(i).checkVisibility(), id);
  await check('title: クレジット側のみ（本体側は見えない）', async () =>
    [await shown('menu-main'), await shown('menu-credit-view')], [false, true]);
  await page.click('#menu-credit-close');
  await openMenu(page);
  await check('title: 開き直すと本体側のみ（クレジット側は見えない）', async () =>
    [await shown('menu-main'), await shown('menu-credit-view')], [true, false]);
  await page.click('#menu-close');

  await page.goto('/index.html?view=map');
  await page.waitForSelector('[data-lesson-id]');
  await openMenu(page);
  await check('map: クレジットが見える', () => visible('#menu-credit-open'), true);
  await check('map: ほごしゃの かたが見える', () => visible('#menu-guardian'), true);
  await check('map: メニュー内のボタンは短辺64px以上', () => smallButtons(page), []);

  // --- レッスン内：出ない ---
  await page.goto(`/index.html?lesson=${LESSON}`);
  await page.waitForSelector('[data-action="start"]');
  await outside('intro');
  await check('intro: 離れる が出る', () => visible('#menu-home'), true);
  await closeMenu();

  await enterTutorial(page);
  await outside('tutorial');
  await closeMenu();
  await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');

  await outside('play');
  const gapPx = await page.evaluate(() => {
    const home = document.getElementById('menu-home').getBoundingClientRect();
    const close = document.getElementById('menu-close').getBoundingClientRect();
    return close.top - home.bottom;
  });
  await check('play: 離れる と とじる の間は16px以上', () => gapPx >= 16 - 0.5, true);
  await closeMenu();

  await clearLesson(page, LESSON);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'summary');
  await outside('まとめ');
  await check('まとめ: 離れる は出ない（とじる のみ）', () => visible('#menu-home'), false);
  await check('まとめ: とじる が出る', () => visible('#menu-close'), true);
  await closeMenu();

  await enterPlay(page, TEKO);
  await outside('teko play');
  await check('teko play: 離れる が出る', () => visible('#menu-home'), true);
  await closeMenu();

  // seedPick（たね選び）。ヘッダの⚙から開く（Issue #574 段A）。
  await page.goto('/index.html?lesson=cmd-06-practice');
  await page.waitForSelector('.seed-keypad');
  await outside('seedPick');
  await check('seedPick: 離れる が出る', () => visible('#menu-home'), true);
  await closeMenu();
}
