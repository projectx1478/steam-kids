// 転がす球・おとし穴：転がして穴を埋めてクリア、ためしなおしで初期位置へ戻る。動かせない手は kind=ball の
// bounce だけ（壁の演出なし）。reduced-motion では回転なし（Issue #287）。
// 実レッスンに依存しないようrouteLessonのインライン最小盤面で書く（検証を通さないシナリオ専用の盤を含む）。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'rollBalls: 転がして穴を埋めてクリア・ためしなおしで戻る・動かせない手はkind=ball(Issue #287)';

const dirs = ['up', 'down', 'left', 'right'];
const mk = (lessonId, play) => ({
  lessonId,
  unitId: 'g-rollballs',
  title: 'rollballs',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'たま' },
    { stepId: 'p1', kind: 'play', text: 'ゴールへ', walls: [], allowedCommands: dirs, ...play },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
});

// 盤③（6×5・球2・穴2）。最短7手。
const flow = mk('g-rollballs-flow', {
  grid: { cols: 6, rows: 5 },
  start: { x: 0, y: 1 },
  goal: { x: 4, y: 4 },
  walls: [
    { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 },
    { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 5, y: 3 },
  ],
  rollBalls: [{ x: 1, y: 1 }, { x: 4, y: 2 }],
  pits: [{ x: 2, y: 1 }, { x: 4, y: 3 }],
  solution: ['right', 'right', 'right', 'right', 'down', 'down', 'down'],
  maxCommands: 9,
});
// 動かせない手の盤（3×2）：球(1,0)の先が壁(2,0)。
const stuck = mk('g-rollballs-stuck', {
  grid: { cols: 3, rows: 2 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 1 },
  walls: [{ x: 2, y: 0 }],
  rollBalls: [{ x: 1, y: 0 }],
  pits: [{ x: 1, y: 1 }],
  solution: ['down', 'right', 'right'],
  maxCommands: 5,
});

const ballState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-roll-ball="0"]');
    if (!el) return null;
    return { x: el.dataset.rollX, y: el.dataset.rollY, rot: el.querySelector('[data-roll-body]').style.transform };
  });
const animKinds = (page) => page.evaluate(() => window.__gridAnimLog.filter((e) => e.type === 'bounce').map((e) => e.kind));

export default async function run({ page, check }) {
  await routeLesson(page, flow);
  await routeLesson(page, stuck);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, flow.lessonId);

  await check('球2個・おとし穴2個が描かれる', async () => [(await page.$$('[data-roll-ball]')).length, (await page.$$('[data-pit]')).length], [2, 2]);
  await check('埋まった穴はまだ無い', async () => (await page.$$('[data-pit-filled="true"]')).length, 0);

  for (const c of ['right', 'right', 'right', 'right', 'down', 'down', 'down']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-roll-ball="0"]', { state: 'detached', timeout: 10000 });
  await page.waitForSelector('[data-pit="0"][data-pit-filled="true"]', { timeout: 10000 });
  await page.waitForSelector('[data-action="replay"]', { timeout: 15000 });
  await check('クリア後は球が両方消え、穴が両方埋まる', async () => [(await page.$$('[data-roll-ball]')).length, (await page.$$('[data-pit-filled="true"]')).length], [0, 2]);
  await check('失敗の再挑戦ボタンは出ない', async () => (await page.$$('[data-action="retry"]')).length, 0);

  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-roll-ball="0"]', { timeout: 10000 });
  await check('ためしなおすと球が初期位置(1,1)に戻り回転0', () => ballState(page), { x: '1', y: '1', rot: '' });
  await check('ためしなおすと穴は埋まっていない', async () => (await page.$$('[data-pit-filled="true"]')).length, 0);

  // --- 動かせない手：kind=ball が1件、wall は0件 ---
  await enterPlay(page, stuck.lessonId);
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('動かせない手はbounce kind=ballが1件', async () => (await animKinds(page)).filter((k) => k === 'ball').length, 1);
  await check('動かせない手でkind=wallのbounceは出ない', async () => (await animKinds(page)).filter((k) => k === 'wall').length, 0);
  await check('球は同じマスに残る', () => ballState(page), { x: '1', y: '0', rot: '' });

  // --- reduced-motion：回転なしで同じマスに残る ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, stuck.lessonId);
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('reduced-motion: bounce後も球はtransformなし(回転なし)で同じマス', () => ballState(page), { x: '1', y: '0', rot: '' });
}
