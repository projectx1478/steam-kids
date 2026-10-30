// Issue #380: tutorial 画面のキー操作。ガイド対象の矢印だけ効き、対象以外の矢印は効かない。
// cmd-01-susumu の script は up, up, right, right, run。期待値は isEqual（正規表現は使えない）。

export const name = 'キー操作(tutorial): ガイド対象の矢印だけ効く・対象以外は無視・Enterはrunのときだけ(Issue #380)';
import { enterTutorial } from '../helpers.mjs';

const chipCount = (page) => page.$$eval('.command-chip', (els) => els.length);

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await enterTutorial(page);
  await check('キー前: チップは0個', () => chipCount(page), 0);

  // ④ ガイド対象（up）以外の矢印は効かない。Enter（run 以外）も効かない。
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await check('ガイド対象以外の矢印・Enter・Backspace ではチップが増えない', () => chipCount(page), 0);
  await check('ガイドは進まない（index0がcurrent）', () => page.getAttribute('[data-guide-index="0"]', 'data-state'), 'current');

  // ガイド対象の矢印は効く。
  await page.keyboard.press('ArrowUp');
  await check('ガイド対象の ArrowUp でチップが1個増える', () => chipCount(page), 1);
  await page.keyboard.press('ArrowRight');
  await check('次の対象は up なので ArrowRight は効かない', () => chipCount(page), 1);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await check('お手本どおり4個積める', () => chipCount(page), 4);

  // run が対象になったら Enter で実行が始まる。
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
  await check('Enter で実行され区切り画面が出る', async () => (await page.$$('.tutorial-divider')).length, 1);
}
