// シーソー(teko-01-tsuriai)のクリア直後：操作行が空き枠（…）のまま盤面が縮まず、間のあとに結果ダイアログが
// 操作画面(.play-screen)全体に被さること。見出しは途中ステージのみ、つぎへが上・もういちどが下(Issue #342)。

export const name = 'C10 シーソーのクリア演出: 間→ダイアログ(.play-screen全体)・盤面の高さ不変・背面inert(Issue #342)';
import { enterPlay } from '../helpers.mjs';

const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  const boardBox = async () => await (await page.$('.board-area')).boundingBox();
  const playBox = async () => await (await page.$('.play-screen')).boundingBox();

  await enterPlay(page, 'teko-01-tsuriai');
  const boardBefore = await boardBox();

  // p1（途中ステージ）：解は2
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-gap]', { timeout: 10000 });
  await check('クリア直後: 操作行が空き枠（…）になる', async () => (await page.$$('[data-result-gap]')).length, 1);
  await check('クリア直後: 結果ボタンはまだ出ない', async () => (await page.$$('[data-action="next-stage"], [data-action="replay"]')).length, 0);
  await check('間の最中: 盤面(.board-area)の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await check('間の最中: ダイアログは無い', async () => (await page.$$('[data-result-dialog]')).length, 0);

  await page.waitForSelector('[data-result-dialog]', { timeout: 4000 });
  await check('間のあと: 「…」は消える', async () => (await page.$$('[data-result-gap]')).length, 0);
  await check('間のあと: 結果ボタンは操作行(.action-row)に出ない', async () => (await page.$$('.action-row [data-action="next-stage"], .action-row [data-action="replay"]')).length, 0);
  await check('ダイアログは操作画面(.play-screen)の外(#stage の子)にあり、その境界内に収まる(Issue #347)', async () => {
    const inPlay = await page.evaluate(() => {
      const row = document.querySelector('[data-result-dialog]').closest('[data-result-row]');
      return row.parentElement.id === 'stage' && row.closest('.play-screen') === null;
    });
    return inPlay && inside(await (await page.$('[data-result-dialog]')).boundingBox(), await playBox());
  }, true);
  await check('途中ステージ: 見出し「つぎへ すすもう」が出る', async () =>
    page.evaluate(() => document.querySelector('[data-result-dialog]').textContent.includes('つぎへ すすもう')), true);
  const nextBox = await (await page.$('[data-action="next-stage"]')).boundingBox();
  const replayBox = await (await page.$('[data-action="replay"]')).boundingBox();
  await check('つぎの ステージが上・もういちどが下', async () => nextBox.y < replayBox.y, true);
  await check('クリア前後で盤面(.board-area)の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await page.waitForTimeout(3600); // 「やったね！」トーストが消えて問い文へ戻った後も
  await check('トースト消去後も盤面の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await check('ダイアログ表示中: 背面の盤面・操作行が inert', async () =>
    page.evaluate(() => ['.board-area', '.action-row'].every((s) => document.querySelector(s).closest('[inert]') !== null)), true);
  await check('ダイアログ表示中: 「← もどる」は inert でない', async () =>
    page.evaluate(() => document.querySelector('#back-btn').closest('[inert]') === null), true);

  // もういちど：ダイアログと inert が片付き、操作行が戻る
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="run"]');
  await check('もういちど: ダイアログが消える', async () => (await page.$$('[data-result-dialog]')).length, 0);
  await check('もういちど: inert が外れる', async () =>
    page.evaluate(() => document.querySelector('[data-action="run"]').closest('[inert]') === null), true);

  // 最終ステージ（p3）：見出しなし・ボタンは next
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');
  await page.waitForSelector('[data-action="pos-right"]');
  for (let i = 0; i < 3; i += 1) await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');
  await page.waitForSelector('[data-action="pos-right"]');
  for (let i = 0; i < 5; i += 1) await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('最終ステージ: 見出しは出ない', async () =>
    page.evaluate(() => document.querySelector('[data-result-dialog]').querySelectorAll('p').length), 0);
  await check('最終ステージ: つぎへが上・もういちどが下', async () => {
    const n = await (await page.$('[data-action="next"]')).boundingBox();
    const r = await (await page.$('[data-action="replay"]')).boundingBox();
    return n.y < r.y;
  }, true);
}
