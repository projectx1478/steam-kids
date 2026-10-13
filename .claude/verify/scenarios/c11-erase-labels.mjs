// C11 消すボタンの名前: 「１つけす」「ぜんぶけす」になり、360px幅でも4ボタンが1行に収まる（Issue #440）。

export const name = 'C11 消すボタンの名前: 「１つけす」「ぜんぶけす」で360pxでも1行に収まる(Issue #440)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-01-susumu');

  await check('１つけすの文言', () => page.$eval('[data-action="remove-last"]', (b) => b.textContent.trim()), '１つけす');
  await check('ぜんぶけすの文言', () => page.$eval('[data-action="clear-all"]', (b) => b.textContent.trim()), 'ぜんぶけす');

  const boxes = await page.evaluate(() =>
    ['remove-last', 'clear-all', 'step', 'run'].map((a) => {
      const el = document.querySelector(`[data-action="${a}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), right: Math.round(r.right), left: Math.round(r.left), h: Math.round(r.height), w: Math.round(r.width) };
    })
  );
  await check('4ボタンがそろっている', () => boxes.every(Boolean), true);
  await check('4ボタンが1行（top が同じ）', () => new Set(boxes.map((b) => b.top)).size, 1);
  await check('4ボタンが画面幅360px内', () => boxes.every((b) => b.left >= 0 && b.right <= 360), true);
  await check('高さ48px以上', () => boxes.every((b) => b.h >= 48), true);
  await check('文字が折り返さない（高さが全ボタンで同じ）', () => new Set(boxes.map((b) => b.h)).size, 1);
}
