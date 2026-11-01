export const name = 'TR1 大項目選択：カードの大きさ・スクロール無し・★の出し分け・単元マップへの出入り・1大項目は飛ばす(Issue #375)';

const noScroll = (page) => page.evaluate(() => {
  const d = document.documentElement;
  return d.scrollWidth <= d.clientWidth && d.scrollHeight <= d.clientHeight;
});
const boxes = (page, sel) => page.$$eval(sel, (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return { w: r.width, h: r.height };
}));
const loadIndex = (page) => page.evaluate(() => fetch('/lessons/index.json').then((r) => r.json()));

export default async function run({ page, check }) {
  for (const [w, h] of [[360, 640], [1024, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html?view=tracks');
    await page.waitForSelector('[data-track-id]');
    const tag = `${w}x${h}`;
    await check(`${tag}: 画面は大項目選択`, () => page.getAttribute('#stage', 'data-screen'), 'tracks');
    await check(`${tag}: カードが2枚以上`, async () => (await page.$$('[data-track-id]')).length >= 2);
    await check(`${tag}: カードは64px四方以上`, async () => (await boxes(page, '[data-track-id]')).every((b) => b.w >= 64 && b.h >= 64));
    await check(`${tag}: もどるの高さは64px以上`, async () => (await boxes(page, '[data-action="tracks-back"]')).every((b) => b.h >= 64));
    await check(`${tag}: 縦横スクロールが無い`, () => noScroll(page));
    await check(`${tag}: 未クリアなら★が出ない`, async () => (await page.$$eval('[data-star]', (els) => els.map((e) => e.textContent))).join(''), '');
  }

  // 全クリア済みの時だけ★（robotだけ全クリア）
  const index = await loadIndex(page);
  const robot = index.tracks.find((t) => t.trackId === 'robot');
  const ids = robot.units.flatMap((u) => [...u.lessonIds, ...(u.practiceIds ?? [])]);
  await page.evaluate((lessonIds) => {
    const p = JSON.parse(localStorage.getItem('steamkids.profile'));
    localStorage.setItem('steamkids.events', JSON.stringify(lessonIds.map((lessonId, i) => (
      { eventId: `e${i}`, learnerId: p.learnerId, lessonId, stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} }))));
  }, ids);
  await page.goto('/index.html?view=tracks');
  await page.waitForSelector('[data-track-id]');
  await check('全クリア済みの大項目だけ★が出る', async () => (await page.$$eval('[data-star]', (els) => els.map((e) => [e.dataset.star, e.textContent]))), [['robot', '★'], ['body', '']]);

  // カード→その大項目の単元だけ。もどる→大項目選択
  await page.click('[data-track-id="robot"]');
  await page.waitForSelector('[data-lesson-id]');
  await check('robotの単元マップにはrobotのレッスンだけ', async () =>
    (await page.$$eval('[data-lesson-id]', (els) => els.map((e) => e.dataset.lessonId))).every((id) => ids.includes(id)));
  await check('単元マップのもどるの高さは64px以上', async () => (await boxes(page, '[data-action="map-back"]')).every((b) => b.h >= 64));
  await page.click('[data-action="map-back"]');
  await check('もどるで大項目選択へ戻る', () => page.getAttribute('#stage', 'data-screen'), 'tracks');

  // ロボットのレッスンから ホーム→確認→戻ると、ロボットの単元だけで teko は出ない（Issue #616）
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('#gear-btn');
  await page.waitForSelector('#menu-home');
  await page.click('#menu-home');
  const needConfirm = await page.$('[data-action="leave-ok"]');
  if (needConfirm) await page.click('[data-action="leave-ok"]');
  await page.waitForSelector('[data-lesson-id]');
  await check('ロボットのレッスンから戻るとロボットの単元だけ（tekoは出ない）', async () => {
    const got = await page.$$eval('[data-lesson-id]', (els) => els.map((e) => e.dataset.lessonId));
    return [got.length > 0 && got.every((id) => ids.includes(id)), got.includes('teko-01-tsuriai')].join();
  }, 'true,false');

  // 遊べる大項目が1つだけなら大項目選択を飛ばして単元マップ
  await page.route('**/lessons/index.json', async (route) => {
    const j = JSON.parse(await (await route.fetch()).text());
    j.tracks = j.tracks.filter((t) => t.trackId === 'robot');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(j) });
  });
  await page.goto('/index.html?view=tracks');
  await page.waitForSelector('[data-lesson-id]');
  await check('1大項目だけなら単元マップへ飛ぶ', () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await check('飛んだ時は大項目カードが無い', async () => (await page.$$('[data-track-id]')).length, 0);

  // 大項目の紹介画面（Issue #644）。robot にだけ intro を付けた index に差し替える（body は intro なし）。
  await page.unroute('**/lessons/index.json');
  await page.route('**/lessons/index.json', async (route) => {
    const j = JSON.parse(await (await route.fetch()).text());
    j.tracks.find((t) => t.trackId === 'robot').intro = {
      demo: { grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [], commands: ['right', 'right'] },
      text: 'ゴールまで すすもう',
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(j) });
  });
  for (const [w, h] of [[360, 640], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html?view=tracks');
    await page.waitForSelector('[data-track-id]');
    await page.click('[data-track-id="robot"]');
    await page.waitForSelector('[data-action="track-intro-start"]');
    const tag = `${w}x${h}`;
    await check(`${tag}: intro のある大項目は紹介画面が出る`, () => page.getAttribute('#stage', 'data-screen'), 'track-intro');
    await check(`${tag}: 紹介に大項目名・おてほん・短文が出る`, () => page.evaluate(() => [
      document.querySelector('#stage .track-q')?.textContent,
      !!document.querySelector('#stage [data-demo="goal"]'),
      document.querySelector('[data-role="track-intro-text"]')?.textContent,
    ]), ['ロボットを うごかす', true, 'ゴールまで すすもう']);
    await check(`${tag}: はじめる・もどるは48px以上`, async () => (await boxes(page, '[data-action="track-intro-start"],[data-action="track-intro-back"]')).every((b) => b.h >= 48 && b.w >= 48));
    await check(`${tag}: 紹介は縦横スクロールが無い`, () => noScroll(page));
  }
  await page.click('[data-action="track-intro-back"]');
  await check('紹介のもどるで大項目選択へ', () => page.getAttribute('#stage', 'data-screen'), 'tracks');
  await page.click('[data-track-id="robot"]');
  await page.waitForSelector('[data-action="track-intro-start"]');
  await page.click('[data-action="track-intro-start"]');
  await page.waitForSelector('[data-lesson-id]');
  await check('紹介のはじめるで単元マップへ', () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await page.click('[data-action="map-back"]');
  await check('単元マップのもどるは紹介でなく大項目選択へ', () => page.getAttribute('#stage', 'data-screen'), 'tracks');
  await page.click('[data-track-id="body"]');
  await page.waitForSelector('[data-lesson-id]');
  await check('intro の無い大項目は紹介を挟まず単元マップへ直行', () => page.getAttribute('#stage', 'data-screen'), 'picker');
}
