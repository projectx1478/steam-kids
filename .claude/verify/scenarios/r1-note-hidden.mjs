// Issue #726：play の note（面の設計メモ）は子どもの画面（DOM）に出ない。
// cmd-08-yomu の p1〜p3 を開き、JSON の note が body.innerText と outerHTML のどちらにも無いことを確認する。

export const name = 'R1 note非表示: cmd-08-yomuのp1〜p3でnoteがDOMに無い(Issue #726)';

const ID = 'cmd-08-yomu';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const lesson = await page.evaluate((id) => fetch(`lessons/${id}.json`).then((r) => r.json()), ID);
  const plays = lesson.steps.filter((s) => s.kind === 'play');
  await check('p1〜p3に note がある', () => plays.length === 3 && plays.every((p) => typeof p.note === 'string' && p.note.length > 0), true);

  const hidden = async () => {
    const { text, html } = await page.evaluate(() => ({ text: document.body.innerText, html: document.documentElement.outerHTML }));
    return plays.every((p) => !text.includes(p.note) && !html.includes(p.note));
  };

  await page.goto(`/index.html?lesson=${ID}`);
  await page.waitForSelector('#stage[data-step="intro"]');
  await check('introでnoteが出ない', hidden, true);

  for (const p of plays) {
    await page.evaluate(([k, stepId]) => localStorage.setItem(k, JSON.stringify({ stepId, ts: 1 })), [`steamkids.resume.${ID}`, p.stepId]);
    await page.goto(`/index.html?lesson=${ID}`);
    await page.waitForSelector('[data-action="resume"]');
    await page.click('[data-action="resume"]');
    await page.waitForFunction((sid) => document.querySelector('#stage')?.dataset.stepId === sid, p.stepId);
    await check(`${p.stepId}の画面でnoteが出ない`, hidden, true);
  }
}
