// periodic（周期ドア）の描画：data-periodic・ドット数・塗り／輪郭・現在の手番の強調が1コマごとに進む・クリア（Issue #310）。実レッスンに依存しない。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'periodic dots: ドット数・塗り/輪郭・現在の手番が手ごとに進む・ドアの開閉(Issue #310)';

const lesson = {
  lessonId: 'g-periodic-dots',
  unitId: 'g-periodic',
  title: 'periodic dots',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ドア' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ドアは あく？',
      grid: { cols: 4, rows: 2 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      periodic: [
        { x: 1, y: 0, period: 2, open: [1] },
        { x: 3, y: 1, period: 4, open: [0, 1] },
      ],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'right', 'right', 'up'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const cellOf = (x, y) => `.grid-cell[data-x="${x}"][data-y="${y}"]`;
// そのドアのドット：[塗り/輪郭の並び, 今の手番の添字]
const dots = (page, x, y) =>
  page.$$eval(`${cellOf(x, y)} [data-dot]`, (cs) => [cs.map((c) => (c.dataset.dotFill === 'filled' ? 'F' : 'O')).join(''), cs.findIndex((c) => c.dataset.dotCurrent === 'true')].join('/'));
const state = (page, x, y) => page.$eval(cellOf(x, y), (c) => [c.dataset.periodic, c.dataset.periodicOpen, c.dataset.periodicTurn].join('/'));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('周期ドアが2つ描画される', async () => (await page.$$('.grid-cell[data-periodic]')).length, 2);
  await check('ドット数は周期の数（2と4）', async () => [(await page.$$(`${cellOf(1, 0)} [data-dot]`)).length, (await page.$$(`${cellOf(3, 1)} [data-dot]`)).length].join(), '2,4');
  await check('周期2・open[1]：手番0は輪郭・手番1は塗り・今は手番0', () => dots(page, 1, 0), 'OF/0');
  await check('周期4・open[0,1]：塗り塗り輪郭輪郭・今は手番0', () => dots(page, 3, 1), 'FFOO/0');
  await check('最初は閉じている', () => state(page, 1, 0), '2/false/0');

  for (const c of ['down', 'right', 'right', 'up']) await page.click(`[data-command="${c}"]`);
  // 1手ごとに今の手番が進む（周期2のドアは0,1,0,1…。開閉も手番に追従する）
  const expected = [
    ['1手目後', '2/true/1', 'OF/1', 'FFOO/1'],
    ['2手目後', '2/false/0', 'OF/0', 'FFOO/2'],
    ['3手目後', '2/true/1', 'OF/1', 'FFOO/3'],
    ['4手目後', '2/false/0', 'OF/0', 'FFOO/0'],
  ];
  for (const [label, door, d2, d4] of expected) {
    await page.click('[data-action="step"]');
    await check(`${label}：周期2ドアの開閉と手番`, () => state(page, 1, 0), door);
    await check(`${label}：周期2のドット`, () => dots(page, 1, 0), d2);
    await check(`${label}：周期4のドット`, () => dots(page, 3, 1), d4);
  }
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('ドアを通らず迂回してゴール（クリア）', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
