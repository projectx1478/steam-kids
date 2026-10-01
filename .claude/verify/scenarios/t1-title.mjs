// T1 タイトル画面・デモ前1秒インターバル(Issue #107)。
// ?lesson=・?view=mapが無い起動時だけタイトルを表示し、つづきから→スロット選択で選択画面へ入る。
// はじめにデモの初回自動再生は1秒の「よーい…」を挟んでからstart音を鳴らして始まる。

export const name = 'T1 タイトル画面: 起動時のみ表示・つづきから経由で選択画面へ・デモ前1秒(Issue #107)';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  await check('起動時はタイトル画面', async () => page.getAttribute('#stage', 'data-screen'), 'title');
  await check('STEAM KIDSの見出しが表示される', async () => page.textContent('#stage h1'), 'STEAM KIDS');
  const newBox = await page.locator('[data-action="title-new"]').boundingBox();
  await check('はじめからボタンが64px以上', () => newBox.width >= 64 && newBox.height >= 64);
  await check('データが無ければつづきからはdisabled', () => page.isDisabled('[data-action="title-continue"]'));

  // データのあるスロットがあればつづきからが押せて、スロット選択→単元マップへ進む（Issue #218）
  await page.evaluate(() => {
    localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-t1', label: 'たろう', createdAt: 1 }));
    localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
  });
  await page.goto('/index.html');
  await check('データがあればつづきからが押せる', async () => !(await page.isDisabled('[data-action="title-continue"]')));
  await page.click('[data-action="title-continue"]');
  await check('つづきから後はスロット選択へ遷移する', async () => page.getAttribute('#stage', 'data-screen'), 'slots');
  await page.click('[data-action="slot-pick"][data-slot="0"]');
  await check('スロット選択後は選択画面へ遷移する', async () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await check('選択画面のレッスンボタンが表示される', async () => (await page.$$('.lesson-pick-btn')).length, 12);

  // ?view=map / ?lesson=はタイトルを経由しない
  await page.goto('/index.html?view=map');
  await check('?view=mapではタイトルを経由しない', async () => (await page.$$('[data-action="title-new"]')).length, 0);
  await check('?view=mapは選択画面', async () => page.getAttribute('#stage', 'data-screen'), 'picker');

  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('?lesson=ではタイトルを経由しない', async () => (await page.$$('[data-action="title-new"]')).length, 0);

  // --- reduced-motionでロボットのfloatが止まる ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html');
  await check('通常時はロボットがfloat-slow', async () => (await page.$$('.float-slow')).length, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html');
  await check('reduced-motion時はfloat-slow無し', async () => (await page.$$('.float-slow')).length, 0);

  // --- はじめにデモ: intro表示直後（＝初回自動再生）の前に1秒の「よーい…」を挟む ---
  await page.unroute('**/lessons/cmd-01-susumu.json');
  const t0 = Date.now();
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await check('デモ開始直後はまだstart音が鳴らない', () => page.evaluate(() => !window.__sfxLog.includes('start')));
  await check('よーい…バッジが表示される', () => page.isVisible('[data-demo-ready]'));
  await check('1秒後にstart音が鳴りデモが始まる', () => page.evaluate(() => window.__sfxLog.includes('start')));
  await check('start音はページ読み込みから1000ms以上後', () => Date.now() - t0 >= 1000);
  await check('start音の後はよーい…バッジが消える', async () => !(await page.isVisible('[data-demo-ready]')));

  // 「▶ もういちど みる」は待たずに即再生する
  await page.waitForSelector('[data-action="demo-replay"]');
  const t1 = Date.now();
  await page.evaluate(() => (window.__sfxLog.length = 0));
  await page.click('[data-action="demo-replay"]');
  await check('もういちど みるは即座にrun音が鳴る', () => page.evaluate(() => window.__sfxLog.includes('run')));
  await check('もういちど みるは1000ms未満で再生される', () => Date.now() - t1 < 1000);
}
