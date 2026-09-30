// 壁衝突の目回し演出（約1.2秒・クッションでは出ない・reduced-motionで静止）とスイッチ壁の沈み込み(Issue #168)。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = '壁衝突で目回しの星が出て約1.2秒で消える／クッションでは出ない／スイッチ壁が沈んで埋まる(Issue #168)';

const step = (id, extra) => ({
  stepId: id,
  kind: 'play',
  text: 'すすもう',
  grid: { cols: 4, rows: 1 },
  start: { x: 0, y: 0 },
  goal: { x: 3, y: 0 },
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['right', 'right', 'right'],
  maxCommands: 6,
  ...extra,
});
const lesson = (id, extra) => ({
  lessonId: id,
  unitId: 'inline',
  title: 'テスト',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [{ stepId: 's1', kind: 'intro', text: 'あそぼう' }, step('p1', extra), { stepId: 's2', kind: 'summary', text: 'おわり' }],
});

const dizzy = (page) => page.$$eval('.grid-dizzy', (e) => e.length);
const runCmds = async (page, cmds) => {
  for (const c of cmds) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
};

export default async function run({ page, check }) {
  await routeLesson(page, lesson('dz-wall', {}));
  await routeLesson(page, lesson('dz-cushion', { cushion: [{ x: 1, y: 0 }] }));
  await routeLesson(page, lesson('dz-switch', { switches: [{ x: 1, y: 0, targets: [{ x: 2, y: 0 }] }] }));

  // 壁（盤外）衝突：通常モーション
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'dz-wall');
  await runCmds(page, ['up']);
  await page.waitForSelector('.grid-dizzy', { timeout: 3000 });
  await check('壁衝突で目回しの星が出る', () => dizzy(page), 1);
  await check('星は回転アニメーション中', () => page.$eval('.grid-dizzy', (e) => e.getAnimations().length > 0), true);
  await page.waitForTimeout(1500);
  await check('約1.2秒後に星が消える', () => dizzy(page), 0);
  await check('もういちどは演出中でなくても押せる', () => page.$eval('[data-action="retry"]', (b) => b.disabled), false);

  // reduced-motion：静止表示
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, 'dz-wall');
  await runCmds(page, ['up']);
  await page.waitForSelector('.grid-dizzy', { timeout: 3000 });
  await check('reduced-motionでも星が出る', () => dizzy(page), 1);
  await check('reduced-motionでは星が静止', () => page.$eval('.grid-dizzy', (e) => e.getAnimations().length), 0);
  await page.waitForTimeout(1500);
  await check('reduced-motionでも約1.2秒後に消える', () => dizzy(page), 0);

  // クッション衝突：出ない
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'dz-cushion');
  await runCmds(page, ['right']);
  await page.waitForTimeout(800);
  await check('クッション衝突では星が出ない', () => dizzy(page), 0);

  // スイッチ壁：沈み込み→埋まる（通常モーション）
  await enterPlay(page, 'dz-switch');
  await runCmds(page, ['right', 'right', 'right']);
  await page.waitForSelector('.grid-cell[data-switch-wall="off"]', { timeout: 5000 });
  await check('沈み込みアニメーション中', () => page.$eval('.grid-switch-wall-svg', (e) => e.getAnimations().length > 0), true);
  await page.waitForTimeout(800);
  await check('沈んだ後はフラットな床表示', () => page.$eval('.grid-cell[data-switch-wall="off"] .grid-switch-wall-svg rect', (r) => r.getAttribute('fill')), '#d6c4a5');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });

  // reduced-motion：即時に埋まる
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, 'dz-switch');
  await runCmds(page, ['right', 'right', 'right']);
  await page.waitForSelector('.grid-cell[data-switch-wall="off"]', { timeout: 5000 });
  await check('reduced-motionでは即時に床表示', () => page.$eval('.grid-cell[data-switch-wall="off"] .grid-switch-wall-svg rect', (r) => r.getAttribute('fill')), '#d6c4a5');
}
