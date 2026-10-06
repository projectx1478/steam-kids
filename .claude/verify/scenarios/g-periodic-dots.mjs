// periodic（周期ドア）の描画：data-periodic・ドット数・色の並び（周期2・3・4）・形（青●・黄▲・赤■）・現在の手番の黒い太縁が1コマごとに進む・クリア（Issue #310）。実レッスンに依存しない。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'periodic dots: ドット数・色と形・現在の手番が手ごとに進む・ドアの開閉(Issue #310)';

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
        { x: 1, y: 0, period: 2 },
        { x: 3, y: 1, period: 4 },
        { x: 3, y: 0, period: 3 },
      ],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'right', 'right', 'up'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const cellOf = (x, y) => `.grid-cell[data-x="${x}"][data-y="${y}"]`;
// そのドアのドット：色の並び（B青・Y黄・R赤）/ 形の並び（c●・t▲・s■）/今の手番の添字 / 黒い太縁（halo）が出ている添字
const L = { blue: 'B', yellow: 'Y', red: 'R' };
const dots = (page, x, y) =>
  page.$eval(`${cellOf(x, y)} svg.grid-periodic-dots`, (svg, L) => {
    const ds = [...svg.querySelectorAll('[data-dot]')];
    const halos = [...svg.querySelectorAll('[data-dot-halo]')];
    return [
      ds.map((c) => L[c.dataset.dotColor]).join(''),
      ds.map((c) => ({ circle: 'c', triangle: 't', square: 's' })[c.dataset.dotShape]).join(''),
      ds.findIndex((c) => c.dataset.dotCurrent === 'true'),
      halos.findIndex((h) => h.getAttribute('opacity') === '1'),
    ].join('/');
  }, L);
const state = (page, x, y) => page.$eval(cellOf(x, y), (c) => [c.dataset.periodic, c.dataset.periodicOpen, c.dataset.periodicTurn].join('/'));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('周期ドアが3つ描画される', async () => (await page.$$('.grid-cell[data-periodic]')).length, 3);
  await check('ドット数は周期の数（2・4・3）', async () => [(await page.$$(`${cellOf(1, 0)} [data-dot]`)).length, (await page.$$(`${cellOf(3, 1)} [data-dot]`)).length, (await page.$$(`${cellOf(3, 0)} [data-dot]`)).length].join(), '2,4,3');
  // 色の並び/形の並び/今の手番/黒い太縁の添字
  await check('周期2：青赤・形●■・今は手番0', () => dots(page, 1, 0), 'BR/cs/0/0');
  await check('周期3：青黄赤・形●▲■・今は手番0', () => dots(page, 3, 0), 'BYR/cts/0/0');
  await check('周期4：青青黄赤・形●●▲■・今は手番0', () => dots(page, 3, 1), 'BBYR/ccts/0/0');
  await check('最初は手番0で開いている（周期2）', () => state(page, 1, 0), '2/true/0');

  for (const c of ['down', 'right', 'right', 'up']) await page.click(`[data-command="${c}"]`);
  // 1手ごとに今の手番（と黒い太縁）が進む。周期2のドアは開（青）・閉（赤）を交互に繰り返す。
  const L2 = 'BR/cs';
  const L3 = 'BYR/cts';
  const L4 = 'BBYR/ccts';
  for (let k = 1; k <= 4; k++) {
    await page.click('[data-action="step"]');
    await check(`${k}手目後：周期2ドアの開閉と手番`, () => state(page, 1, 0), `2/${k % 2 === 0}/${k % 2}`);
    await check(`${k}手目後：周期2のドット`, () => dots(page, 1, 0), `${L2}/${k % 2}/${k % 2}`);
    await check(`${k}手目後：周期3のドット`, () => dots(page, 3, 0), `${L3}/${k % 3}/${k % 3}`);
    await check(`${k}手目後：周期4のドット`, () => dots(page, 3, 1), `${L4}/${k % 4}/${k % 4}`);
  }
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('ドアを通らず迂回してゴール（クリア）', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
