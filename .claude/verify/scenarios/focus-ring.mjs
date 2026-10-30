// Issue #380: フォーカス枠は :focus-visible だけに出る。タップ（マウス）では出ず、キー操作（Tab）では出る。
// 期待値は isEqual（正規表現は使えない）。Playwright の click() は実機のタップと同じく :focus-visible にならない。

export const name = 'フォーカス枠: タップ後は命令チップに枠が出ず、Tabキー後は青い枠が出る(Issue #380)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-01-susumu');

  // ⑤ タップ後: 命令ボタンはフォーカスを持つが枠は出ない。
  await page.click('[data-command="up"]');
  await check('タップ後: 命令ボタンにフォーカスがある', () => page.$eval('[data-command="up"]', (b) => b === document.activeElement), true);
  await check('タップ後: 命令ボタンの outline-style は none', () => page.$eval('[data-command="up"]', (b) => getComputedStyle(b).outlineStyle), 'none');

  // キー操作後: Tab で移ったフォーカス要素に 4px の solid 枠が出る。
  await page.keyboard.press('Tab');
  await check('Tab 後: フォーカス要素の outline が solid 4px', () => page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  }), 'solid 4px');
  await check('Tab 後: 枠の色は青（#0369a1）', () => page.evaluate(() => getComputedStyle(document.activeElement).outlineColor), 'rgb(3, 105, 161)');
}
