// 24px以上の盤（6×6）では拡大の3項目を出さない。レッスン内の歯車に保護者リンクは出ない（Issue #552）。touch-action にも触らない（Issue #389 段B）。
export const name = '24px以上の盤では拡大の3項目が出ない（レッスン内の歯車に保護者リンクも出ない）(Issue #389・#552)';
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
  await page.click('[data-action="menu"]');
  await check('「がめん」（拡大の入口）は表示されない', () => page.isVisible('#menu-zoom-open'), false);
  await check('ズームバーも開いていない', () => page.$eval('#zoom-bar', (b) => b.hidden), true);
  await check('保護者リンクは出ない（レッスン内。Issue #552）', () => page.isVisible('#menu-guardian'), false);
  await check('盤面エリアの touch-action は指定なし・倍率の印もなし', () =>
    page.$eval('[data-sk-screen="board"]', (a) => `${a.style.touchAction}|${a.dataset.zoom}`), '|');
  await page.click('#menu-close');
  await page.hover('.grid-board');
  await page.mouse.wheel(0, -300);
  await check('ホイールを回しても盤面は変わらない', () => page.$eval('.grid-board', (b) => b.parentElement.style.transform), '');
}
