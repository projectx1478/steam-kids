// 「つづきから」で直前のレッスンへ直行（Issue #740）。使用中スロット1つ：タイトルから play まで2タップ。
// クリア済みの最後のレッスンで continue すると、次の未クリアの intro が開く。

export const name = 'N2 つづきから直行: スロット1つで2タップ・クリア済みなら次の未クリア・全クリアは大項目/マップ(Issue #740)';

async function seed(page, clearedIds) {
  await page.goto('/index.html');
  await page.waitForSelector('#stage[data-screen="title"]');
  await page.evaluate((ids) => {
    localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-n2', label: 'たろう', createdAt: 1 }));
    localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
    localStorage.setItem('steamkids.events', JSON.stringify(ids.map((id, i) => (
      { eventId: `e${i}`, learnerId: 'l-n2', lessonId: id, stepId: 'p3', type: 'clear', ts: 1000 + i, payload: {} }
    ))));
  }, clearedIds);
  await page.goto('/index.html');
  await page.waitForSelector('[data-action="title-continue"]');
}

export default async function run({ page, check }) {
  const lessonId = () => new URL(page.url()).searchParams.get('lesson');
  const order = await (async () => {
    await page.goto('/index.html');
    return page.evaluate(async () => {
      const j = await (await fetch('/lessons/index.json')).json();
      const units = j.tracks ? j.tracks.flatMap((t) => t.units) : j.units;
      return units.flatMap((u) => u.lessonIds);
    });
  })();

  // 履歴なし：先頭の intro → 1タップで play 系へ（計2タップ）
  await seed(page, []);
  await page.click('[data-action="title-continue"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await check('履歴なし：先頭レッスンの intro が開く', async () => lessonId(), order[0]);
  await page.click('[data-action="resume"], [data-action="start"]');
  await page.waitForFunction(() => ['tutorial', 'predict', 'play'].includes(document.querySelector('#stage')?.dataset.step));
  await check('2タップで intro を抜けて進む', async () => ['tutorial', 'predict', 'play'].includes(await page.getAttribute('#stage', 'data-step')), true);

  // クリア済みの最後 → 次の未クリア
  await seed(page, [order[0]]);
  await page.click('[data-action="title-continue"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'intro');
  await check('1本クリア済み：次の未クリアの intro が開く', async () => lessonId(), order[1]);

  // 全クリア：intro でなく大項目選択か単元マップ
  await seed(page, order);
  await page.click('[data-action="title-continue"]');
  await page.waitForFunction(() => ['tracks', 'picker'].includes(document.querySelector('#stage')?.dataset.screen));
  await check('全クリア：大項目選択または単元マップが出る', async () => ['tracks', 'picker'].includes(await page.getAttribute('#stage', 'data-screen')), true);
}
