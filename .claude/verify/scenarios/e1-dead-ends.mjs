// Issue #744: 行き止まりを無くす。読み込み失敗・保護者画面から家（マップ／子ども画面）へ戻れる。

export const name = '行き止まり: 読み込み失敗のボタン・保護者画面の戻るリンク・縦画面の文字切れ(Issue #744)';

export default async function run({ page, check }) {
  // 1: レッスン単体の失敗 → 「もういちど」「マップへ」が出て、マップへ着く
  // 存在しないレッスンは404ではなく200＋壊れたbodyで再現する（4xxはハーネスが自動FAILにするため。#756）
  await page.route('**/lessons/zzz-none.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' })
  );
  await page.goto('/index.html?lesson=zzz-none');
  await check('失敗の文言が出る', async () => page.textContent('#stage p'), 'よみこみ できませんでした');
  await check('「もういちど」が見え64px以上', async () => {
    const box = await page.locator('[data-action="error-retry"]').boundingBox();
    return !!box && box.height >= 64;
  });
  await check('「マップへ」が見え64px以上', async () => {
    const box = await page.locator('[data-action="error-to-map"]').boundingBox();
    return !!box && box.height >= 64;
  });
  await page.click('[data-action="error-to-map"]');
  await check('マップ（picker）に着く', async () => {
    await page.waitForSelector('#stage[data-screen="picker"]');
    return true;
  });

  // 2: 一覧の失敗 → 「もういちど」だけ（200＋壊れたbodyで再現。4xxはハーネスが失敗扱いにするため）
  await page.route('**/lessons/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' })
  );
  await page.goto('/index.html?view=map');
  await check('一覧の失敗では「もういちど」が出る', async () => page.isVisible('[data-action="error-retry"]'));
  await check('一覧の失敗では「マップへ」は出ない', async () => (await page.$$('[data-action="error-to-map"]')).length, 0);
  await page.unroute('**/lessons/index.json');

  // 3: 縦画面（390×844）で失敗後の画面の文字が切れない
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html?lesson=zzz-none');
  await check(
    '失敗後の画面に scrollHeight > clientHeight の要素が無い',
    async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#stage, #stage *, header, header *')]
          .filter((e) => e.clientHeight > 0 && e.scrollHeight > e.clientHeight)
          .map((e) => `${e.tagName}#${e.id}.${e.className}`)
      ),
    []
  );

  // 4: 保護者画面（ゲート・ダッシュボード）から子ども画面へ戻れ、戻ると合言葉画面
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/dashboard.html');
  await check('ゲート（設定画面）に戻るリンクが見え48px以上', async () => {
    const box = await page.locator('#gate-setup .gate-home-link').boundingBox();
    return !!box && box.height >= 48;
  });
  await page.fill('#gate-setup-passcode', 'testtest');
  await page.fill('#gate-setup-confirm', 'testtest');
  await page.click('#gate-setup-submit');
  await check('ダッシュボードのヘッダに戻るリンクが見え48px以上', async () => {
    const box = await page.locator('#dashboard-app .gate-home-link').boundingBox();
    return !!box && box.height >= 48;
  });
  await page.click('#dashboard-app .gate-home-link');
  await check('押すと/index.htmlに着く', async () => {
    await page.waitForURL('**/index.html');
    return true;
  });
  await page.goto('/dashboard.html');
  await check('開き直すと合言葉画面（ログイン）になる', async () => page.isVisible('#gate-login'));
  await check('ログイン画面にも戻るリンクが見え48px以上', async () => {
    const box = await page.locator('#gate-login .gate-home-link').boundingBox();
    return !!box && box.height >= 48;
  });
}
