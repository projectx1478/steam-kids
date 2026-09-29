// switches：対象壁のDOM切替・pickup音・未踏の失敗・もういちどで壁が戻る(Issue #63)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'switches: data-switch-wall on→off・pickup音・未踏の衝突失敗・retryで復帰(Issue #63)';

const lesson = {
  lessonId: 'g-switches-flow',
  unitId: 'g-switches',
  title: 'switches',
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
      walls: [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 3, y: 0 }, { x: 3, y: 2 }],
      ice: [{ x: 1, y: 1 }],
      switches: [{ x: 0, y: 0, targets: [{ x: 2, y: 1 }] }, { x: 0, y: 2, targets: [{ x: 3, y: 1 }] }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['up', 'down', 'down', 'up', 'right', 'right', 'right'],
      maxCommands: 9,
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

  await check('スイッチ2つ・切替壁2つが描画される', async () => [(await page.$$('.grid-cell[data-switch]')).length, (await page.$$('.grid-cell[data-switch-wall]')).length].join(), '2,2');
  await check('最初は切替壁が有効(on)', async () => (await walls(page)).join(), 'on,on');
  await check('最初はスイッチが未押下', async () => (await pressed(page)).join(), 'false,false');

  // 失敗：スイッチを踏まずにこおりを滑って切替壁へ衝突
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('未押下の切替壁に当たるとbump音', () => sfxCount(page, 'bump'), 1);
  await check('失敗しても切替壁は有効のまま', async () => (await walls(page)).join(), 'on,on');

  // 成功：2つのスイッチを踏んでゴール
  await clickRetry(page);
  await check('もういちどで切替壁・スイッチが初期状態に戻る', async () => [(await walls(page)).join(), (await pressed(page)).join()].join('/'), 'on,on/false,false');
  await page.evaluate(() => (window.__sfxLog.length = 0));
  for (const c of ['up', 'down', 'down', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('スイッチ2つでpickup音が2回', () => sfxCount(page, 'pickup'), 2);
  await check('切替壁が両方消える(off)', async () => (await walls(page)).join(), 'off,off');
  await check('スイッチが両方押下済み', async () => (await pressed(page)).join(), 'true,true');
  await check('クリアできる', async () => (await page.$$('[data-action="retry"]')).length, 0);
}
