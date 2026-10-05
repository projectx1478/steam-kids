// paint：通ったマスに塗り・みほんミニ盤（320px幅に収まる）・はみ出し/塗り残しは失敗（文言ヒントは出さない）・別解でクリア・retryで塗り初期化(Issue #286)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'paint: 塗り・みほんミニ盤(320px)・はみ出し/塗り残しの失敗・別解クリア・retryで初期化(Issue #286)';

const cells = (list) => list.map(([x, y]) => ({ x, y }));
const lesson = {
  lessonId: 'g-paint-flow',
  unitId: 'g-paint',
  title: 'paint',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'いろぬり' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'みほんと おなじに しよう',
      grid: { cols: 4, rows: 4 },
      start: { x: 1, y: 1 },
      goal: { x: 1, y: 3 },
      walls: [],
      paint: cells([[0, 1], [1, 1], [2, 1], [1, 2], [1, 3]]),
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['left', 'right', 'right', 'left', 'down', 'down'],
      maxCommands: 6,
    },
    {
      stepId: 'p2',
      kind: 'play',
      text: 'みほんと おなじに しよう',
      grid: { cols: 6, rows: 6 },
      start: { x: 1, y: 1 },
      goal: { x: 3, y: 3 },
      walls: [],
      paint: cells([[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]]),
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'down', 'down', 'left', 'left', 'left', 'up', 'down', 'right', 'right'],
      maxCommands: 12,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const paintCount = (page) => page.$$eval('.grid-paint', (els) => els.length);
const run = async (page, cmds) => {
  for (const c of cmds) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
};

export default async function scenario({ page, check }) {
  await page.setViewportSize({ width: 320, height: 568 });
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('開始時はstartのマスだけ塗られている', () => paintCount(page), 1);
  await check('みほんミニ盤に目標の5マスが塗られている', () => page.$$eval('[data-paint-sample] [data-painted="true"]', (els) => els.length), 5);
  await check('みほんミニ盤が320px幅の画面内に収まる(4x4)', () =>
    page.$eval('[data-paint-sample]', (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= 320 && r.width > 0; }), true);

  // はみ出し：目標外(1,0)を塗る
  await run(page, ['up']);
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('はみ出しは失敗(クリアにならない)', async () => (await page.$$('[data-result="clear"]')).length, 0);
  await check('はみ出しは盤面側の枠が1つ出て、文言ヒントは出ない', async () =>
    [(await page.$$('.grid-marker')).length, (await page.$$('.hint-panel')).length].join(), '1,0');

  // 塗り残し：何も出さない
  await clickRetry(page);
  await check('もういちどで塗りがstartだけに戻る', () => paintCount(page), 1);
  await run(page, ['down', 'down']);
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('塗り残しは失敗で、枠も文言ヒントも出ない', async () =>
    [(await page.$$('[data-result="clear"]')).length, (await page.$$('.grid-marker')).length, (await page.$$('.hint-panel')).length].join(), '0,0,0');

  // 別解（右の腕を先に塗る）でクリア
  await clickRetry(page);
  await run(page, ['right', 'left', 'left', 'right', 'down', 'down']);
  await page.waitForSelector('[data-result="clear"]', { timeout: 15000 });
  await check('別解でクリアし完成文言が出る', async () => (await page.textContent('[data-result="clear"]')).includes('みほんと おなじ！'), true);
  await check('目標の5マスが塗られている', () => paintCount(page), 5);

  await page.waitForSelector('[data-action="next-stage"]', { timeout: 15000 });
  await page.click('[data-action="next-stage"]');
  await check('p2(6x6)のみほんミニ盤も320px幅に収まる', () =>
    page.$eval('[data-paint-sample]', (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= 320 && r.width > 0; }), true);
  await check('p2の盤面は6x6=36マス', async () => (await page.$$('.grid-cell')).length, 36);
}
