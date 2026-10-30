// 拡大中の実行で、ロボットが盤面エリア内に追従する。実行後は自動で戻さない。メニューが開いている間は
// 実行ボタンを受けない（覆いが受ける）（Issue #389 段B）。
export const name = '拡大中の実行: ロボットが窓内に追従し、実行後も倍率を保つ。メニュー中は実行を受けない(Issue #389)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'zoom-follow-smoke',
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
      grid: { cols: 20, rows: 20 },
      start: { x: 0, y: 0 },
      goal: { x: 19, y: 19 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right'],
      maxCommands: 12,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const robotInArea = (page) =>
  page.evaluate(() => {
    const a = document.querySelector('[data-sk-screen="board"]').getBoundingClientRect();
    const r = document.querySelector('.grid-player').getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return cx >= a.left && cx <= a.right && cy >= a.top && cy <= a.bottom;
  });

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'zoom-follow-smoke');

  // 3倍にする：⚙ → メニューの「がめん」→ ズームバーで おおきく ×3（バーは倍率を変えても閉じない。Issue #467）。
  await page.click('[data-action="menu"]');
  await page.click('#menu-zoom-open');
  for (let i = 0; i < 3; i += 1) await page.click('#zoom-in');
  // じっこう・１コマはズームバーに重なるため、もどるでバーを閉じてから押す。
  await page.click('#zoom-back');
  await check('3倍になっている', () => page.$eval('[data-sk-screen="board"]', (a) => a.dataset.zoom), '3');

  // メニューが開いている間は、じっこうボタンを受けない（覆いが受ける）
  await page.click('[data-action="menu"]');
  await check('メニュー中、じっこうボタンの位置は覆いが受ける', () =>
    page.evaluate(() => {
      const r = document.querySelector('[data-action="run"]').getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id;
    }), 'menu-overlay');
  await page.click('#menu-close');

  for (const c of ['right', 'right', 'right', 'right', 'down', 'down', 'down', 'down']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await check('実行後もロボットは盤面エリア内に見えている', () => robotInArea(page), true);
  await check('実行後も3倍のまま（自動では戻さない）', () => page.$eval('[data-sk-screen="board"]', (a) => a.dataset.zoom), '3');
  await check('実行後も touch-action は none', () => page.$eval('[data-sk-screen="board"]', (a) => a.style.touchAction), 'none');
}
