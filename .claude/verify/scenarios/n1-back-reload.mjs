// 端末の戻る＝1つ前の画面、リロード＝今の面（Issue #739）。
// マップからレッスンを始めると履歴が ?view=map → ?lesson=<id> になり、intro の戻るでマップへ戻る。
// play 中のリロードは同じレッスンの intro（つづきから）へ。dev=1 の URL は変えない。

export const name = 'N1 戻る・リロード: マップ→intro→戻る、リロード後の戻る、dev不変(Issue #739)';

const ID = 'cmd-01-susumu';
const BTN = `.lesson-pick-btn[data-lesson-id="${ID}"]`;

async function seed(page) {
  await page.goto('/index.html');
  await page.evaluate(() => {
    localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-n1', label: 'たろう', createdAt: 1 }));
    localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
  });
}

export default async function run({ page, check }) {
  await page.unroute(`**/lessons/${ID}.json`);
  const screen = () => page.getAttribute('#stage', 'data-screen');
  const step = () => page.getAttribute('#stage', 'data-step');
  await seed(page);

  // 経路1：トップ→つづきから→スロット→大項目→マップ→レッスン
  await page.goto('/index.html');
  await page.click('[data-action="title-continue"]');
  await page.click('[data-slot="0"]');
  await page.click('[data-track-id="robot"]');
  await page.click(BTN);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await check('経路1: intro で URL が ?lesson=', async () => page.url().includes(`lesson=${ID}`));
  await page.goBack();
  await page.waitForSelector('#stage[data-screen="picker"]');
  await check('経路1: 戻るでマップ', screen, 'picker');
  await check('経路1: URL に view=map', async () => page.url().includes('view=map'));

  // 経路2：?view=map から直接
  await page.goto('/index.html?view=map');
  await page.click(BTN);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await page.goBack();
  await page.waitForSelector('#stage[data-screen="picker"]');
  await check('経路2: introで戻るとマップ', screen, 'picker');

  // 経路2の続き：もう一度入り、p2 まで進めてリロード
  await page.click(BTN);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-option="B"]');
  await page.click('[data-option="B"]');
  await page.click('[data-action="next"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="next-stage"]');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await check('リロード後は intro', step, 'intro');
  await check('リロード後に「つづきから」が見える', async () => page.isVisible('[data-action="resume"]'));
  await check('リロード後も URL は ?lesson=', async () => page.url().includes(`lesson=${ID}`));
  await page.goBack();
  await page.waitForSelector('#stage[data-screen="picker"]', { timeout: 8000 });
  await check('リロード後の intro で戻るとマップ', screen, 'picker');

  // 経路3：?lesson= 直開き→p2→リロード
  await page.goto(`/index.html?lesson=${ID}`);
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-option="B"]');
  await page.click('[data-option="B"]');
  await page.click('[data-action="next"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="next-stage"]');
  await page.reload();
  await page.waitForSelector('[data-action="resume"]');
  await check('経路3: 直開きp2のリロードで「つづきから」', async () => page.isVisible('[data-action="resume"]'));

  // dev=1：URL は変えない
  await page.goto('/index.html?view=map&dev=1');
  await page.waitForSelector(BTN);
  await page.click(BTN);
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await check('dev=1 は URL が ?view=map&dev=1 のまま', async () => page.url().endsWith('/index.html?view=map&dev=1'));
}
