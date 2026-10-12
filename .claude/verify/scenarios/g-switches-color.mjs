// switches 色連動(group)：同じ group の離れた壁2枚が1つのスイッチで同時に消える／targets 方式の壁は従来どおり(Issue #392)。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'switches: group の壁がすべて同時に on→off・retryで復帰・targets方式は不変(Issue #392)';

const lesson = {
  lessonId: 'g-switches-color',
  unitId: 'g-switches',
  title: 'switches color',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'スイッチ' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'かべは どうなる？',
      grid: { cols: 6, rows: 4 },
      start: { x: 0, y: 1 },
      goal: { x: 5, y: 1 },
      walls: [{ x: 3, y: 0 }, { x: 3, y: 2 }, { x: 3, y: 3 }],
      groupWalls: [{ x: 3, y: 1, group: 'A' }, { x: 4, y: 3, group: 'A' }],
      switches: [{ x: 1, y: 3, color: 'red', group: 'A' }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'down', 'right', 'right', 'up', 'up', 'right', 'right', 'right'],
      maxCommands: 9,
    },
    {
      // targets 方式（従来）。group を使わない盤が変わらないことの確認
      stepId: 'p2',
      kind: 'play',
      text: 'かべは どうなる？',
      grid: { cols: 4, rows: 2 },
      start: { x: 0, y: 0 },
      goal: { x: 3, y: 1 },
      walls: [{ x: 3, y: 0 }, { x: 0, y: 1 }],
      switches: [{ x: 1, y: 0, targets: [{ x: 2, y: 1 }] }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'down', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const wallStates = (page) => page.$$eval('.grid-cell[data-switch-wall]', (cs) => cs.map((c) => c.dataset.switchWall));
const pressed = (page) => page.$$eval('.grid-cell[data-switch]', (cs) => cs.map((c) => c.dataset.switchPressed));
const NEXT = '[data-action="next"], [data-action="next-stage"]';
const tap = async (page, cmds) => {
  for (const c of cmds) await page.click(`[data-command="${c}"]`);
};

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  await check('group：スイッチ1つ・連動壁2つが描画される', async () => [(await page.$$('.grid-cell[data-switch]')).length, (await page.$$('.grid-cell[data-switch-wall]')).length].join(), '1,2');
  await check('group：最初は連動壁が両方有効(on)', async () => (await wallStates(page)).join(), 'on,on');

  // 失敗：スイッチを踏まずに連動壁(3,1)へ
  await tap(page, ['right', 'right', 'right']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('group：踏まずに進むと連動壁は有効のまま', async () => (await wallStates(page)).join(), 'on,on');

  await clickRetry(page);
  await check('group：もういちどで連動壁・スイッチが初期状態に戻る', async () => [(await wallStates(page)).join(), (await pressed(page)).join()].join('/'), 'on,on/false');
  await tap(page, ['down', 'down', 'right', 'right', 'up', 'up', 'right', 'right', 'right']);
  await page.click('[data-action="run"]');
  await page.waitForSelector(NEXT, { timeout: 15000 });
  await check('group：1回踏むと離れた連動壁が両方同時に消える(off)', async () => (await wallStates(page)).join(), 'off,off');
  await check('group：スイッチが押下済み', async () => (await pressed(page)).join(), 'true');

  // targets 方式の盤
  await page.click(NEXT);
  await page.waitForSelector('.grid-cell[data-switch-wall]', { timeout: 10000 });
  await check('targets：壁1枚・最初は有効(on)', async () => (await wallStates(page)).join(), 'on');
  await tap(page, ['right', 'right', 'down', 'right']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('targets：踏むと壁が消える(off)・スイッチ押下済み', async () => [(await wallStates(page)).join(), (await pressed(page)).join()].join('/'), 'off/true');
}
