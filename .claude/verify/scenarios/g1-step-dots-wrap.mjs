// 進捗ドットの折返し（Issue #320）：クリア済みで描画ノード7以上のレッスンは、360pxでも横にはみ出さず、
// 2行に折り返す（play最小48px・ノード間8px以上・線なし）。7未満では折返さない。外部APIなし。
import { routeLesson, clearLesson } from '../helpers.mjs';

export const name = 'G1 進捗ドット折返し: 11ステップ・クリア済みで360pxに収まる・play48px以上・間隔8px以上・7未満はnowrap(Issue #320)';

const stage = (stepId) => ({
  stepId,
  kind: 'play',
  text: 'ゴールへ いこう',
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 0 },
  goal: { x: 1, y: 0 },
  walls: [],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['right'],
  maxCommands: 4,
});
const base = { unitId: 'g1-wrap', title: 'wrap', type: 'grid-runtime', estimatedMinutes: 3 };
const longLesson = {
  ...base,
  lessonId: 'g1-wrap-long',
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ながい テスト' },
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map(stage),
    { stepId: 's2', kind: 'summary', text: 'おわり' },
    { stepId: 's3', kind: 'summary', text: 'おわり2' },
  ],
};
const shortLesson = {
  ...base,
  lessonId: 'g1-wrap-short',
  steps: [{ stepId: 's1', kind: 'intro', text: 'みじかい テスト' }, stage('p1'), stage('p2'), { stepId: 's2', kind: 'summary', text: 'おわり' }],
};

const openIntro = async (page, lessonId) => {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.waitForSelector('#stage[data-step="intro"]');
};

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, longLesson);
  await routeLesson(page, shortLesson);

  // --- 7ノード未満（クリア済み）：折返さない ---
  await clearLesson(page, shortLesson.lessonId);
  await openIntro(page, shortLesson.lessonId);
  await check('7ノード未満（クリア済み）は.step-roadmapがnowrap', () =>
    page.$eval('.step-roadmap', (el) => getComputedStyle(el).flexWrap), 'nowrap');

  // --- 11ステップ（play8個）・クリア済み：2行に折返し360pxに収まる ---
  await clearLesson(page, longLesson.lessonId);
  await openIntro(page, longLesson.lessonId);
  await check('.step-dotが11個', async () => (await page.$$('.step-dot')).length, 11);
  await check('.step-roadmapが折り返す（flex-wrap）', () =>
    page.$eval('.step-roadmap', (el) => getComputedStyle(el).flexWrap), 'wrap');
  await check('接続線は出ない', async () => (await page.$$('.step-roadmap-line')).length, 0);
  await check('.step-roadmapが横にはみ出さない（scrollWidth<=clientWidth）', () =>
    page.$eval('.step-roadmap', (el) => el.scrollWidth <= el.clientWidth), true);
  await check('全.step-dotが画面幅0〜360に収まる', () =>
    page.$$eval('.step-dot', (els) =>
      els.every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= 360;
      })), true);
  await check('ページが横スクロールしない（documentElement.scrollWidth<=360）', () =>
    page.evaluate(() => document.documentElement.scrollWidth <= 360), true);
  await check('クリア済みplayノード8個が全てボタン', async () => (await page.$$('button.step-dot')).length, 8);
  await check('クリア済みplayの最小辺が48px以上', () =>
    page.$$eval('button.step-dot', (els) =>
      els.every((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) >= 48 - 0.5;
      })), true);
  await check('2行に折り返している（行数2以上）', () =>
    page.$$eval('.step-dot', (els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size >= 2), true);
  await check('同じ行で隣り合うノードの間隔が8px以上', () =>
    page.$$eval('.step-dot', (els) => {
      const rects = els.map((el) => el.getBoundingClientRect());
      const rows = [];
      for (const r of rects) {
        const row = rows.find((g) => Math.abs(g[0].top + g[0].height / 2 - (r.top + r.height / 2)) < 4);
        if (row) row.push(r);
        else rows.push([r]);
      }
      return rows.every((row) => {
        const s = [...row].sort((a, b) => a.left - b.left);
        return s.slice(1).every((r, i) => r.left - s[i].right >= 8 - 0.5);
      });
    }), true);
}
