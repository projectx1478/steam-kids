// teko-07-ukabu（predict-slider の buoyancy。うかぶ面。開発者画面から入る。Issue #288・#670）：
// 8面を面ごとの手順で通す。浮く失敗→ヒント→やりなおし、沈む失敗→ヒント、逆向き、ふうせんだけ足す、答えが2つ（net=0でクリア）、360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-07-flow: teko-07を開発者画面から入り、8面・浮く/沈むヒント・逆向き・答え2つ・360px幅(Issue #288/#670)';

async function click(page, action, n = 1) {
  for (let k = 0; k < n; k += 1) await page.click(`[data-action="${action}"]`);
}

async function noOverflow(page, label, check) {
  await page.setViewportSize({ width: 360, height: 640 });
  const o = await page.evaluate(() => {
    const e = document.documentElement;
    return e.scrollWidth <= e.clientWidth;
  });
  await check(`${label}：360px幅で横にはみ出さない`, () => o, true);
  await page.setViewportSize({ width: 1024, height: 640 });
}

async function robotData(page, key) {
  return Number(await page.evaluate((k) => document.querySelector('[data-robot]').dataset[k], key));
}

// 押す回数 → run → 次へ
async function solve(page, { wp = 0, wm = 0, bp = 0 }, last = false) {
  await click(page, 'weight-plus', wp);
  await click(page, 'weight-minus', wm);
  await click(page, 'balloon-plus', bp);
  await click(page, 'run');
  const next = last ? 'next' : 'next-stage';
  await page.waitForSelector(`[data-action="${next}"]`, { timeout: 10000 });
  return next;
}

async function failOnce(page, check, label, word) {
  await click(page, 'run');
  await page.waitForSelector('[data-hint="buoyancy"]', { timeout: 10000 });
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check(`${label}：ヒントに「${word}」`, async () => (await page.textContent('[data-hint="buoyancy"]')).includes(word), true);
  await click(page, 'retry');
  await page.waitForSelector('[data-action="run"]');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-07が並ぶ', async () => (await page.$$('[data-lesson-id="teko-07-ukabu"]')).length, 1);

  await enterPlay(page, 'teko-07-ukabu');

  // 数字：1面はおもりmass1・base2。盤の文字がJSONと一致する
  await check('p1：おもりの丸の数字が1（mass）', async () => await page.evaluate(() => [...document.querySelectorAll('[data-weight] text')].map((t) => t.textContent).join(',')), '1');
  await check('p1：ロボットの丸が「↑2」（base）', async () => await page.evaluate(() => [...document.querySelectorAll('.buoyancy-board text')].map((t) => t.textContent).filter((t) => t.startsWith('↑')).join(',')), '↑2');

  // 1面：浮く失敗→クリア
  await noOverflow(page, 'p1', check);
  await failOnce(page, check, 'p1：浮く', 'うかんだ');
  await click(page, 'weight-plus');
  await click(page, 'run');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await click(page, 'next-stage');

  // 2面
  await page.waitForSelector('[data-action="weight-plus"]');
  await noOverflow(page, 'p2', check);
  await solve(page, { wp: 2 });
  await click(page, 'next-stage');

  // 3面：ふうせん登場。0個で − は押せない
  await page.waitForSelector('[data-action="balloon-minus"]');
  await check('p3：ふうせん−は無効（0個）', () => page.locator('[data-action="balloon-minus"]').isDisabled(), true);
  await noOverflow(page, 'p3', check);
  await click(page, 'balloon-plus');
  await check('p3：ふうせんの丸の数字が2（lift）', async () => await page.evaluate(() => [...document.querySelectorAll('[data-balloon] text')].map((t) => t.textContent).join(',')), '2');
  await check('p3：おもりの丸の数字が3（mass）', async () => await page.evaluate(() => [...document.querySelectorAll('[data-weight] text')].map((t) => t.textContent).join(',')), '3');
  await click(page, 'balloon-minus');
  await solve(page, { wp: 1, bp: 1 });
  await click(page, 'next-stage');

  // 4面：逆向き（おもり4から減らす）
  await page.waitForSelector('[data-action="weight-minus"]');
  await check('p4：おもり4個から始まる', async () => await robotData(page, 'weights'), 4);
  await solve(page, { wm: 1 });
  await click(page, 'next-stage');

  // 5面（旧p3）：沈む失敗→おもり＋ふうせん
  await page.waitForSelector('[data-action="balloon-plus"]');
  await failOnce(page, check, 'p5：沈む', 'しずんだ');
  await solve(page, { wp: 1, bp: 2 });
  await click(page, 'next-stage');

  // 6面：ふうせんだけ足す
  await page.waitForSelector('[data-action="balloon-plus"]');
  await check('p6：おもり3個から始まる', async () => await robotData(page, 'weights'), 3);
  await solve(page, { bp: 2 });
  await click(page, 'next-stage');

  // 7面：おもり2・ふうせん1から
  await page.waitForSelector('[data-action="balloon-plus"]');
  await check('p7：おもり2個から始まる', async () => await robotData(page, 'weights'), 2);
  await check('p7：ふうせん1個から始まる', async () => await robotData(page, 'balloons'), 1);
  await solve(page, { wp: 2, bp: 1 });
  await click(page, 'next-stage');

  // 8面：答えが2つ。(4,3) でも (3,1) でもクリア（net=0）
  await page.waitForSelector('[data-action="balloon-plus"]');
  await noOverflow(page, 'p8', check);
  await click(page, 'weight-plus', 3);
  await click(page, 'balloon-plus', 3);
  await click(page, 'run');
  await page.waitForSelector('[data-action="replay"]', { timeout: 10000 });
  await check('p8：(4,3)でクリア（ためしなおすが出る）', async () => (await page.$$('[data-action="replay"]')).length, 1);
  await click(page, 'replay');
  await page.waitForSelector('[data-action="run"]');
  await solve(page, { wp: 2, bp: 1 }, true);
  await check('p8：(3,1)でもクリア（つぎへが出る）', async () => (await page.$$('[data-action="next"]')).length, 1);
}
