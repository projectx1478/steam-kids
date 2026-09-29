// keys（かぎとドア）：ドア開閉のDOM・効果音・失敗とクリア・色と形の区別(Issue #62)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'keys: data-door-open切替・pickup音・ドア衝突の失敗・色と形の区別(Issue #62)';

const lesson = {
  lessonId: 'g-keys-flow',
  unitId: 'g-keys',
  title: 'keys',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'かぎ' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ドアは あく？',
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 1 },
      goal: { x: 4, y: 1 },
      walls: [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 3, y: 0 }, { x: 3, y: 2 }],
      ice: [{ x: 1, y: 1 }],
      keys: [{ x: 0, y: 0, color: 'red' }, { x: 0, y: 2, color: 'blue' }],
      doors: [{ x: 2, y: 1, color: 'red' }, { x: 3, y: 1, color: 'blue' }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['up', 'down', 'down', 'up', 'right', 'right', 'right'],
      maxCommands: 9,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const sfxCount = (page, n) => page.evaluate((s) => window.__sfxLog.filter((x) => x === s).length, n);
const open = (page) => page.$$eval('.grid-cell[data-door]', (cs) => cs.map((c) => c.dataset.doorOpen));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('かぎ2つ・ドア2つが描画される', async () => [(await page.$$('.grid-cell[data-key]')).length, (await page.$$('.grid-cell[data-door]')).length].join(), '2,2');
  await check('最初はドアが閉じている', async () => (await open(page)).join(), 'false,false');
  await check('色ごとに形が違う(かぎ)', async () => page.$$eval('.grid-key-svg', (s) => new Set(s.map((e) => e.querySelector('g').innerHTML)).size), 2);
  await check('色ごとに形が違う(ドア)', async () => page.$$eval('.grid-door-svg', (s) => new Set(s.map((e) => e.querySelector('g').innerHTML)).size), 2);

  // 失敗：かぎ無しでこおりを滑ってドアに衝突
  for (const c of ['right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('閉じたドアに当たるとbump音', () => sfxCount(page, 'bump'), 1);
  await check('失敗してもドアは閉じたまま', async () => (await open(page)).join(), 'false,false');

  // 成功：赤→青の順にかぎを取る
  await clickRetry(page);
  await page.evaluate(() => (window.__sfxLog.length = 0));
  for (const c of ['up', 'down', 'down', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('かぎ2つでpickup音が2回', () => sfxCount(page, 'pickup'), 2);
  await check('両方のドアが開く', async () => (await open(page)).join(), 'true,true');
  await check('取ったかぎは消える', async () => (await page.$$('.grid-key-svg')).length, 0);
  await check('クリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
