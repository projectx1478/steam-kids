// teko-05-ryouhou（predict-slider。重さも位置も動く面。開発者画面から入る。Issue #612）：
// −＋と◀▶が両方出る→足あとは pos:重さ→別の組でもクリア→全面クリアでsummaryへ→2行配置で盤が画面内・ボタン高さ48px以上。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-05-flow: teko-05を開発者画面から入り、−＋と◀▶・別の組でもクリア・足あと・全面クリア・2行配置(Issue #612)';

const counts = (page) => page.evaluate(async () => {
  const t = (await import('./js/events.js')).getEvents().map((e) => e.type);
  return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length].join();
});
const moverRobots = (page) => page.evaluate(() => document.querySelectorAll('[data-mover] > svg').length);
const SEL = ['robots-minus', 'robots-plus', 'pos-left', 'pos-right', 'run'].map((a) => `[data-action="${a}"]`);

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
}

async function click(page, action, n = 1) {
  for (let k = 0; k < n; k += 1) await page.click(`[data-action="${action}"]`);
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map');
  await check('通常画面にはteko-05が出ない', async () => (await page.$$('[data-lesson-id="teko-05-ryouhou"]')).length, 0);
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-05が並ぶ', async () => (await page.$$('[data-lesson-id="teko-05-ryouhou"]')).length, 1);

  await enterPlay(page, 'teko-05-ryouhou');
  await check('p1：−と＋が出る', async () => [(await page.$$('[data-action="robots-minus"]')).length, (await page.$$('[data-action="robots-plus"]')).length].join(), '1,1');
  await check('p1：◀と▶も出る', async () => [(await page.$$('[data-action="pos-left"]')).length, (await page.$$('[data-action="pos-right"]')).length].join(), '1,1');
  await check('p1：開始の重さは1', () => moverRobots(page), 1);
  await layout(page, 'p1', check);

  // 開始(位置1・重さ1)のまま実行→失敗→足あとは pos:重さ
  await page.setViewportSize({ width: 1024, height: 640 });
  await click(page, 'run');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('p1：失敗すると足あとが1件', async () => (await page.$$('[data-footprint]')).length, 1);
  await check('p1：足あとのキーは pos:重さ', () => page.getAttribute('[data-footprint]', 'data-footprint'), '1:1');
  await click(page, 'retry');
  await page.waitForSelector('[data-action="run"]');

  // p1：位置1のまま重さを＋1回→(1,2)でクリア
  await click(page, 'robots-plus');
  await check('p1：重さが2になる', () => moverRobots(page), 2);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // p2：同じ盤で開始(位置2・重さ2)→重さを−1回→(2,1)でクリア
  await page.waitForSelector('[data-action="robots-plus"]');
  await check('p2：開始の重さは2', () => moverRobots(page), 2);
  await layout(page, 'p2', check);
  await page.setViewportSize({ width: 1024, height: 640 });
  await click(page, 'robots-minus');
  await check('p2：重さが1になる', () => moverRobots(page), 1);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // p3：位置を▶1回・重さを＋1回→(2,2)
  await page.waitForSelector('[data-action="robots-plus"]');
  await layout(page, 'p3', check);
  await page.setViewportSize({ width: 1024, height: 640 });
  // 位置だけ（重さ1・位置2）では失敗→ためしなおす
  await click(page, 'pos-right');
  await click(page, 'run');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await click(page, 'retry');
  // 重さだけ（重さ2・位置1）でも失敗→ためしなおす
  await click(page, 'robots-plus');
  await click(page, 'run');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await click(page, 'retry');
  await click(page, 'pos-right');
  await click(page, 'robots-plus');
  await check('p3：重さが2になる', () => moverRobots(page), 2);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // p4：位置を▶1回・重さを＋2回→(2,3)
  await page.waitForSelector('[data-action="robots-plus"]');
  await layout(page, 'p4', check);
  await page.setViewportSize({ width: 1024, height: 640 });
  // 位置だけ（重さ1・位置2）では失敗→ためしなおす
  await click(page, 'pos-right');
  await click(page, 'run');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await click(page, 'retry');
  // 重さだけ（重さ3・位置1）でも失敗→ためしなおす
  await click(page, 'robots-plus', 2);
  await click(page, 'run');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await click(page, 'retry');
  await click(page, 'pos-right');
  await click(page, 'robots-plus', 2);
  await check('p4：重さが3になる', () => moverRobots(page), 3);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('teko-05：stage_clear3回・clear1回（最終面はclear）', () => counts(page), '3,1');
  await click(page, 'next');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('teko-05：summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');

  // 別のセッション：p1 を別の組 (位置2・重さ1) でもクリアになる
  await page.goto('/index.html?view=map&dev=1');
  await enterPlay(page, 'teko-05-ryouhou');
  await click(page, 'pos-right');
  await check('別の組：位置を▶1回しても重さは1', () => moverRobots(page), 1);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await check('別の組：p1 は (位置2・重さ1) でもクリアになる', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
}
