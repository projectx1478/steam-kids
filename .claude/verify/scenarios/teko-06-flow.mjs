// teko-06-practice（シーソーのれんしゅう。開発者画面から入る。Issue #611）：
// ばんごう入力→5面が番号から決まる（ページ内の generateSeesawRun と一致）→位置を動かしてクリア→最終面でsummaryへ
// →同じ番号なら同じ盤→各面で盤が画面内・ボタン高さ48px以上。重さの−＋は出ない（位置だけ動く面）。
export const name = 'teko-06-flow: teko-06を開発者画面から入り、ばんごう→5面生成・クリア・同じ番号で同じ盤・summary・配置(Issue #611)';

const CODE = '042';
const SEL = ['pos-left', 'pos-right', 'run'].map((a) => `[data-action="${a}"]`);

const counts = (page) => page.evaluate(async () => {
  const t = (await import('/js/events.js')).getEvents().map((e) => e.type);
  return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length].join();
});
const click = async (page, action, n = 1) => {
  for (let k = 0; k < n; k += 1) await page.click(`[data-action="${action}"]`);
};
const boardHtml = (page) => page.$eval('.seesaw-board', (el) => el.outerHTML);

// ページ内の生成関数で、期待する5面（{ start, solution }）を求める。
const expectedRun = (page, code) => page.evaluate(async (c) => {
  const { generateSeesawRun, SEESAW_RUN_STAGES } = await import('/js/engine-seesaw-gen.js');
  const { solutions } = await import('/js/engine-seesaw.js');
  return generateSeesawRun(SEESAW_RUN_STAGES, c).map((s) => ({ start: s.mover.start, solution: solutions(s)[0], notches: s.notches }));
}, code);

async function enterCode(page, code) {
  await page.goto('/index.html?lesson=teko-06-practice');
  await page.waitForSelector('.seed-keypad');
  for (const d of code) await page.click(`[data-key="${d}"]`);
  await click(page, 'start');
  await page.waitForSelector('.seesaw-board');
}

async function layout(page, label, check) {
  for (const vp of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp);
    const b = await page.evaluate(() => {
      const r = document.querySelector('.seesaw-board').getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    await check(`${label}：${vp.width}x${vp.height}で盤が画面内`, () => b.left >= 0 && b.right <= vp.width && b.top >= 0 && b.bottom <= vp.height, true);
    const hs = [];
    for (const s of SEL) hs.push((await page.locator(s).boundingBox()).height);
    await check(`${label}：${vp.width}x${vp.height}で各ボタンの高さが48px以上`, () => hs.every((h) => h >= 48), true);
  }
  await page.setViewportSize({ width: 1024, height: 640 });
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-06が並ぶ', async () => (await page.$$('[data-lesson-id="teko-06-practice"]')).length, 1);
  await page.goto('/index.html?view=map');
  await check('通常画面にはteko-06が出ない', async () => (await page.$$('[data-lesson-id="teko-06-practice"]')).length, 0);

  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/index.html?lesson=teko-06-practice');
  await page.waitForSelector('.seed-keypad');
  await check('最初はばんごう入力画面', () => page.getAttribute('#stage', 'data-step'), 'seedPick');

  await enterCode(page, CODE);
  const run5 = await expectedRun(page, CODE);
  await check('生成関数は5面を返す', async () => run5.length, 5);
  await check('p1：−＋は出ない（位置だけ動く面）', async () => (await page.$$('[data-action="robots-minus"], [data-action="robots-plus"]')).length, 0);
  await check('p1：◀と▶が出る', async () => (await page.$$('[data-action="pos-left"], [data-action="pos-right"]')).length, 2);
  const firstBoard = await boardHtml(page);

  for (let i = 0; i < 5; i += 1) {
    const { start, solution } = run5[i];
    await page.waitForSelector('[data-action="run"]');
    await layout(page, `p${i + 1}`, check);
    if (i === 0) {
      // 開始位置のまま実行→失敗→もういちど
      await click(page, 'run');
      await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
      await check('p1：開始位置では傾いたまま（足あとが1件）', async () => (await page.$$('[data-footprint]')).length, 1);
      await click(page, 'retry');
      await page.waitForSelector('[data-action="run"]');
    }
    if (solution > start) await click(page, 'pos-right', solution - start);
    else await click(page, 'pos-left', start - solution);
    await click(page, 'run');
    const last = i === 4;
    await page.waitForSelector(last ? '[data-action="next"]' : '[data-action="next-stage"]', { timeout: 10000 });
    if (last) await check('stage_clear4回・clear1回（最終面はclear）', () => counts(page), '4,1');
    await click(page, last ? 'next' : 'next-stage');
  }

  await page.waitForSelector('[data-action="another-map"]');
  await check('summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('summaryにばんごうが出る', () => page.getAttribute('.seed-number', 'data-seed'), CODE);

  // 同じ番号なら同じ盤（1面目）
  await enterCode(page, CODE);
  await check('同じ番号：1面目の盤が同じ', async () => (await boardHtml(page)) === firstBoard, true);
}
