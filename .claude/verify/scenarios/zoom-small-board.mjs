// 24px以上の盤（6×6）では拡大の3項目を出さず、歯車は保護者リンクのみ。touch-action にも触らない（Issue #389 段B）。
export const name = '24px以上の盤では拡大の3項目が出ない（歯車は保護者リンクのみ）(Issue #389)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'zoom-small-smoke',
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
      grid: { cols: 6, rows: 6 },
      start: { x: 0, y: 0 },
      goal: { x: 5, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right', 'right'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'zoom-small-smoke');

  await check('マスは24px以上', () => page.$eval('.grid-cell', (c) => c.getBoundingClientRect().width >= 24), true);
  await check('すき間4px・余白4pxのまま', () => page.$eval('.grid-board', (b) => `${b.style.gap}/${b.style.padding}`), '4px/4px');
  await page.click('#gear-btn');
  await check('拡大の3項目は表示されない（0個）', () => page.$$eval('#menu-zoom button', (bs) => bs.filter((b) => b.offsetParent !== null).length), 0);
  await check('保護者リンクは出る', () => page.isVisible('#menu-guardian'), true);
  await check('盤面エリアの touch-action は指定なし・倍率の印もなし', () =>
    page.$eval('[data-sk-screen="board"]', (a) => `${a.style.touchAction}|${a.dataset.zoom}`), '|');
  await page.click('#menu-close');
  await page.hover('.grid-board');
  await page.mouse.wheel(0, -300);
  await check('ホイールを回しても盤面は変わらない', () => page.$eval('.grid-board', (b) => b.parentElement.style.transform), '');
}
