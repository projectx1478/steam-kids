// teko-04-omosa（predict-slider。重さだけ動く面。開発者画面から入る。Issue #612）：
// − ＋ が出て ◀▶ が出ない→開始で − が disabled→＋で重さを解に合わせて全面クリア→解の手前で失敗→足あと1件→ためしなおすで重さ1へ。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-04-flow: teko-04を開発者画面から入り、−＋だけ・重さ変更・失敗の足あと・ためしなおし・全面クリア(Issue #612)';

const counts = (page) => page.evaluate(async () => {
  const t = (await import('./js/events.js')).getEvents().map((e) => e.type);
  return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length].join();
});
const moverRobots = (page) => page.evaluate(() => document.querySelectorAll('[data-mover] > svg').length);

async function boardFits(page, label, check) {
  for (const vp of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp);
    const b = await page.evaluate(() => {
      const r = document.querySelector('.seesaw-board').getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    await check(`${label}：${vp.width}x${vp.height}で盤が画面内`, () => b.left >= 0 && b.right <= vp.width && b.top >= 0 && b.bottom <= vp.height, true);
  }
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map');
  await check('通常画面にはteko-04が出ない', async () => (await page.$$('[data-lesson-id="teko-04-omosa"]')).length, 0);
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-04が並ぶ', async () => (await page.$$('[data-lesson-id="teko-04-omosa"]')).length, 1);

  await enterPlay(page, 'teko-04-omosa');
  await check('p1：−と＋が出る', async () => [(await page.$$('[data-action="robots-minus"]')).length, (await page.$$('[data-action="robots-plus"]')).length].join(), '1,1');
  await check('p1：◀▶が出ない', async () => (await page.$$('[data-action="pos-left"], [data-action="pos-right"]')).length, 0);
  await check('p1：開始で−が押せない', () => page.isDisabled('[data-action="robots-minus"]'), true);
  await check('p1：開始で＋は押せる', () => page.isDisabled('[data-action="robots-plus"]'), false);
  await check('p1：指ガイドが1つ出る', async () => (await page.$$('.hand-hint')).length, 1);
  await check('p1：開始の重さは1', () => moverRobots(page), 1);
  await boardFits(page, 'p1', check);

  // 解の手前（重さ1）で実行→失敗→足あと1件→ためしなおす→重さ1へ戻る
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('p1：失敗すると足あとが1件', async () => (await page.$$('[data-footprint]')).length, 1);
  await check('p1：足あとのキーは pos:重さ', () => page.getAttribute('[data-footprint]', 'data-footprint'), '1:1');
  await page.click('[data-action="retry"]');
  await page.waitForSelector('[data-action="run"]');
  await check('p1：ためしなおすと重さが1に戻る', () => moverRobots(page), 1);
  await check('p1：ためしなおすと−が押せない', () => page.isDisabled('[data-action="robots-minus"]'), true);

  // 各面：＋を（解−1）回→重さが解と一致→ためす
  const solutions = [2, 3, 2];
  for (let i = 0; i < solutions.length; i += 1) {
    const sol = solutions[i];
    if (i > 0) {
      await page.waitForSelector('[data-action="robots-plus"]');
      await check(`p${i + 1}：−と＋が出て◀▶が出ない`, async () => [(await page.$$('[data-action="robots-minus"]')).length, (await page.$$('[data-action="pos-left"]')).length].join(), '1,0');
      await boardFits(page, `p${i + 1}`, check);
      await page.setViewportSize({ width: 1024, height: 640 });
    }
    for (let k = 1; k < sol; k += 1) await page.click('[data-action="robots-plus"]');
    await check(`p${i + 1}：重さが${sol}になる`, () => moverRobots(page), sol);
    await page.click('[data-action="run"]');
    const last = i === solutions.length - 1;
    await page.waitForSelector(last ? '[data-action="next"]' : '[data-action="next-stage"]', { timeout: 10000 });
    if (!last) await page.click('[data-action="next-stage"]');
  }
  await check('teko-04：stage_clear2回・clear1回（最終面はclear）', () => counts(page), '2,1');
  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('teko-04：summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');
}
