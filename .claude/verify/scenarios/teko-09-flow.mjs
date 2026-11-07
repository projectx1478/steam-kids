// teko-09-oukou（predict-slider。右固定→左右可動→2組。Issue #676）：
// 右の固定ロボットが見える→◀▶で全8面をクリア→stage_clear7回・clear1回→summaryへ→盤が画面内・ボタン高さ48px以上。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-09-flow: teko-09を開発者画面から入り、右固定・左右可動・2組の全8面クリア・レイアウト(Issue #676)';

const counts = (page) => page.evaluate(async () => {
  const t = (await import('./js/events.js')).getEvents().map((e) => e.type);
  return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length].join();
});

async function layout(page, label, check, actions) {
  for (const vp of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp);
    const b = await page.evaluate(() => {
      const r = document.querySelector('.seesaw-board').getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    await check(`${label}：${vp.width}x${vp.height}で盤が画面内`, () => b.left >= 0 && b.right <= vp.width && b.top >= 0 && b.bottom <= vp.height, true);
    const hs = [];
    for (const a of actions) hs.push((await page.locator(`[data-action="${a}"]`).boundingBox()).height);
    await check(`${label}：${vp.width}x${vp.height}で各ボタンの高さが48px以上`, () => hs.every((h) => h >= 48), true);
  }
  await page.setViewportSize({ width: 1024, height: 640 });
}

async function click(page, action, n = 1) {
  for (let k = 0; k < n; k += 1) await page.click(`[data-action="${action}"]`);
}

async function clearStage(page) {
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');
  await page.waitForSelector('[data-action="run"]');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map');
  await check('通常画面にもteko-09が並ぶ（公開）', async () => (await page.$$('[data-lesson-id="teko-09-oukou"]')).length, 1);

  await enterPlay(page, 'teko-09-oukou');
  await check('p1：盤に右の固定ロボットが見える', () => page.evaluate(() => document.querySelectorAll('[data-right] svg').length > 0), true);
  await layout(page, 'p1', check, ['pos-left', 'pos-right', 'run']);
  await click(page, 'pos-left', 2); // 4→3→2
  await clearStage(page);

  await click(page, 'pos-left', 1); // p2：4→3
  await clearStage(page);

  await click(page, 'pos-left', 2); // p3：4→3→2
  await clearStage(page);

  // p4：左右どちらにも動かせる。1→2→3→4
  await check('p4：◀▶が両方押せる', () => page.evaluate(() => ['pos-left', 'pos-right'].every((a) => !document.querySelector(`[data-action="${a}"]`).disabled)), true);
  await layout(page, 'p4', check, ['pos-left', 'pos-right', 'run']);
  await click(page, 'pos-right', 3);
  await clearStage(page);

  await click(page, 'pos-left', 3); // p5：1→-1→-3→-4
  await clearStage(page);

  await click(page, 'pos-left', 2); // p6：1→-1→-3
  await clearStage(page);

  // p7：2組。①4→2（3は②がいるので飛ばす）、②3→1
  await check('p7：①②の選択ボタンが出る', async () => [(await page.$$('[data-action="select-mover-1"]')).length, (await page.$$('[data-action="select-mover-2"]')).length].join(), '1,1');
  await layout(page, 'p7', check, ['select-mover-1', 'select-mover-2', 'pos-left', 'pos-right', 'run']);
  await click(page, 'pos-left', 1);
  await click(page, 'select-mover-2');
  await click(page, 'pos-left', 1);
  await clearStage(page);

  // p8：①4→3を飛ばして2→1、②3→4
  await click(page, 'pos-left', 2);
  await click(page, 'select-mover-2');
  await click(page, 'pos-right', 1);
  await click(page, 'run');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('teko-09：stage_clear7回・clear1回（最終面はclear）', () => counts(page), '7,1');
  await click(page, 'next');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('teko-09：summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');
}
