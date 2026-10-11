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
  const ids = robot.units.flatMap((u) => u.lessonIds);
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
}
