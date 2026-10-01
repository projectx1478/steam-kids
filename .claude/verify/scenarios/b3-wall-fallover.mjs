// 壁衝突でロボットが横に倒れ、1.2秒後に「もういちど」が2回パルス強調され、もういちどで
// 姿勢と位置が初期化される（Issue #214）。凍結fixtureに依存しないようrouteLessonのインライン
// 最小盤面で書く。

export const name = '壁衝突でロボットが横に倒れ、もういちどがパルス強調され、retryで姿勢が戻る(Issue #214)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'wall-fallover-smoke',
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
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 2 },
      walls: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'down', 'right', 'right', 'right', 'right'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const bodyTransform = (page) => page.$eval('.grid-player-body', (b) => b.style.transform);
const playerTransform = (page) => page.$eval('.grid-player', (t) => getComputedStyle(t).transform);

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);

  // 既定のreduced-motion（config.mjs）では倒れもパルスも出ないため、通常モーションで確認する。
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // --- じっこう: down,right(1つ目の壁でぶつかる) ---
  await enterPlay(page, 'wall-fallover-smoke');
  const startTransform = await playerTransform(page);
  await page.click('[data-command="down"]');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  // 倒れるアニメ(300ms)が終わるまで待ってから姿勢を確認。
  await page.waitForTimeout(500);
  await check('壁衝突でロボットが横に倒れる', () => bodyTransform(page), 'rotate(90deg) translateY(8px)');
  const bumpedTransform = await playerTransform(page);
  await page.waitForTimeout(500);
  await check(
    '倒れたまま保持され、.grid-playerの位置(transform)はずれない',
    async () => {
      const now = await playerTransform(page);
      return now === bumpedTransform && now !== 'none' && now !== startTransform;
    },
    true
  );
  await check(
    '1.2秒後に「もういちど」がパルス強調(retry-pulse)される',
    () =>
      page
        .waitForFunction(() => document.querySelector('[data-action="retry"]')?.classList.contains('retry-pulse'), null, { timeout: 4000 })
        .then(() => true)
        .catch(() => false),
    true
  );
  // パルス(scale 1→1.08→1を2回=1.2秒)が終わるとクラスは外れる。
  await page.waitForFunction(() => !document.querySelector('[data-action="retry"]')?.classList.contains('retry-pulse'), null, { timeout: 4000 });

  // --- もういちど: 盤面が作り直され、姿勢・位置ともに初期値へ戻る ---
  await page.click('[data-action="retry"]');
  await page.waitForFunction(() => !document.querySelector('[data-transition="retry"]'), null, { timeout: 4000 });
  // popIn演出(WAAPI)がcomputed transformに乗るため終わってから確認する。
  await page.waitForTimeout(800);
  await check('もういちど後、姿勢が初期値に戻る', () => bodyTransform(page), '');
  await check('もういちど後、ロボットがstartに戻る', async () => (await playerTransform(page)) === startTransform, true);

  // --- reduced-motion: 倒れもパルスも出ない ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, 'wall-fallover-smoke');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await page.waitForTimeout(1600);
  await check('reduced-motionでは倒れない', () => bodyTransform(page), '');
  await check('reduced-motionではパルスクラスが付かない', () => page.$eval('[data-action="retry"]', (b) => b.classList.contains('retry-pulse')), false);
}
