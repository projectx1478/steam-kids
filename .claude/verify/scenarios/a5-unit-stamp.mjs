export const name = 'A5 単元マップ: クリアでスタンプ、全クリアで旗(Issue #58)';
import { clearLesson } from '../helpers.mjs';

export default async function run({ page, check }) {
  await clearLesson(page, 'cmd-01-susumu');

  await page.goto('/index.html?view=map');
  await check(
    'レッスン1クリア後、そのボタンにスタンプが付く',
    async () => (await page.$$('[data-lesson-id="cmd-01-susumu"] ~ .lesson-stamp')).length,
    1
  );
  await check(
    '未クリアのレッスン2にはスタンプが無い',
    async () => (await page.$$('[data-lesson-id="cmd-02-mijikaku"] ~ .lesson-stamp')).length,
    0
  );
  await check('単元未達成の間は旗が無い', async () => (await page.$$('.unit-flag')).length, 0);
  await page.click('[data-lesson-id="cmd-02-mijikaku"]');
  await check(
    '入口から1タップでレッスンへ遷移する',
    async () => page.getAttribute('#stage', 'data-step'),
    'intro'
  );

  await clearLesson(page, 'cmd-02-mijikaku');
  await clearLesson(page, 'cmd-03-naosu');
  await clearLesson(page, 'cmd-04-kurikaeshi');
  await clearLesson(page, 'cmd-05-kurikaeshi-donguri');

  await page.goto('/index.html?view=map');
  await check('5本ともスタンプが付く', async () => (await page.$$('.lesson-stamp')).length, 5);
  await check('単元全クリアで旗が立つ', async () => (await page.$$('.unit-flag')).length, 1);
}
