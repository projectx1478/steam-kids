// T2 introデモの自動ループ(Issue #241)。初回含め3回で止まり、reduced-motion時は1回のみ。
// 「▶ もういちど みる」は単発再生でループを再開しない。ステップ離脱後にタイマーが残らない。

export const name = 'T2 introデモのループ再生: 3回で停止・reduced-motionは1回・もういちど みるは単発(Issue #241)';

const runCount = (page) => page.evaluate(() => window.__sfxLog.filter((s) => s === 'run').length);

export default async function run({ page, check }) {
  await page.clock.install();
  await page.unroute('**/lessons/cmd-01-susumu.json');

  // --- 通常モーション: 初回含め3回で止まる ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.runFor(1100);
  await check('初回自動再生でrun音が1回', () => runCount(page), 1);
  await page.clock.runFor(20000);
  await check('20秒後は2回以上ループしている', async () => (await runCount(page)) >= 2);
  await page.clock.runFor(30000);
  await check('50秒後にrun音は計3回で止まる', () => runCount(page), 3);
  await page.clock.runFor(30000);
  await check('さらに待っても増えない', () => runCount(page), 3);

  // --- もういちど みるは単発（ループ再開しない） ---
  await page.click('[data-action="demo-replay"]');
  await page.clock.runFor(30000);
  await check('もういちど みるは1回だけ増える', () => runCount(page), 4);

  // --- reduced-motion: ループしない ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.runFor(60000);
  await check('reduced-motionはrun音1回のみ', () => runCount(page), 1);
  await check('reduced-motionでももういちど みるがある', async () => (await page.$$('[data-action="demo-replay"]')).length, 1);

  // --- ループ待ち中にステップ離脱するとタイマーが残らない ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.clock.runFor(1100);
  await page.click('[data-action="start"]');
  const before = await runCount(page);
  await page.clock.runFor(60000);
  await check('離脱後にデモのrun音が増えない', async () => (await runCount(page)) === before);
}
