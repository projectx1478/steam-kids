export const name = 'cmd-04/05: くりかえしの箱の操作・箱内ハイライト・クリア・360x640レイアウト(Issue #66)';

import { enterPlay, clearLesson } from '../helpers.mjs';

const chips = (page) => page.$$eval('.command-chip', (els) => els.length);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-04-kurikaeshi');

  await check('パレットに「はこ」ボタンがある', async () => (await page.$('[data-action="box-open"]')) !== null, true);
  await check('箱が閉じている間は回数ボタン・とじるが無い', async () => (await page.$('[data-action="box-times"]')) === null, true);

  const boardClosed = await page.$eval('.board-area svg', (e) => e.getBoundingClientRect().height);
  await page.click('[data-action="box-open"]');
  await check('はこ→空の箱が1チップ（開いている）', async () => page.$eval('.command-chip', (e) => [e.dataset.box, e.dataset.open]), ['true', 'true']);
  await check('箱を開いている間はじっこうボタンが出ない(かいすう・とじるに差し替え)', async () => (await page.$('[data-action="run"]')) === null, true);
  await page.click('[data-command="right"]');
  await check('開いている間の方向タップは箱の中へ入る(チップは1個のまま)', async () => [await chips(page), await page.$$eval('.command-chip [data-inner]', (e) => e.length)], [1, 1]);
  await check('回数の初期値は×2', () => page.textContent('[data-action="box-times"]'), 'かいすう ×2');
  await page.click('[data-action="box-times"]');
  await page.click('[data-action="box-times"]');
  await check('回数ボタン2タップで×4', () => page.textContent('.box-times'), 'はこ ×4');
  await page.click('[data-action="box-times"]');
  await check('×4の次は×2へ戻る', () => page.textContent('.box-times'), 'はこ ×2');
  await page.click('[data-action="box-times"]');
  await page.click('[data-action="box-times"]');

  // maxCommands=3: 箱1＋右1=2。あと1つだけ入る。
  await page.click('[data-command="up"]');
  await check('箱1+中2=3チップで上限、方向ボタンが無効', () => page.$eval('[data-command="up"]', (b) => b.disabled), true);
  await page.click('[data-action="remove-last"]');
  await check('開いている間のけすは箱の中の最後の1個を消す', async () => page.$$eval('.command-chip [data-inner]', (e) => e.length), 1);

  await check('360x640で横スクロールが出ない', async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await check('全ボタンが48px以上', async () => {
    for (const el of await page.$$('button')) {
      const b = await el.boundingBox();
      if (b && (b.width < 48 || b.height < 48)) return false;
    }
    return true;
  }, true);
  const board = await page.$eval('.board-area svg', (e) => e.getBoundingClientRect().height);
  await check('箱を開いても盤面の高さが変わらない', async () => Math.round(board) === Math.round(boardClosed), true);

  await page.click('[data-action="box-close"]');
  await check('とじると回数ボタンが消える', async () => (await page.$('[data-action="box-times"]')) === null, true);

  await page.click('[data-action="run"]');
  await page.waitForSelector('.command-chip [data-inner][data-active="true"]', { timeout: 4000 });
  await check('実行中、箱チップ(index0)の中の実行位置がハイライトされる', async () => page.$eval('.command-chip[data-active="true"]', (e) => e.dataset.index), '0');
  await page.waitForSelector('[data-action="next-stage"], [data-action="retry"]', { timeout: 12000 });
  await check('箱[みぎ]×4でp1クリア', async () => (await page.$('[data-action="next-stage"]')) !== null, true);

  // 全ステージをsolution(箱含む)でクリア。cmd-04・cmd-05とも。
  await clearLesson(page, 'cmd-04-kurikaeshi');
  await check('cmd-04をクリアしてまとめへ', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('repeatBoxのまとめは「いちばんみじかい」カードを出さない', async () => !(await page.locator('body').innerText()).includes('いちばん'), true);
  await clearLesson(page, 'cmd-05-kurikaeshi-donguri');
  await check('cmd-05をクリアしてまとめへ', async () => page.getAttribute('#stage', 'data-step'), 'summary');
}
