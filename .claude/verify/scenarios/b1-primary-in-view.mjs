// B1 主ボタンが初期表示の画面内にある(Issue #551)。
// intro・まとめ・タイトル・スロット選択・単元マップ・大項目の主ボタン（はじめる／つぎへ／もどる／おわる）と
// 副ボタン（そうさほうほう・はじめから・もういちど みる）を、スクロールせずに押せることを 3 端末で見る。
// 境界ボックスが画面内・高さ64px以上、下端バー内の副ボタン間は16px以上、.leave-confirm をバーが覆わない。

export const name = 'B1 主ボタンが初期表示の画面内・64px以上・間隔16px以上・確認をバーが覆わない(Issue #551)';
import { clearLesson } from '../helpers.mjs';

const LESSON = 'cmd-01-susumu';
const SIZES = [[360, 640], [844, 390], [1024, 600]];
const EPS = 0.5;

export default async function run({ page, check }) {
  await page.unroute(`**/lessons/${LESSON}.json`);

  const box = (sel) => page.locator(sel).first().boundingBox();
  // 境界ボックスが画面内で、高さが64px以上か（スクロール位置に依らない viewport 座標で見る）。
  const inViewTall = async (sel, w, h) => {
    const b = await box(sel);
    return !!b && b.x >= -EPS && b.y >= -EPS && b.x + b.width <= w + EPS && b.y + b.height <= h + EPS && b.height >= 64 - EPS;
  };
  // 下端バー内のボタンを左から並べ、隣り合う間隔がすべて16px以上か。
  const barGapsOk = () => page.evaluate(() => {
    const bar = document.querySelector('.sk-bottom-bar');
    if (!bar) return false;
    const rects = [...bar.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    return rects.every((r, i) => i === 0 || r.left - rects[i - 1].right >= 16 - 0.5);
  });
  const resetState = async () => {
    await page.goto('/index.html');
    await page.waitForSelector('#stage[data-screen="title"]');
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('steamkids.resume.') || k.includes('lastHint'))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-b1', label: 'たろう', createdAt: 1 }));
      localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
      localStorage.setItem('steamkids.events', JSON.stringify([]));
    });
  };

  for (const [w, h] of SIZES) {
    const tag = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await resetState();

    // --- タイトル：はじめから・つづきから（844×390 は横並び） ---
    await page.goto('/index.html');
    await page.waitForSelector('#stage[data-screen="title"]');
    await check(`${tag} タイトル: はじめからが画面内・64px以上`, () => inViewTall('[data-action="title-new"]', w, h));
    await check(`${tag} タイトル: つづきからが画面内・64px以上`, () => inViewTall('[data-action="title-continue"]', w, h));

    // --- スロット選択：もどる ---
    await page.click('[data-action="title-continue"]');
    await page.waitForSelector('#stage[data-screen="slots"]');
    await check(`${tag} スロット選択: もどるが画面内・64px以上`, () => inViewTall('[data-action="slot-back"]', w, h));

    // --- 大項目：もどる ---
    await page.goto('/index.html?view=tracks');
    await page.waitForSelector('[data-track-id]');
    await check(`${tag} 大項目: もどるが画面内・64px以上`, () => inViewTall('[data-action="tracks-back"]', w, h));

    // --- 単元マップ：もどる ---
    await page.goto('/index.html?view=map');
    await page.waitForSelector('[data-lesson-id]');
    await check(`${tag} 単元マップ: もどるが画面内・64px以上`, () => inViewTall('[data-action="map-back"]', w, h));

    // --- intro（初回）：はじめる・そうさほうほう・もういちど みる ---
    await page.goto(`/index.html?lesson=${LESSON}`);
    await page.waitForSelector('[data-action="start"]');
    await page.waitForSelector('[data-action="demo-replay"]');
    await check(`${tag} intro: はじめるが画面内・64px以上`, () => inViewTall('[data-action="start"]', w, h));
    await check(`${tag} intro: そうさほうほうが画面内・64px以上`, () => inViewTall('[data-action="how-to"]', w, h));
    await check(`${tag} intro: もういちど みるが画面内・64px以上`, () => inViewTall('[data-action="demo-replay"]', w, h));
    await check(`${tag} intro: バー内のボタン間隔が16px以上`, barGapsOk);

    // intro の上で確認ダイアログ（ほごしゃの がめん）を開き、バーが覆わない
    await page.click('#gear-btn');
    await page.click('#menu-guardian');
    await page.waitForSelector('.leave-confirm');
    await check(`${tag} 確認: バーの位置でも最前面は確認の覆い`, () => page.evaluate(() => {
      const bar = document.querySelector('.sk-bottom-bar').getBoundingClientRect();
      const top = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
      return !!top?.closest('.leave-confirm');
    }), true);
    await check(`${tag} 確認: ボタンの中心を押せる（バーに覆われない）`, () => page.evaluate(() => {
      return ['guardian-cancel', 'guardian-go'].every((id) => {
        const b = document.getElementById(id);
        if (!b) return false;
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top === b || b.contains(top);
      });
    }), true);
    await page.click('#guardian-cancel');

    // --- intro（再開時）：はじめから・つづきから ---
    await page.evaluate((id) => localStorage.setItem(`steamkids.resume.${id}`, JSON.stringify({ stepId: 'p1', ts: 1 })), LESSON);
    await page.goto(`/index.html?lesson=${LESSON}`);
    await page.waitForSelector('[data-action="resume"]');
    await check(`${tag} intro(再開): つづきからが画面内・64px以上`, () => inViewTall('[data-action="resume"]', w, h));
    await check(`${tag} intro(再開): はじめからが画面内・64px以上`, () => inViewTall('[data-action="start"]', w, h));
    await check(`${tag} intro(再開): そうさほうほうが画面内・64px以上`, () => inViewTall('[data-action="how-to"]', w, h));
    await check(`${tag} intro(再開): バー内のボタン間隔が16px以上`, barGapsOk);

    // --- まとめ：つぎへ・おわる（最後に回す。クリア記録が残るため） ---
    await page.evaluate((id) => localStorage.removeItem(`steamkids.resume.${id}`), LESSON);
    await clearLesson(page, LESSON);
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'summary');
    await check(`${tag} まとめ: つぎへが画面内・64px以上`, () => inViewTall('[data-action="next-lesson"]', w, h));
    await check(`${tag} まとめ: おわるが画面内・64px以上`, () => inViewTall('[data-action="finish"]', w, h));
    await check(`${tag} まとめ: バー内のボタン間隔が16px以上`, barGapsOk);
  }
}
