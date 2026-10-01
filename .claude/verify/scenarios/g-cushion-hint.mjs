// クッション後の未到達は「かべ」ヒントを出さず、ゴールまでの距離で文言を出し分ける。1歩目にもtransitionが乗る（Issue #213）。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'cushion-hint: クッション後の未到達はかべヒントなし・距離別文言・1歩目transition(Issue #213)';

const lesson = {
  lessonId: 'g-cushion-hint',
  unitId: 'g-cushion',
  title: 'cushion-hint',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'クッション' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 3, rows: 2 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 1 },
      walls: [],
      cushion: [{ x: 1, y: 0 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['down', 'right', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const hintText = (page) => page.textContent('[data-hint]');

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, lesson.lessonId);

  // クッションで止まって未到達（距離3）→ かべではなくgoal、遠い文言
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('クッション後の未到達はdata-hint=goal', async () => (await page.$$('[data-hint="goal"]')).length, 1);
  await check('かべのヒントは出ない', async () => (await page.$$('[data-hint="wall"]')).length, 0);
  await check('距離3は「ほかの みちも ためして みよう」', async () => (await hintText(page)).includes('ほかの みちも ためして みよう'), true);

  // 距離2 → 現行文言
  await enterPlay(page, lesson.lessonId);
  await page.click('[data-command="down"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('距離2は「ゴールまで あと すこし」', async () => (await hintText(page)).includes('ゴールまで あと すこし'), true);

  // 1歩目：runで駒が作り直されても、1手目のtransformにCSSTransitionが走る
  await enterPlay(page, lesson.lessonId);
  await page.click('[data-command="down"]');
  const sawTransition = page.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const hit = document
            .getAnimations()
            .some((a) => a instanceof CSSTransition && a.transitionProperty === 'transform' && a.effect.target?.classList.contains('grid-player'));
          if (hit) resolve(true);
          else if (performance.now() - t0 > 3000) resolve(false);
          else requestAnimationFrame(tick);
        };
        tick();
      })
  );
  await page.click('[data-action="run"]');
  await check('1歩目の移動にtransform transitionが走る', async () => sawTransition, true);
}
