// teko-01-tsuriai（predict-slider）：◀▶で位置が動く→外れた位置でためすとヒントと足あと→
// 正解でステージクリア→最終ステージでclearが記録される。横向き・縦向きでタップ領域とはみ出しも見る(Issue #150)。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-flow: シーソーの◀▶・失敗ヒントと足あと・ステージクリア・clear記録・レイアウト(Issue #150)';

const pos = (page) => page.getAttribute('[data-mover]', 'data-pos');
const eventTypes = (page) => page.evaluate(async () => (await import('./js/events.js')).getEvents().map((e) => e.type));

async function boxes(page, selectors) {
  return page.evaluate((sels) => sels.map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }), selectors);
}

export default async function run({ page, check }) {
  await enterPlay(page, 'teko-01-tsuriai');

  await check('最初は右のロボットがstart(1)にいる', () => pos(page), '1');
  await check('先頭では◀が押せない', () => page.isDisabled('[data-action="pos-left"]'), true);
  await page.click('[data-action="pos-right"]');
  await check('▶で1刻み右へ', () => pos(page), '2');
  await page.click('[data-action="pos-left"]');
  await check('◀で1刻み左へ', () => pos(page), '1');

  for (const [label, vp] of [['横向き', { width: 1024, height: 640 }], ['縦向き', { width: 360, height: 640 }]]) {
    await page.setViewportSize(vp);
    const [l, r, run, board] = await boxes(page, ['[data-action="pos-left"]', '[data-action="pos-right"]', '[data-action="run"]', '.seesaw-board']);
    await check(`${label}：◀▶ためすが64px以上`, () => [l, r, run].every((b) => b.w >= 64 && b.h >= 64), true);
    await check(`${label}：シーソー盤面が画面内に収まる`, () => board.left >= 0 && board.right <= vp.width && board.bottom <= vp.height, true);
  }
  await page.setViewportSize({ width: 1024, height: 640 });

  // 外れた位置（p1の解は2）でためす：左が重く傾き、ヒントと足あとが出る。点数や✕は出さない。
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('左が重いと左が下がる(tilt=-1)', () => page.getAttribute('[data-plank]', 'data-tilt'), '-1');
  await check('ヒント(data-hint=tilt)が出る', async () => (await page.$$('[data-hint="tilt"]')).length, 1);
  await check('未達成時はdata-resultが付かない', async () => (await page.$$('[data-result]')).length, 0);
  await check('試した位置に足あとが残る', () => page.$$eval('[data-footprint]', (e) => e.map((x) => x.dataset.footprint).join()), '1');

  await page.click('[data-action="retry"]');
  await page.waitForSelector('[data-action="run"]');
  await check('もういちどでstartへ戻り足あとは残る', async () => [await pos(page), (await page.$$('[data-footprint]')).length].join(), '1,1');

  // p1：解2でクリア
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await check('正解でクリア表示(data-result=clear)', async () => (await page.$$('[data-result="clear"]')).length, 1);
  await page.click('[data-action="next-stage"]');

  // p2：解4
  await page.waitForSelector('[data-action="pos-right"]');
  for (let i = 0; i < 3; i += 1) await page.click('[data-action="pos-right"]');
  await check('p2で位置が4になる', () => pos(page), '4');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');

  // p3（最終）：解6
  await page.waitForSelector('[data-action="pos-right"]');
  for (let i = 0; i < 5; i += 1) await page.click('[data-action="pos-right"]');
  await check('p3で位置が6になり▶が押せない', async () => [await pos(page), await page.isDisabled('[data-action="pos-right"]')].join(), '6,true');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 10000 });
  await check('最終ステージの次はnext（next-stageではない）', async () => (await page.$$('[data-action="next-stage"]')).length, 0);
  await check('stage_clear2回・clear1回・retry1回が記録される', async () => {
    const t = await eventTypes(page);
    return [t.filter((x) => x === 'stage_clear').length, t.filter((x) => x === 'clear').length, t.filter((x) => x === 'retry').length].join();
  }, '2,1,1');

  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-action="back-to-picker"]');
  await check('summaryへ進める', () => page.getAttribute('#stage', 'data-step'), 'summary');
}
