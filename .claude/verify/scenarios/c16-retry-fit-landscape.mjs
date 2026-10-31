// 横向きの「ためしなおす」が枠に収まる（scrollWidth <= clientWidth）。seesaw（teko-01-tsuriai）と block（cmd-02-mijikaku）、
// 5端末（Issue #635 段B）。844×390 の block は他のボタン行の幅も 64px 以上（タップ目標）を保つ。

export const name = 'C16 ためしなおす: 5端末で枠に収まる(seesaw・block。844×390 は他のボタンも64px以上。Issue #635)';
import { enterPlay } from '../helpers.mjs';

const VIEWPORTS = [
  [360, 640],
  [768, 1024],
  [844, 390],
  [1024, 640],
  [1280, 800],
];

const retryFit = (page) => page.$eval('[data-action="retry"]', (b) => b.scrollWidth <= b.clientWidth);

export default async function run({ page, check }) {
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    const tag = `${w}×${h}`;

    // seesaw：動かさずに実行 → 傾いて失敗
    await enterPlay(page, 'teko-01-tsuriai');
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
    await check(`seesaw ${tag}: ためしなおすが枠に収まる`, () => retryFit(page), true);

    // block：命令を1つ入れて実行 → 失敗（ゴールに着かない）
    await enterPlay(page, 'cmd-02-mijikaku');
    await page.click('[data-command="left"]');
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
    await check(`block ${tag}: ためしなおすが枠に収まる`, () => retryFit(page), true);

    if (w === 844 && h === 390) {
      for (const action of ['clear-all', 'remove-last', 'step', 'retry']) {
        await check(`block ${tag}: ${action} の幅が64px以上`, () =>
          page.$eval(`[data-action="${action}"]`, (b) => b.getBoundingClientRect().width >= 64), true);
      }
    }
  }
}
