// ロボットは最後に進んだ方向を向き（見た目のみ）、ぶつかった時はその方向、クリア時は正面になる（Issue #146）。
// 表示中の向き＝<g data-facing>のうちdisplayがnoneでないもの。

export const name = 'ロボットの向き: 進行方向・衝突方向を向き、クリア時は正面(Issue #146)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'robot-facing-smoke',
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
      grid: { cols: 3, rows: 3 },
      start: { x: 0, y: 1 },
      goal: { x: 2, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'up'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const facing = (page) =>
  page.$$eval('.grid-player [data-facing]', (gs) => gs.filter((g) => g.style.display !== 'none').map((g) => g.dataset.facing).join(','));

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);

  // --- 1コマ実行: 各手の後に、その方向を向く（初期は正面） ---
  await enterPlay(page, 'robot-facing-smoke');
  await check('初期は正面', () => facing(page), 'down');
  for (const [cmd, dir] of [['right', 'right'], ['down', 'down'], ['left', 'left'], ['up', 'up']]) {
    await page.click(`[data-command="${cmd}"]`);
    await page.click('[data-action="step"]');
    await check(`${cmd}へ進むと${dir}を向く`, () => facing(page), dir);
    await page.click('[data-action="retry"]').catch(() => {});
    await enterPlay(page, 'robot-facing-smoke');
  }

  // --- 衝突（盤外）: ぶつかった方向を向く ---
  await page.click('[data-command="left"]');
  await page.click('[data-action="step"]');
  await check('盤外へ left でぶつかると left を向く', () => facing(page), 'left');

  // --- クリア: 最後の手が up（背中向き）でも、クリア時は正面へ向き直す ---
  await enterPlay(page, 'robot-facing-smoke');
  for (const c of ['right', 'right', 'up']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result="clear"]', { timeout: 8000 });
  await check('クリア時は正面を向く', () => facing(page), 'down');
  await check('表示中の向きは1つだけ', () => page.$$eval('.grid-player [data-facing]', (gs) => gs.filter((g) => g.style.display !== 'none').length), 1);
}
