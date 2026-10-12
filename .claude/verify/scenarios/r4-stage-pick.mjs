// クリア済みレッスンのステージ番号選び（Issue #399）：クリア済みかつステージ数3以上のintroに1〜Nの丸が並び、
// 押すとそのステージから始まる。未クリア・ステージ数2以下では丸なし。番号選択では再開点もクリア記録も触らない。
// 360×640と1024×600で横スクロールなし・丸は64px以上・4列。外部APIなし。
import { routeLesson, enterPlay, clearStage } from '../helpers.mjs';

export const name = 'R4 ステージ番号選び: クリア済みで丸・選んだ段から開始・未クリアと2ステージ以下は丸なし・再開点不変(Issue #399)';

const stage = (stepId) => ({
  stepId,
  kind: 'play',
  text: 'ゴールへ いこう',
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 0 },
  walls: [],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['right', 'right'],
  maxCommands: 4,
});
const makeLesson = (lessonId, count) => ({
  lessonId,
  unitId: lessonId,
  title: lessonId,
  type: 'grid-runtime',
  estimatedMinutes: 3,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'えらぶ テスト' },
    ...Array.from({ length: count }, (_, i) => stage(`p${i + 1}`)),
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
});
const SOL = ['right', 'right'];
const RESUME_KEY = 'steamkids.resume.r4-pick8';

const openIntro = async (page, lessonId) => {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.waitForSelector('#stage[data-step="intro"]');
};
const pickCount = async (page) => (await page.$$('[data-stage-no]')).length;
const readStepId = (page) => page.getAttribute('#stage', 'data-step-id');
const readResume = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), RESUME_KEY);
const countEvents = (page, type) =>
  page.evaluate((t) => JSON.parse(localStorage.getItem('steamkids.events') ?? '[]').filter((e) => e.type === t).length, type);

async function clearAll(page, lessonId, count) {
  await enterPlay(page, lessonId);
  for (let i = 0; i < count; i += 1) await clearStage(page, SOL);
  await page.waitForSelector('#stage[data-step="summary"]');
}

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  const l8 = makeLesson('r4-pick8', 8);
  const l3 = makeLesson('r4-pick3', 3);
  const l2 = makeLesson('r4-pick2', 2);
  for (const l of [l8, l3, l2]) await routeLesson(page, l);

  // --- 未クリア：丸なし（従来どおり） ---
  await openIntro(page, l8.lessonId);
  await check('未クリアのintroには丸が出ない', () => pickCount(page), 0);
  await check('未クリアの主ボタンは「はじめる」', () => page.textContent('[data-action="start"]'), 'はじめる');

  // --- クリア済み(8ステージ)：丸が1〜8で並ぶ ---
  await clearAll(page, l8.lessonId, 8);
  await openIntro(page, l8.lessonId);
  await check('クリア済みのintroに丸が8個', () => pickCount(page), 8);
  await check('丸の文字は1〜8', () => page.$$eval('[data-stage-no]', (els) => els.map((e) => e.textContent).join('')), '12345678');
  await check('丸に★・手数・時間・クリア印の子要素が付かない', () =>
    page.$$eval('[data-stage-no]', (els) => els.every((e) => e.children.length === 0 && /^[1-8]$/.test(e.textContent))), true);
  await check('「はじめる」も残る', () => page.textContent('[data-action="start"]'), 'はじめる');

  for (const [w, h] of [[360, 640], [1024, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await openIntro(page, l8.lessonId);
    await check(`${w}x${h}: 横スクロールなし`, () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await check(`${w}x${h}: 丸は全て64px以上`, () =>
      page.$$eval('[data-stage-no]', (els) =>
        els.every((e) => {
          const r = e.getBoundingClientRect();
          return r.width >= 63.5 && r.height >= 63.5;
        })), true);
    await check(`${w}x${h}: 4列×2段`, () =>
      page.$$eval('[data-stage-no]', (els) => {
        const tops = new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)));
        const lefts = new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)));
        return `${lefts.size}x${tops.size}`;
      }), '4x2');
    await check(`${w}x${h}: 丸が画面の横にはみ出さない`, () =>
      page.$$eval('[data-stage-no]', (els) =>
        els.every((e) => {
          const r = e.getBoundingClientRect();
          return r.left >= 0 && r.right <= document.documentElement.clientWidth;
        })), true);
  }
  await page.setViewportSize({ width: 360, height: 640 });

  // --- 番号を選ぶと、そのステージから始まる。再開点・クリア記録は触らない ---
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'p2', ts: 1 })), RESUME_KEY);
  await openIntro(page, l8.lessonId);
  const clearsBefore = await countEvents(page, 'clear');
  await page.click('[data-stage-no="5"]');
  await page.waitForSelector('#stage[data-step="play"]');
  await check('5を押すとp5から始まる', () => readStepId(page), 'p5');
  await clearStage(page, SOL);
  await check('p5クリア後はp6へ進む', () => readStepId(page), 'p6');
  await check('番号選択後のstage_clearで再開点が書き換わらない', () => readResume(page), { stepId: 'p2', ts: 1 });
  await check('先のクリア記録（clear）が消えない', () => countEvents(page, 'clear'), clearsBefore);
  await openIntro(page, l8.lessonId);
  await check('選び直した後もintroに丸が8個', () => pickCount(page), 8);
  await check('クリア済みなので「つづきから」は出ない', async () => (await page.$$('[data-action="resume"]')).length, 0);

  // --- 「はじめる」からの通常進行は番号選択の影響を受けない ---
  await page.click('[data-stage-no="2"]');
  await page.waitForSelector('#stage[data-step="play"]');
  await check('2を押すとp2から始まる', () => readStepId(page), 'p2');

  // --- ステージ数3：丸が3個 ---
  await clearAll(page, l3.lessonId, 3);
  await openIntro(page, l3.lessonId);
  await check('3ステージのクリア済みでは丸が3個', () => pickCount(page), 3);

  // --- ステージ数2：クリア済みでも丸なし ---
  await openIntro(page, l2.lessonId);
  await check('2ステージの未クリアでは丸なし', () => pickCount(page), 0);
  await clearAll(page, l2.lessonId, 2);
  await openIntro(page, l2.lessonId);
  await check('2ステージのクリア済みでも丸なし', () => pickCount(page), 0);
  await check('2ステージの主ボタンは「はじめる」', () => page.textContent('[data-action="start"]'), 'はじめる');
}
