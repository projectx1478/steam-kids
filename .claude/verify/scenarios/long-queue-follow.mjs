// 長い命令の列（31手・maxCommands 32）を組んで実行しても、最後のチップが見え、追加ボタンと「うごかす」が
// 押し出されず、実行中は今のチップが列の中に追従する。列を指で動かしてもチップは消えない（Issue #393）。
// 360px 縦（360x640）と横（1024x600。既存シナリオがカバーする最小の横向き）の両方で確かめる。

export const name = '長い命令の列: 最後が見え・ボタンが画面内・実行中のチップが列内に追従・スクロールでチップが消えない(Issue #393)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'long-queue-smoke',
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
      grid: { cols: 32, rows: 1 },
      start: { x: 0, y: 0 },
      goal: { x: 31, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: Array(31).fill('right'),
      maxCommands: 32,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const COUNT = 31;
const VIEWPORTS = [
  ['縦360x640', 360, 640],
  ['横1024x600', 1024, 600],
];

// 列（.command-queue）の矩形の中に、data-index=i のチップが全部収まっているか（誤差2px）。
const chipInQueue = (page, index) =>
  page.evaluate((i) => {
    const queue = document.querySelector('.command-queue');
    const chip = queue.querySelector(`.command-chip[data-index="${i}"]`);
    if (!chip) return false;
    const q = queue.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    return c.left >= q.left - 2 && c.right <= q.right + 2 && c.top >= q.top - 2 && c.bottom <= q.bottom + 2;
  }, index);

// 追加ボタン（方向）と「うごかす」が画面の中にあるか。
const buttonsInScreen = (page) =>
  page.evaluate(() =>
    ['[data-command="right"]', '[data-command="left"]', '[data-action="run"]'].every((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5;
    })
  );

const chipCount = (page) => page.evaluate(() => document.querySelectorAll('.command-queue .command-chip').length);
const scrollPos = (page) => page.evaluate(() => {
  const q = document.querySelector('.command-queue');
  return Math.round(q.scrollLeft + q.scrollTop);
});

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);

  for (const [label, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await enterPlay(page, 'long-queue-smoke');

    for (let i = 0; i < COUNT; i += 1) await page.click('[data-command="right"]');
    await check(`${label}: チップが${COUNT}個並ぶ`, () => chipCount(page), COUNT);
    await check(`${label}: 列は横か縦にスクロールできる長さになっている`, () =>
      page.evaluate(() => {
        const q = document.querySelector('.command-queue');
        return q.scrollWidth > q.clientWidth + 1 || q.scrollHeight > q.clientHeight + 1;
      })
    );
    await check(`${label}: 追加後、最後のチップが列の中に見えている`, () => chipInQueue(page, COUNT - 1), true);
    await check(`${label}: 追加ボタンと「うごかす」が画面内にある`, () => buttonsInScreen(page), true);

    // 指でスクロールした相当（scrollLeft/scrollTop を直接動かす）。チップは消えず、ボタンも動かない。
    await page.evaluate(() => {
      const q = document.querySelector('.command-queue');
      q.scrollLeft = 0;
      q.scrollTop = 0;
    });
    await check(`${label}: 先頭へスクロールしても先頭のチップが見える`, () => chipInQueue(page, 0), true);
    await check(`${label}: スクロールしてもチップは${COUNT}個のまま`, () => chipCount(page), COUNT);
    await check(`${label}: スクロール後も追加ボタンと「うごかす」が画面内にある`, () => buttonsInScreen(page), true);

    // 最後までスクロールして、実行前の位置（末尾）を覚える
    await page.evaluate(() => {
      const q = document.querySelector('.command-queue');
      q.scrollLeft = q.scrollWidth;
      q.scrollTop = q.scrollHeight;
    });
    const before = await scrollPos(page);

    await page.click('[data-action="run"]');
    await page.waitForSelector('.command-chip[data-active="true"][data-index="0"]', { timeout: 10000 });
    await check(`${label}: 実行の最初、今のチップ（1つ目）が列の中に見える`, () => chipInQueue(page, 0), true);

    // 中ほど（16個目あたり）まで進むのを待ち、今のチップが列の中にあり、スクロール位置が動いたことを見る
    await page.waitForSelector('.command-chip[data-active="true"][data-index="16"]', { timeout: 30000 });
    await check(`${label}: 実行中、今のチップ（17個目）が列の中に見える`, () => chipInQueue(page, 16), true);
    await check(`${label}: 実行中、列のスクロール位置が末尾から動いている`, async () => (await scrollPos(page)) !== before, true);
    await check(`${label}: 実行中も追加ボタンと「うごかす」が画面内にある`, () => buttonsInScreen(page), true);

    await page.waitForSelector('[data-action="next"], [data-action="next-stage"]', { timeout: 40000 });
    await check(`${label}: 最後まで実行してクリアできる`, () => page.$('[data-action="next"], [data-action="next-stage"]').then(Boolean), true);
    await check(`${label}: 実行後もチップは${COUNT}個のまま`, () => chipCount(page), COUNT);
  }
}
