// 20×20 の盤（マス24px未満）で、歯車メニューに拡大の3項目が出て、倍率・touch-action が切り替わる（Issue #389 段B）。
// 拡大中も命令タイルのドラッグが従来どおり働き、動きを減らす設定では瞬時に切り替わる。
export const name = '拡大の3項目: 20×20 で倍率が変わり、touch-action は拡大中だけ none、ドラッグは不変(Issue #389)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'zoom-menu-smoke',
  unitId: 'inline',
  title: 'テスト',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ゴールへ いこう' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 20, rows: 20 },
      start: { x: 0, y: 0 },
      goal: { x: 19, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const area = (page) => page.$eval('[data-sk-screen="board"]', (a) => ({ zoom: a.dataset.zoom, ta: a.style.touchAction }));
// 歯車はパレットの ⚙（[data-action="menu"]）。拡大は ⚙ → メニューの「がめん」→ ズームバー（Issue #467）。
const openMenu = (page) => page.click('[data-action="menu"]');
// 盤面エリア以外（パレット・命令列・ページ）の touch-action の計算値。拡大の前後で変わらないことを見る。
const outsideTouchActions = (page) =>
  page.evaluate(() => ['[data-command="up"]', '.command-queue', '#stage', 'body'].map((s) => getComputedStyle(document.querySelector(s)).touchAction));

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'zoom-menu-smoke');

  await check('マスが24px未満でも盤面がエリア内に収まる', () =>
    page.evaluate(() => {
      const a = document.querySelector('[data-sk-screen="board"]').getBoundingClientRect();
      const b = document.querySelector('.grid-board').getBoundingClientRect();
      const c = document.querySelector('.grid-cell').getBoundingClientRect();
      return c.width < 24 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1 && b.left >= a.left - 1 && b.right <= a.right + 1;
    }), true);
  await check('すき間1px・余白2pxで描く', () => page.$eval('.grid-board', (b) => `${b.style.gap}/${b.style.padding}`), '1px/2px');
  await check('等倍中は pan-x pan-y（ページのスクロールを残す）', () => area(page), { zoom: '1', ta: 'pan-x pan-y' });

  const outsideBefore = await outsideTouchActions(page);
  await openMenu(page);
  await check('メニューに「がめん」が出る（拡大できる盤）', () => page.isVisible('#menu-zoom-open'), true);
  await check('メニューの「がめん」と保護者リンクは64px以上', () =>
    page.$$eval('#menu-zoom-open, #menu-guardian', (bs) => bs.every((b) => b.getBoundingClientRect().height >= 64)), true);
  await check('メニューの拡大は「がめん」1つだけ（おおきく等は並べない）', () =>
    page.$$eval('#gear-menu #zoom-in, #gear-menu #zoom-out, #gear-menu #zoom-all', (bs) => bs.length), 0);
  await page.click('#menu-zoom-open');
  await check('「がめん」を押すとメニューが閉じ、ズームバーが開く', () =>
    page.evaluate(() => document.getElementById('gear-menu').hidden && !document.getElementById('zoom-bar').hidden), true);
  await check('ズームバーの4ボタンは64px以上', () =>
    page.$$eval('#zoom-in, #zoom-out, #zoom-all, #zoom-back', (bs) => bs.every((b) => b.getBoundingClientRect().height >= 64 && b.getBoundingClientRect().width >= 64)), true);
  await check('等倍では「ちいさく」「ぜんぶみる」は押せない', () => page.$$eval('#zoom-out, #zoom-all', (bs) => bs.every((b) => b.disabled)), true);
  await check('子ども画面に「拡大」「縮小」の語が出ない', () => page.evaluate(() => !/拡大|縮小/.test(document.getElementById('gear-menu').textContent + document.getElementById('zoom-bar').textContent)), true);

  await page.click('#zoom-in');
  await check('おおきく→1.5倍、touch-action は none', () => area(page), { zoom: '1.5', ta: 'none' });
  await check('おおきくを押してもズームバーは閉じない（メニューは閉じたまま）', () =>
    page.evaluate(() => document.getElementById('gear-menu').hidden && !document.getElementById('zoom-bar').hidden), true);
  await check('盤面は再描画されない（transform の scale が付く）', () => page.$eval('.grid-board', (b) => b.parentElement.style.transform.includes('scale(1.5)')), true);
  await check('動きを減らす設定では瞬時（transition なし）', () => page.$eval('.grid-board', (b) => b.parentElement.style.transition), 'none');

  for (const z of ['2', '3']) {
    await page.click('#zoom-in');
    await check(`おおきく→${z}倍`, () => area(page), { zoom: z, ta: 'none' });
  }
  await check('3倍では「おおきく」が押せない', () => page.$eval('#zoom-in', (b) => b.disabled), true);
  await page.click('#zoom-out');
  await check('ちいさく→2倍', () => area(page), { zoom: '2', ta: 'none' });

  // 拡大中も命令タイルのドラッグ（パレット→命令列）が従来どおり働く。touch-action:none は盤面エリアだけ。
  const upBox = await page.locator('[data-command="up"]').boundingBox();
  const queueBox = await page.locator('.command-queue').boundingBox();
  await page.mouse.move(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(queueBox.x + queueBox.width / 2, queueBox.y + queueBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await check('拡大中もドラッグでチップが1個追加される', async () => (await page.$$('.command-chip')).length, 1);
  await check('盤面エリア以外（パレット・命令列・ページ）の touch-action は拡大前と同じ', () => outsideTouchActions(page), outsideBefore);
  await check('命令列・ページのスクロールは none にされていない', () => outsideBefore.slice(1).every((t) => t !== 'none'), true);

  await page.click('#zoom-all');
  await check('ぜんぶみる→等倍に戻り pan-x pan-y', () => area(page), { zoom: '1', ta: 'pan-x pan-y' });
  await check('等倍に戻ると transform が外れる', () => page.$eval('.grid-board', (b) => b.parentElement.style.transform), '');
  await check('ぜんぶみるでもズームバーは閉じない', () => page.$eval('#zoom-bar', (b) => b.hidden), false);
  await page.click('#zoom-back');
  await check('もどるでズームバーが閉じる', () => page.$eval('#zoom-bar', (b) => b.hidden), true);
}
