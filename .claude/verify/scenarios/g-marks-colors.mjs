// スイッチ・壁／鍵・扉の「同じ色＋形」の印(Issue #387)。実レッスンに依存しない。DOM判定のみ。
import { routeLesson, enterPlay } from '../helpers.mjs';

export const name = 'marks: スイッチ・壁・鍵・扉の色と形の対応・AND壁の印2つ・氷上スイッチの前面・reduced-motionの即時差し替え・印の大きさ(Issue #387)';

// スイッチ0(1,1)・1(2,1)はcolor省略(添字順 red,blue)で同じ壁(3,1)を対象にする(AND)。スイッチ2(4,1)は氷の上で明示blue。
const lesson = {
  lessonId: 'g-marks-colors',
  unitId: 'g-marks',
  title: 'marks',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'しるし' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'しるしは おなじ？',
      grid: { cols: 6, rows: 3 },
      start: { x: 0, y: 1 },
      goal: { x: 5, y: 1 },
      ice: [{ x: 4, y: 1 }],
      switches: [
        { x: 1, y: 1, targets: [{ x: 3, y: 1 }] },
        { x: 2, y: 1, targets: [{ x: 3, y: 1 }] },
        { x: 4, y: 1, color: 'blue', targets: [{ x: 4, y: 2 }] },
      ],
      keys: [{ x: 0, y: 0, color: 'red' }, { x: 1, y: 0, color: 'blue' }],
      doors: [{ x: 2, y: 0, color: 'red' }, { x: 3, y: 0, color: 'blue' }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};

const SW = '.grid-cell[data-switch]';
const swInfo = (page) =>
  page.$$eval(SW, (cs) => cs.map((c) => `${c.dataset.switch}:${c.dataset.color}:${c.dataset.mark}`));
const wallInfo = (page) =>
  page.$$eval('.grid-cell[data-switch-wall]', (cs) => cs.map((c) => `${c.dataset.x},${c.dataset.y}:${c.dataset.color}:${c.dataset.mark}`));
const keyInfo = (page) => page.$$eval('.grid-cell[data-key]', (cs) => cs.map((c) => `${c.dataset.x},${c.dataset.y}:${c.dataset.color}:${c.dataset.mark}`));
const doorInfo = (page) => page.$$eval('.grid-cell[data-door]', (cs) => cs.map((c) => `${c.dataset.x},${c.dataset.y}:${c.dataset.color}:${c.hasAttribute('data-mark')}`));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, lesson.lessonId);

  // ① 色と形の対応（color省略は添字順 red,blue。明示colorはそのまま）
  await check('スイッチ：省略=添字順 red,blue／明示blue', () => swInfo(page), ['0:red:circle', '1:blue:triangle', '2:blue:triangle']);
  await check('壁：AND壁は先頭スイッチ(red)／単独壁はスイッチ2(blue)の色と形', () => wallInfo(page), ['3,1:red:circle', '4,2:blue:triangle']);
  await check('鍵：色と形', () => keyInfo(page), ['0,0:red:circle', '1,0:blue:triangle']);
  // ② 扉は色のみ（data-markなし）。鍵と同じ色
  await check('扉：data-colorは鍵と同じで、data-markは無い', () => doorInfo(page), ['2,0:red:false', '3,0:blue:false']);

  // ③ AND壁の印は2つ（スイッチの添字順）
  await check('AND壁の印要素が2つ', () => page.$$eval('.grid-cell[data-x="3"][data-y="1"] .grid-switch-wall-mark', (g) => g.length), 2);
  await check('AND壁の印は red,blue の順', () => page.$$eval('.grid-cell[data-x="3"][data-y="1"] .grid-switch-wall-mark', (g) => g.map((e) => `${e.dataset.color}:${e.dataset.mark}`)), ['red:circle', 'blue:triangle']);
  await check('単独壁の印要素は1つ', () => page.$$eval('.grid-cell[data-x="4"][data-y="2"] .grid-switch-wall-mark', (g) => g.length), 1);

  // ④ 氷のマスのスイッチSVGは氷SVGより後ろ(前面)
  await check('氷のマスのスイッチは氷より前面', () =>
    page.$eval('.grid-cell[data-x="4"][data-y="1"]', (c) => {
      const ice = c.querySelector('.grid-ice-svg');
      const sw = c.querySelector('.grid-switch-svg');
      return Boolean(ice && sw && ice.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true);

  // ⑥ 印の幅／マス幅(boundingBox計測)。値を出力し、下限(スイッチ0.30・壁1個0.25・AND2個0.20)で判定する。
  const ratios = await page.evaluate(() => {
    const w = (el) => el.getBoundingClientRect().width;
    const sw = [...document.querySelectorAll('.grid-cell[data-switch]')].map((c) => w(c.querySelector('.grid-switch-svg').lastElementChild) / w(c));
    const single = [...document.querySelectorAll('.grid-cell[data-x="4"][data-y="2"] .grid-switch-wall-mark')].map((g) => w(g) / w(g.closest('.grid-cell')));
    const and = [...document.querySelectorAll('.grid-cell[data-x="3"][data-y="1"] .grid-switch-wall-mark')].map((g) => w(g) / w(g.closest('.grid-cell')));
    return { sw, single, and, cell: w(document.querySelector('.grid-cell')) };
  });
  console.log(`[g-marks-colors] マス幅=${ratios.cell.toFixed(1)}px 印/マス幅 スイッチ=${ratios.sw.map((r) => r.toFixed(3))} 壁1個=${ratios.single.map((r) => r.toFixed(3))} AND2個=${ratios.and.map((r) => r.toFixed(3))}`);
  await check('マス幅が50px以上', () => ratios.cell >= 50, true);
  await check('スイッチの印/マス幅 >= 0.30', () => ratios.sw.length === 3 && ratios.sw.every((r) => r >= 0.3), true);
  await check('壁1個の印/マス幅 >= 0.25', () => ratios.single.length === 1 && ratios.single.every((r) => r >= 0.25), true);
  await check('AND壁2個の印/マス幅 >= 0.20', () => ratios.and.length === 2 && ratios.and.every((r) => r >= 0.2), true);

  // ⑤ prefers-reduced-motion: reduce では、壁を踏むとアニメーション無しで即座に床の表示へ差し替わる
  for (const c of ['right', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('.grid-cell[data-x="3"][data-y="1"][data-switch-wall="off"]', { timeout: 8000 });
  await check('reduced-motion：AND壁は即時に床の表示(アニメ無し・印無し)', () =>
    page.$eval('.grid-cell[data-x="3"][data-y="1"]', (c) => {
      const svg = c.querySelector('.grid-switch-wall-svg');
      return [c.dataset.switchWall, svg.querySelector('rect').getAttribute('fill'), svg.getAnimations({ subtree: true }).length, svg.querySelectorAll('.grid-switch-wall-mark').length].join();
    }), 'off,#d6c4a5,0,0');
}
