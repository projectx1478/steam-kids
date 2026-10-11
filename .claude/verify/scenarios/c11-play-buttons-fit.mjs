// 縦向きの play 画面で操作ボタン行（けす・ぜんぶ・1コマ・じっこう）の文字が溢れないこと（Issue #385）。

export const name = 'C11 play画面の操作ボタン: 縦向き3サイズで文字が溢れない・タップ領域64px(Issue #385)';
import { enterPlay } from '../helpers.mjs';

const SIZES = [
  [360, 640],
  [375, 667],
  [412, 915],
];

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await enterPlay(page, 'cmd-01-susumu');
    const buttons = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-sk-screen="actions"] button')].map((b) => ({
          action: b.dataset.action,
          // 文字の実際の描画範囲がボタンの外へ出た量（scrollWidthは字形の余白で数pxずれるため使わない）。
          overflow: (() => {
            const r = document.createRange();
            r.selectNodeContents(b);
            const t = r.getBoundingClientRect();
            const bb = b.getBoundingClientRect();
            return Math.max(bb.left - t.left, t.right - bb.right);
          })(),
          w: b.getBoundingClientRect().width,
          h: b.getBoundingClientRect().height,
        }))
      );
    await check(`${w}x${h}: 4ボタンが並ぶ`, async () => (await buttons()).map((b) => b.action), ['remove-last', 'clear-all', 'step', 'run']);
    await check(`${w}x${h}: 文字がボタンから溢れない（溢れpx）`, async () => (await buttons()).map((b) => Math.max(0, Math.round(b.overflow))), [0, 0, 0, 0]);
    await check(`${w}x${h}: タップ領域が64px以上`, async () => (await buttons()).every((b) => b.w >= 63.5 && b.h >= 63.5));
    await check(`${w}x${h}: 操作行が画面幅に収まる`, async () =>
      page.evaluate(() => {
        const r = document.querySelector('[data-sk-screen="actions"]').getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth + 0.5 && document.documentElement.scrollWidth <= window.innerWidth;
      })
    );
    await page.goto('/index.html');
  }
}
