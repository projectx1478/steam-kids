// 横向きは「盤面｜操作パネル」の左右分割、縦向きは従来の縦積み（Issue #156）。
// playとれんしゅう（tutorial）の両方で、配置・セル上限・#app幅・64pxタップ領域・トレイの
// 内部スクロールをDOMの境界ボックスで判定する。

export const name = 'L1 左右分割レイアウト: 横向きは盤面｜操作パネル・縦向きは縦積み(Issue #156)';
import { enterPlay, resetTutorialFlags, routeLesson } from '../helpers.mjs';

// 上限までチップを積んでトレイが溢れる前提のため、実レッスンの上限値に依存しないインライン盤面を使う（Issue #215）。
const LESSON = 'l1-split-smoke';
const LESSON_DEF = {
  lessonId: LESSON,
  unitId: 'inline',
  title: 'テスト',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'どんぐりを さがそう' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'どんぐりを とって ゴールへ',
      grid: { cols: 3, rows: 4 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      items: [{ x: 1, y: 3 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'down', 'down', 'down', 'up', 'up', 'up', 'right'],
      maxCommands: 10,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};
const TUTORIAL_LESSON = 'cmd-01-susumu';

async function geometry(page) {
  return page.evaluate(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const area = vis('.board-area');
    const panel = vis('.controller-panel, .tutorial-side') || vis('.palette-row');
    const board = area.querySelector('.grid-board');
    const cell = board.querySelector('.grid-cell');
    const tray = vis('.command-queue');
    const small = [...document.querySelectorAll('#stage button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && (r.width < 63.5 || r.height < 63.5);
    }).length;
    return {
      area: rect(area),
      panel: rect(panel),
      board: rect(board),
      cellW: cell ? cell.getBoundingClientRect().width : 0,
      tray: rect(tray),
      trayScrolls: tray.scrollHeight > tray.clientHeight + 1,
      appW: document.getElementById('app').getBoundingClientRect().width,
      smallButtons: small,
    };
  });
}

const rightOf = (g) => g.panel.left >= g.area.right - 1 && g.panel.top < g.area.bottom && g.panel.bottom > g.area.top;
const below = (g) => g.panel.top >= g.area.bottom - 1;

async function toTutorial(page) {
  await page.goto(`/index.html?lesson=${TUTORIAL_LESSON}`);
  await resetTutorialFlags(page);
  await page.goto(`/index.html?lesson=${TUTORIAL_LESSON}`);
  await page.click('[data-action="how-to"]');
  await page.waitForSelector('.tutorial-screen .grid-board');
}

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await routeLesson(page, LESSON_DEF);

  const landscape = [{ width: 1280, height: 800 }, { width: 1024, height: 600 }];
  for (const vp of landscape) {
    const label = `${vp.width}x${vp.height}`;
    await page.setViewportSize(vp);
    await toTutorial(page);
    const t = await geometry(page);
    await check(`${label} tutorial: 操作パネルが盤面エリアの右`, () => rightOf(t));
    await check(`${label} tutorial: #appが768pxを超える`, () => t.appW > 768);
    await check(`${label} tutorial: 全ボタン64px以上`, () => t.smallButtons, 0);
    await enterPlay(page, LESSON);
    await page.waitForSelector('.play-screen .grid-board');

    const g = await geometry(page);
    await check(`${label} play: 操作パネルが盤面エリアの右`, () => rightOf(g));
    await check(`${label} play: #appが768pxを超える`, () => g.appW > 768);
    await check(`${label} play: 全ボタン64px以上`, () => g.smallButtons, 0);
    await check(`${label} play: 盤面が盤面エリア内`, () =>
      g.board.left >= g.area.left - 1 && g.board.right <= g.area.right + 1 && g.board.top >= g.area.top - 1 && g.board.bottom <= g.area.bottom + 1);
    if (vp.width === 1280) await check(`${label} play: セルが64pxを超える`, () => g.cellW > 64);
    if (vp.height === 600) {
      await check(`${label} play: トレイ高さがチップ2行分以上`, () => g.tray.height >= 64 * 2 + 8 - 1);
      const ys = await page.$$eval('.palette-row > [data-command]', (bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
      await check(`${label} play: パレット4つが1行`, () => ys, 1);
    }

    // 命令を積み続けても盤面の大きさが変わらず、トレイ内でスクロールする
    const before = g.board.width;
    for (let i = 0; i < 10; i += 1) {
      const btn = await page.$('.palette-row [data-command]:not(:disabled)');
      if (!btn) break;
      await btn.click();
    }
    const after = await geometry(page);
    await check(`${label} play: 上限までチップ積んでも盤面の幅が変わらない`, () => Math.abs(after.board.width - before) < 1);
    await check(`${label} play: 上限までチップ積んでも縦スクロールが出ない`, () =>
      page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    await check(`${label} play: トレイが操作パネル内に収まる`, () => after.tray.bottom <= after.panel.bottom + 1 && after.tray.top >= after.panel.top - 1);
    if (vp.height === 600) await check(`${label} play: 上限までチップはトレイ内で縦スクロール`, () => after.trayScrolls);
  }

  // 縦向き：従来の縦積み・セル上限64px
  await page.setViewportSize({ width: 390, height: 844 });
  await toTutorial(page);
  const pt = await geometry(page);
  await check('390x844 tutorial: 操作パネルが盤面エリアの下', () => below(pt));
  await enterPlay(page, LESSON);
  await page.waitForSelector('.play-screen .grid-board');
  const pg = await geometry(page);
  await check('390x844 play: 操作パネルが盤面エリアの下', () => below(pg));
  await check('390x844 play: セルは64px以下', () => pg.cellW <= 64.5);
  await check('390x844 play: #appは768px以下', () => pg.appW <= 768);

  // レッスン選択画面は横向きでも#app 768px以下
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html?view=map');
  await page.waitForSelector('.lesson-pick-btn');
  await check('1280x800 レッスン選択: #appは768px以下', () => page.evaluate(() => document.getElementById('app').getBoundingClientRect().width <= 768));
}
