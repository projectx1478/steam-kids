// teko-02-tsuriai2・teko-03-tsuriai3（predict-slider。開発者画面から入る）：
// 面1で右端開始のため◀に指ガイドが出て▶が押せない→右2体・左2か所の面の表示→全面クリアでstage_clear・clear記録。
// 盤が横1024・縦360でも画面内に収まる(Issue #608)。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-02-flow: teko-02/03を開発者画面から入り、◀の指ガイド・右端開始・右2体・左2組・全面クリア(Issue #608)';

const pos = (page) => page.getAttribute('[data-mover]', 'data-pos');
const counts = (page) => page.evaluate(async () => {
  const t = (await import('./js/events.js')).getEvents().map((e) => e.type);
  return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length].join();
});
// 右の可動側のロボット数／左のロボットの組数（x座標の種類数）
const moverRobots = (page) => page.evaluate(() => document.querySelectorAll('[data-mover] > svg').length);
const leftGroups = (page) => page.evaluate(() => new Set([...document.querySelectorAll('[data-left] > svg')].map((s) => s.getAttribute('x'))).size);

async function boardFits(page, label, check) {
  for (const vp of [{ width: 1024, height: 360 }, { width: 1024, height: 640 }]) {
    await page.setViewportSize(vp);
    const b = await page.evaluate(() => {
      const r = document.querySelector('.seesaw-board').getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    await check(`${label}：${vp.width}x${vp.height}で盤が画面内`, () => b.left >= 0 && b.right <= vp.width && b.top >= 0 && b.bottom <= vp.height, true);
  }
}

async function move(page, from, to) {
  const sel = to > from ? '[data-action="pos-right"]' : '[data-action="pos-left"]';
  for (let i = 0; i < Math.abs(to - from); i += 1) await page.click(sel);
}

// stages: [開始位置, 解]。最終面だけ[data-action="next"]で終わる。
async function playAll(page, check, label, stages, hooks = {}) {
  for (let i = 0; i < stages.length; i += 1) {
    const [start, sol] = stages[i];
    await page.waitForSelector('[data-action="pos-right"]');
    if (hooks[i]) await hooks[i]();
    await check(`${label} p${i + 1}：開始位置が${start}`, () => pos(page), String(start));
    await move(page, start, sol);
    await check(`${label} p${i + 1}：位置が${sol}になる`, () => pos(page), String(sol));
    await page.click('[data-action="run"]');
    const last = i === stages.length - 1;
    await page.waitForSelector(last ? '[data-action="next"]' : '[data-action="next-stage"]', { timeout: 10000 });
    if (!last) await page.click('[data-action="next-stage"]');
  }
}

// 開発者画面（dev=1）はイベントを記録しない（js/events.js）。流れの検証は通常URLで入る。
async function openFromDev(page, lessonId) {
  await page.goto('/index.html?view=map&dev=1');
  await page.click(`[data-lesson-id="${lessonId}"]`);
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map');
  await check('通常画面にはteko-02が出ない', async () => (await page.$$('[data-lesson-id="teko-02-tsuriai2"]')).length, 0);
  await check('通常画面にはteko-03が出ない', async () => (await page.$$('[data-lesson-id="teko-03-tsuriai3"]')).length, 0);
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-02が並ぶ', async () => (await page.$$('[data-lesson-id="teko-02-tsuriai2"]')).length, 1);
  await check('dev：teko-03が並ぶ', async () => (await page.$$('[data-lesson-id="teko-03-tsuriai3"]')).length, 1);

  await openFromDev(page, 'teko-02-tsuriai2');
  await check('dev：teko-02を開始するとplayに入る', () => page.getAttribute('#stage', 'data-step'), 'play');
  await openFromDev(page, 'teko-03-tsuriai3');
  await check('dev：teko-03を開始するとplayに入る', () => page.getAttribute('#stage', 'data-step'), 'play');

  // ---- teko-02（8面） ----
  await enterPlay(page, 'teko-02-tsuriai2');
  await check('p1：右端開始で▶が押せない', () => page.isDisabled('[data-action="pos-right"]'), true);
  await check('p1：◀は押せる', () => page.isDisabled('[data-action="pos-left"]'), false);
  await check('p1：指ガイドが1つ出る', async () => (await page.$$('.hand-hint')).length, 1);
  await check('p1：指ガイドが◀の真下に出る', () => page.evaluate(() => {
    const h = document.querySelector('.hand-hint').getBoundingClientRect();
    const l = document.querySelector('[data-action="pos-left"]').getBoundingClientRect();
    const cx = h.left + h.width / 2;
    return cx >= l.left && cx <= l.right;
  }), true);
  await check('p1：左は1体・1組、右は1体', async () => [await leftGroups(page), await moverRobots(page)].join(), '1,1');

  await playAll(page, check, 'teko-02', [[4, 2], [1, 2], [1, 4], [5, 4], [1, 5], [1, 3], [5, 3], [1, 4]], {
    1: async () => {
      await check('p2：右が2体', () => moverRobots(page), 2);
      await boardFits(page, 'p2', check);
    },
    2: async () => {
      await check('p3：左が2組', () => leftGroups(page), 2);
      await boardFits(page, 'p3', check);
    },
    4: async () => { await check('p5：左が2組', () => leftGroups(page), 2); },
    7: async () => {
      await check('p8：右が3体', () => moverRobots(page), 3);
      await boardFits(page, 'p8', check);
    },
  });
  await check('teko-02：stage_clear8回・clear1回', () => counts(page), '8,1');
  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('teko-02：summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');

  // ---- teko-03（5面） ----
  await enterPlay(page, 'teko-03-tsuriai3');
  await check('teko-03 p1：右端開始で▶が押せない', () => page.isDisabled('[data-action="pos-right"]'), true);
  await check('teko-03 p1：左が2組・右が2体', async () => [await leftGroups(page), await moverRobots(page)].join(), '2,2');
  await boardFits(page, 'teko-03 p1', check);
  await playAll(page, check, 'teko-03', [[5, 2], [1, 3], [5, 4], [1, 5], [5, 4]]);
  await check('teko-03：stage_clear計13回・clear計2回', () => counts(page), '13,2');
  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('teko-03：summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');
}
