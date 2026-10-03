// T2 タイトルへ戻る導線(Issue #257)。
// レッスン選択画面から「タイトルへ」ボタンで title 画面へ戻り、画面上の選択状態が初期化される。
// dev=1 時は「タイトルへ」が出ず、「ふつうの がめんへ」リンクが表示される。
// タイトルへ戻ってからつづきからで同じスロットを選べ、保存データは消えない。
// 保存値(steamkids.slots.active)は変わらず、画面遷移前後で確認する。

export const name = 'T2 タイトルへ戻る導線: レッスン選択→タイトル、dev時はリンク表示(Issue #257)';

export default async function run({ page, check }) {
  // --- セットアップ: スロット0に名前「たろう」でデータを作る ---
  await page.goto('/index.html');
  await page.evaluate(() => {
    localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-t2', label: 'たろう', createdAt: 1 }));
    localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
    localStorage.setItem('steamkids.events', JSON.stringify([
      { eventId: 'e1', learnerId: 'l-t2', lessonId: 'cmd-01-susumu', stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} }
    ]));
  });

  // --- 通常時: 「タイトルへ」ボタンが表示される ---
  await page.goto('/index.html?view=map');
  await check('選択画面が表示される', async () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await check('「タイトルへ」ボタンが表示される', async () => page.isVisible('button:has-text("タイトルへ")'));
  const titleBtnBox = await page.locator('button:has-text("タイトルへ")').boundingBox();
  await check('「タイトルへ」ボタンが64px以上', () => titleBtnBox.width >= 64 && titleBtnBox.height >= 64);

  // --- 「タイトルへ」を押すと title 画面へ遷移 ---
  const slotsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.slots')));
  await page.click('button:has-text("タイトルへ")');
  await check('「タイトルへ」を押すと data-screen=title になる', async () => page.getAttribute('#stage', 'data-screen'), 'title');

  // 設計3: スロット選択が初期化されている（保存値は変わらず）
  const slotsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.slots')));
  await check('steamkids.slots の保存値が変わっていない', () =>
    JSON.stringify(slotsBefore) === JSON.stringify(slotsAfter)
  );
  await check('はじめからボタンが表示される', async () => page.isVisible('[data-action="title-new"]'));
  await check('つづきからボタンが表示される', async () => page.isVisible('[data-action="title-continue"]'));

  // --- タイトルからつづきからで同じスロットを選べる ---
  await page.click('[data-action="title-continue"]');
  await check('つづきからでスロット選択へ遷移', async () => page.getAttribute('#stage', 'data-screen'), 'slots');
  await page.click('[data-action="slot-pick"][data-slot="0"]');
  await check('スロット選択後は選択画面へ遷移', async () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await check('スロット0の名前「たろう」が保存されている', async () => page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.profile')).label), 'たろう');
  await check('保存データ(cmd-01クリア)が消えていない', async () => (await page.$$('[data-lesson-id="cmd-01-susumu"]')).length > 0);

  // --- 「タイトルへ」経由でゲートが再要求されない ---
  // 「タイトルへ」を押して index.html へ遷移した直後、ゲート要素が非表示であることを確認（日付判定のため同日再読込では出ない）
  await page.goto('/index.html?view=map');
  await page.click('button:has-text("タイトルへ")');
  await check('「タイトルへ」押下後、タイトル画面へ遷移する', async () => page.getAttribute('#stage', 'data-screen'), 'title');
  await check('タイトル画面でゲート要素が非表示', async () => !(await page.isVisible('#parental-gate')));

  // 同日再読込でもゲート非再要求（ゲートの日付判定により）
  await page.goto('/index.html');
  await check('同日再読込でもタイトル画面が表示される', async () => page.getAttribute('#stage', 'data-screen'), 'title');
  await check('同日再読込後もゲート非表示', async () => !(await page.isVisible('#parental-gate')));

  // --- dev=1 時: 「ふつうの がめんへ」リンクが表示される ---
  await page.goto('/index.html?view=map&dev=1');
  await check('dev=1 時は選択画面が表示される', async () => page.getAttribute('#stage', 'data-screen'), 'picker');
  await check('「タイトルへ」ボタンが出ない', async () => !(await page.isVisible('button:has-text("タイトルへ")')));
  await check('「ふつうの がめんへ」リンクが表示される', async () => (await page.textContent('#stage')).includes('ふつうの がめんへ'));
  const devLinkHref = await page.getAttribute('a:has-text("ふつうの がめんへ")', 'href');
  await check('devリンクの href が ?view=map (devなし) である', () => devLinkHref === './index.html?view=map');
  const devLinkBox = await page.locator('a:has-text("ふつうの がめんへ")').boundingBox();
  await check('devリンクが48px以上', () => devLinkBox.width >= 48 && devLinkBox.height >= 48);
}
