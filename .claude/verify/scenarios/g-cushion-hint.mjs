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
  await check('距離3は「ちがう みちも ためして みよう」', async () => (await hintText(page)).includes('ちがう みちも ためして みよう'), true);

  // 距離2 → 現行文言
  await enterPlay(page, lesson.lessonId);
  await page.click('[data-command="down"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('距離2は「ゴールまで あと すこし」', async () => (await hintText(page)).includes('ゴールまで あと すこし'), true);

  // 1歩目：transitionがnone以外で、transformが開始位置から変化する
  await enterPlay(page, lesson.lessonId);
  await page.evaluate(() => {
    const token = document.querySelector('#stage .grid-player');
    window.__firstStep = { start: token.style.transform, transition: '', transform: '' };
    new MutationObserver(() => {
      if (token.style.transform !== window.__firstStep.start && !window.__firstStep.transform) {
        window.__firstStep.transition = token.style.transition;
        window.__firstStep.transform = token.style.transform;
      }
    }).observe(token, { attributes: true, attributeFilter: ['style'] });
  });
  await page.click('[data-command="down"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  const first = await page.evaluate(() => window.__firstStep);
  await check('1歩目のtransformが変化する', async () => first.transform !== '' && first.transform !== first.start, true);
  await check('1歩目のtransitionがnone以外', async () => first.transition !== '' && first.transition !== 'none', true);
}
