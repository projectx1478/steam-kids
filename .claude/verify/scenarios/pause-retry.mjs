// 失敗時に「止まった地点から」やり直す（Issue #478・親 #395 段4）。maxPauses>0 のインライン盤面で、
// 止まる→続けて失敗→2ボタン（とちゅうから／さいしょから）→止まった地点まで戻って後ろを直して再挑戦、をDOMで判定する。

export const name = '失敗時に2ボタン「とちゅうから／さいしょから」が出て、止まった地点から直して再挑戦できる(Issue #478)';
import { enterPlay, routeLesson } from '../helpers.mjs';

const LESSON = 'pause-retry-smoke';
const LESSON_DEF = {
  lessonId: LESSON,
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
      grid: { cols: 5, rows: 1 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right'],
      maxCommands: 6,
      maxPauses: 2,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const count = (page, sel) => page.$$eval(sel, (els) => els.length);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, LESSON_DEF);
  await enterPlay(page, LESSON);

  // みぎ・とめる・ひだり：止まったあと続けると、ゴールに届かず失敗する。
  await page.click('[data-command="right"]');
  await page.click('[data-action="pause"]');
  await page.click('[data-command="left"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('.pause-mark', { timeout: 15000 });
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry-resume"]', { timeout: 15000 });

  await check('失敗すると「とちゅうから」が出る', () => page.$eval('[data-action="retry-resume"]', (e) => e.textContent.replace(/\s/g, '')), '✋とちゅうから');
  await check('失敗すると「さいしょから」が出る', () => page.$eval('[data-action="retry-restart"]', (e) => e.textContent.replace(/\s/g, '')), '↺さいしょから');
  await check('従来の「もういちど」は出ない', () => count(page, '[data-action="retry"]'), 0);
  await check('止まった地点があるので「とちゅうから」は押せる', () => page.$eval('[data-action="retry-resume"]', (b) => !b.disabled));
  await check('2ボタンとも64px以上で360pxの幅に収まる', () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-action="retry-resume"], [data-action="retry-restart"]')].every((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height >= 63.5 && r.left >= 0 && r.right <= 360;
      })));

  // 「とちゅうから」：止まった地点まで戻り、後ろ（ひだり）を直して再挑戦する。
  await page.click('[data-action="retry-resume"]');
  await page.waitForSelector('[data-action="run"]:not([disabled])', { timeout: 15000 });
  await check('とちゅうからで2ボタンが消える', () => count(page, '[data-action="retry-resume"], [data-action="retry-restart"]'), 0);
  await check('前の列（みぎ・とめる）は変更不可のまま', () => page.getAttribute('.command-chip[data-index="0"]', 'data-locked'), 'true');
  await check('後ろの列（ひだり）は変更できる', () => page.getAttribute('.command-chip[data-index="2"]', 'data-locked'), null);
  await page.click('[data-remove-index="2"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('止まった地点から直して到着し、クリアできる', () => count(page, '[data-action="next"]'), 1);
}
