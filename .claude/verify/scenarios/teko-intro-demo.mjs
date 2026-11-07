// teko-01-tsuriai の intro 紹介デモ（demo.kind === 'seesaw'。Issue #679）。
// 盤面は1個・start(1)から solution(3)へ動き支えが外れる／おてほんを みるで先頭から再生し直す（連打しても盤面は1個）／
// はじめるで play へ進むとデモは消える／端末の戻る→確認で「もどる」→ intro のデモが先頭から再生し直される。

export const name = 'teko-intro-demo: シーソー紹介デモの再生・再生ボタン・連打・はじめるで停止・戻って再生し直し(Issue #679)';

const pos = (page) => page.getAttribute('[data-mover]', 'data-pos');
const demoCount = async (page) => (await page.$$('[data-demo="seesaw"]')).length;

export default async function run({ page, check }) {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=teko-01-tsuriai');
  await page.waitForSelector('[data-demo="seesaw"]');
  await check('seesaw のデモ盤面が1個', () => demoCount(page), 1);

  await page.clock.runFor(1100);
  await check('よーい の後もデモ盤面は1個', () => demoCount(page), 1);
  await check('再生ボタンが64px以上', async () => (await (await page.$('[data-action="demo-replay"]')).boundingBox()).height >= 64, true);

  await page.clock.runFor(6000);
  await check('1周後、動くロボットは solution の 3 にいる', () => pos(page), '3');
  await check('1周後、支えは消えている(opacity 0)', () => page.$eval('[data-support]', (e) => e.style.opacity || getComputedStyle(e).opacity), '0');

  // --- おてほんを みる：先頭から再生し直す ---
  await page.click('[data-action="demo-replay"]');
  await check('おてほんを みるで start(1) に戻る', () => pos(page), '1');
  await page.clock.runFor(6000);
  await check('再生し直すと再び 3 になる', () => pos(page), '3');

  // --- 連打しても盤面は1個 ---
  for (let i = 0; i < 4; i += 1) await page.click('[data-action="demo-replay"]');
  await check('連打しても seesaw のデモ盤面は1個', () => demoCount(page), 1);
  await page.clock.runFor(6000);
  await check('連打のあとも 1周して 3 になる', () => pos(page), '3');

  // --- はじめる：再生中に押しても止まり、play にデモが残らない ---
  await page.click('[data-action="demo-replay"]');
  await page.clock.runFor(1500);
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-action="pos-right"]');
  await check('play へ進むと [data-demo] が無い', async () => (await page.$$('[data-demo]')).length, 0);
  await page.clock.runFor(10000);
  await check('進んだあともデモ盤面は現れない', async () => (await page.$$('[data-demo]')).length, 0);

  // --- 端末の戻る→確認で「もどる」→ intro のデモが先頭から再生し直される ---
  await page.goBack();
  await page.waitForSelector('[data-action="leave-ok"]');
  await page.click('[data-action="leave-ok"]');
  await page.waitForSelector('[data-demo="seesaw"]');
  await check('戻ると intro にデモ盤面が1個', () => demoCount(page), 1);
  await check('戻ると start(1) から再生し直される', () => pos(page), '1');
  await page.clock.runFor(7500);
  await check('戻ったあとも 1周して 3 になる', () => pos(page), '3');
}
