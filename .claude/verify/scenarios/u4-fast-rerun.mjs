// 同じステージの2回目以降のじっこうは、前回と先頭から同じ手を2倍速で流す（Issue #743）。
// 16手の面：1回目（15手・未達で失敗）は等速、列を残して16手目を足した2回目は先頭15手が速い。
// クリア後の「…」は 0.8秒。凍結fixtureに依存しないよう routeLesson のインライン盤面で書く。
import { routeLesson, enterPlay, clickRetryKeep } from '../helpers.mjs';

export const name = 'U4 2回目以降の速い再生: 1回目は等速・同じ手は0.3秒・クリア後の間0.8秒(Issue #743)';

const LESSON = {
  lessonId: 'fast-rerun-smoke',
  unitId: 'inline',
  title: 'テスト',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ゴールへ いこう' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 9, rows: 9 },
      start: { x: 0, y: 0 },
      goal: { x: 8, y: 8 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: [...Array(8).fill('right'), ...Array(8).fill('down')],
      maxCommands: 16,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);
  // 既定は reduced-motion（config.mjs）。移動の長さ（__gridAnimLog）を見るため通常モーションにする。
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'fast-rerun-smoke');

  const logMs = () => page.evaluate(() => window.__gridAnimLog.filter((e) => e.type === 'move').map((e) => e.ms));

  // 1回目：右8＋下7＝15手（ゴールの1マス手前で止まって未達）。等速（移動450ms）。
  for (let i = 0; i < 8; i += 1) await page.click('[data-command="right"]');
  for (let i = 0; i < 7; i += 1) await page.click('[data-command="down"]');
  const before1 = (await logMs()).length;
  const t1 = Date.now();
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  const run1Ms = Date.now() - t1;
  const ms1 = (await logMs()).slice(before1);
  await check('1回目は15手とも450ms（等速）', () => ms1.length === 15 && ms1.every((m) => m === 450), true);
  await check('1回目は15手×0.6秒ほどかかる（8秒以上）', () => run1Ms >= 8000, true);

  // 2回目：列を残して16手目（down）を足す。先頭15手は前回と同じ＝速い（225ms）、16手目だけ等速。
  await clickRetryKeep(page);
  await page.click('[data-command="down"]');
  const before2 = (await logMs()).length;
  // 「…」→結果ボタンの間はページ内の時刻（performance.now）で測る。Playwright の往復の遅れ（遅い環境で1秒以上）を含めないため。
  await page.evaluate(() => {
    const m = (window.__gapMarks = {});
    const mo = new MutationObserver(() => {
      if (m.dots == null && document.querySelector('[data-result-gap]')) m.dots = performance.now();
      if (m.dots != null && m.btn == null && document.querySelector('[data-action="next"], [data-action="next-stage"]')) {
        m.btn = performance.now();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
  const t2 = Date.now();
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-gap]', { timeout: 15000 });
  const run2Ms = Date.now() - t2;
  const ms2 = (await logMs()).slice(before2);
  await check('2回目の先頭15手は225ms・16手目は450ms', () => ms2.length === 16 && ms2.slice(0, 15).every((m) => m === 225) && ms2[15] === 450, true);
  // 絶対秒数は環境の速さで揺れるので、同じ環境の1回目（等速15手）との比で見る。理想は約0.4倍（速い15手＋等速1手）。
  await check('2回目はじっこう押下から「…」までが1回目の0.75倍以内', () => run2Ms <= run1Ms * 0.75, true);

  // クリア後の間：「…」から結果ボタンまで 0.8秒（測定の揺れを見て 0.65〜1.0秒）
  await page.waitForSelector('[data-action="next"], [data-action="next-stage"]', { timeout: 5000 });
  const gap = await page.evaluate(() => {
    const m = window.__gapMarks;
    return m && m.btn != null && m.dots != null ? m.btn - m.dots : -1;
  });
  await check('クリア後の間は約0.8秒', () => gap >= 650 && gap <= 1000, true);
}
