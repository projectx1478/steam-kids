// switches mode:"close"：初期は対象が床(off)、踏むと壁が出る(on)・出た壁への衝突失敗・retryで復帰・避ければクリア(Issue #149)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'switches close: 踏むと対象の壁が出る(off→on)・出た壁でbump・retryで床に戻る・避けてクリア(Issue #149)';

const lesson = {
  lessonId: 'g-switches-close',
  unitId: 'g-switches',
  title: 'switches close',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'スイッチ' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'かべは どうなる？',
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 1 },
      goal: { x: 4, y: 1 },
      walls: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
      switches: [{ x: 2, y: 1, mode: 'close', targets: [{ x: 3, y: 1 }] }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'up', 'right', 'right', 'right', 'down'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const sfxCount = (page, n) => page.evaluate((s) => window.__sfxLog.filter((x) => x === s).length, n);
const walls = (page) => page.$$eval('.grid-cell[data-switch-wall]', (cs) => cs.map((c) => c.dataset.switchWall));
const pressed = (page) => page.$$eval('.grid-cell[data-switch]', (cs) => cs.map((c) => c.dataset.switchPressed));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('スイッチ1つ・対象1つが描画される', async () => [(await page.$$('.grid-cell[data-switch]')).length, (await page.$$('.grid-cell[data-switch-wall]')).length].join(), '1,1');
  await check('最初は対象が床(off)でスイッチ未押下', async () => [(await walls(page)).join(), (await pressed(page)).join()].join('/'), 'off/false');

  // 失敗：スイッチを踏んで出た壁へ衝突
  for (const c of ['right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('踏むと対象に壁が出る(on)', async () => [(await walls(page)).join(), (await pressed(page)).join()].join('/'), 'on/true');
  await check('出た壁に当たるとbump音', () => sfxCount(page, 'bump'), 1);

  // 成功：スイッチを避けてゴール
  await clickRetry(page);
  await check('もういちどで対象が床(off)・スイッチ未押下に戻る', async () => [(await walls(page)).join(), (await pressed(page)).join()].join('/'), 'off/false');
  for (const c of ['right', 'up', 'right', 'right', 'right', 'down']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('避ければ対象は床のままクリアできる', async () => [(await walls(page)).join(), (await page.$$('[data-action="retry"]')).length].join('/'), 'off/0');
}
