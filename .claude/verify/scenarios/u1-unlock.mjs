export const name = 'U1 段階解放・次のレッスン強調・開発者画面(Issue #216)';

const ORDER = [
  'cmd-01-susumu',
  'cmd-02-mijikaku',
  'cmd-03-naosu',
  'donguri-01-hirou',
  'donguri-02-mawarimichi',
  'ice-01-suberu',
  'ice-02-kabe',
  'key-01-kagi',
  'key-02-iro',
  'switch-01-suicchi',
  'switch-02-futatsu',
];

function setCleared(page, ids) {
  return page.evaluate(
    (list) =>
      localStorage.setItem(
        'steamkids.events',
        JSON.stringify(
          list.map((lessonId, i) => ({
            eventId: `e${i}`,
            learnerId: 'l',
            lessonId,
            stepId: 'p3',
            type: 'clear',
            ts: Date.now(),
            payload: {},
          }))
        )
      ),
    ids
  );
}

const eventCount = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events') ?? '[]').length);
const lockedIds = (page) =>
  page.$$eval('[data-lesson-id][data-locked="true"]', (els) => els.map((e) => e.dataset.lessonId));
const pulseIds = (page) => page.$$eval('.next-pulse', (els) => els.map((e) => e.dataset.lessonId));

export default async function run({ page, check }) {
  // --- 初期：先頭だけ有効 ---
  await page.goto('/index.html?view=map');
  await check('初期は先頭以外(レッスン11本＋れんしゅう1本)がdisabled＋data-locked', async () => (await lockedIds(page)).length, 12);
  await check('先頭(cmd-01)は有効', async () => page.$eval('[data-lesson-id="cmd-01-susumu"]', (b) => !b.disabled));
  await check('パルスは先頭の1件だけ', async () => pulseIds(page), ['cmd-01-susumu']);
  await check('ボタンに単元内番号が付く(cmd-02は2)', async () =>
    page.textContent('[data-lesson-id="cmd-02-mijikaku"] .lesson-num'), '2');
  await check('単元色: 解放済みcommandsはemerald、未解放iceはslate', async () =>
    page.evaluate(() => [
      document.querySelector('[data-lesson-id="cmd-01-susumu"]').classList.contains('bg-emerald-400'),
      document.querySelector('[data-lesson-id="ice-01-suberu"]').className.includes('bg-slate-300'),
    ]), [true, true]);

  // --- クリア注入で次が解放され、パルスが移る（単元をまたぐ） ---
  await setCleared(page, ORDER.slice(0, 1));
  await page.goto('/index.html?view=map');
  await check('cmd-01クリアでcmd-02が解放される', async () =>
    page.$eval('[data-lesson-id="cmd-02-mijikaku"]', (b) => !b.disabled && !b.dataset.locked));
  await check('パルスがcmd-02へ移る', async () => pulseIds(page), ['cmd-02-mijikaku']);
  await check('cmd-03はまだロック', async () => (await lockedIds(page)).includes('cmd-03-naosu'));

  await setCleared(page, ORDER.slice(0, 3));
  await page.goto('/index.html?view=map');
  await check('cmd-03クリアで次の単元(donguri-01)が解放される', async () =>
    page.$eval('[data-lesson-id="donguri-01-hirou"]', (b) => !b.disabled));
  await check('れんしゅうはcommands単元クリアで解放', async () =>
    page.$eval('[data-lesson-id="cmd-06-practice"]', (b) => !b.disabled));
  await check('パルスがdonguri-01へ移る', async () => pulseIds(page), ['donguri-01-hirou']);

  // --- reduced-motion：アニメ無し・枠のみ ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await check('reduced-motionではアニメーション無し', async () =>
    page.$eval('.next-pulse', (b) => getComputedStyle(b).animationName), 'none');
  await check('reduced-motionでは枠(box-shadow)が出る', async () =>
    page.$eval('.next-pulse', (b) => getComputedStyle(b).boxShadow !== 'none'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await check('通常はnext-pulseアニメーションが動く', async () =>
    page.$eval('.next-pulse', (b) => getComputedStyle(b).animationName), 'next-pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // --- 開発者画面 ---
  await page.evaluate(() => localStorage.removeItem('steamkids.events'));
  await page.goto('/index.html?view=map&dev=1');
  await check('dev: ロック中のボタンが無い', async () => (await lockedIds(page)).length, 0);
  await check('dev: パルスが付かない', async () => (await pulseIds(page)).length, 0);
  await check('dev: くりかえし教材が並ぶ', async () =>
    (await page.$$('[data-lesson-id="cmd-04-kurikaeshi"], [data-lesson-id="cmd-05-kurikaeshi-donguri"]')).length, 2);
  await check('dev: DEVバッジが表示される', async () => page.textContent('#dev-badge'), 'DEV');
  await check('dev: lessonIdが表示される', async () => page.textContent('[data-lesson-id="cmd-04-kurikaeshi"] ~ .dev-lesson-id'), 'cmd-04-kurikaeshi');
  await check('通常画面にはDEVバッジとくりかえし教材が出ない', async () => {
    await page.goto('/index.html?view=map');
    return (await page.$$('#dev-badge, [data-lesson-id="cmd-04-kurikaeshi"]')).length;
  }, 0);

  await page.goto('/index.html?view=map&dev=1');
  await page.click('[data-lesson-id="cmd-02-mijikaku"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  await check('dev: 1レッスン遊んでもeventsが増えない', async () => eventCount(page), 0);
  await check('dev: tutorialDoneも書かれない', async () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('steamkids.tutorialDone.')).length), 0);
  await page.click('#home-btn');
  await page.waitForSelector('[data-screen="picker"]');
  await check('dev: 「えらぶ がめんへ」後もdevが続く', async () => page.url().includes('dev=1'));
  await check('dev: 戻ったマップもdev表示', async () => (await page.$$('#dev-badge')).length, 1);
  await check('dev: 戻った後もeventsが増えていない', async () => eventCount(page), 0);

  // --- ダッシュボードの入口 ---
  await page.goto('/dashboard.html');
  await check('ダッシュボードの開発者リンクのhref', async () =>
    page.getAttribute('#dev-link', 'href'), './index.html?view=map&dev=1');
}
