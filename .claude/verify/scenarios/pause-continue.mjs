// 「とめる」で止まって続ける（Issue #476・親 #395 段3）。maxPauses>0 のインライン盤面で、
// 置く→止まる（境目と薄表示）→残り回数の減少→続きの空き枠から再開、をDOMで判定する。

export const name = '「とめる」を置いて止まり、境目「ここから」・薄表示・残り回数・続きの空き枠を確認(Issue #476)';
import { enterPlay, routeLesson } from '../helpers.mjs';

const LESSON = 'pause-continue-smoke';
const LESSON_DEF = {
  lessonId: LESSON,
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
      grid: { cols: 5, rows: 1 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right'],
      maxCommands: 6,
      maxPauses: 2,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const chipCount = (page, sel) => page.$$eval(sel, (els) => els.length);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, LESSON_DEF);
  await enterPlay(page, LESSON);

  await check('「とめる」ボタンがある', () => chipCount(page, '.palette-row > [data-action="pause"]'), 1);
  await check('残り回数の表示は2', () => page.getAttribute('[data-pause-count]', 'data-pause-left'), '2');
  await check('パレットの全ボタンが64px以上で360pxの幅に収まる', () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.palette-row > button, .palette-row > [data-pause-count]')].every((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height >= 63.5 && r.left >= 0 && r.right <= 360;
      })));

  await page.click('[data-command="right"]');
  await page.click('[data-action="pause"]');
  await check('「とめる」を置くとチップが2つ（みぎ・とめる）', () => chipCount(page, '.command-chip'), 2);
  await check('置いた「とめる」チップの文言', () => page.$eval('.pause-chip', (e) => e.textContent.replace(/\s/g, '')), '✋とめる');
  await check('残り回数が1に減る', () => page.getAttribute('[data-pause-count]', 'data-pause-left'), '1');
  await check('次の枠の番号は2（「とめる」は数えない）', () => page.getAttribute('[data-tray-slot]', 'data-order'), '2');

  await page.click('[data-action="run"]');
  // 止まらないときは原因を見えるよう、待ちが切れたら状態を actual に出して落とす。
  const stopped = await page.waitForSelector('.pause-mark', { timeout: 15000 }).then(() => true, () => false);
  if (!stopped) {
    await check('止まるまで待つ（診断：盤面と列の状態）', () =>
      page.evaluate(() => JSON.stringify({
        run: document.querySelector('[data-action="run"]')?.outerHTML.slice(0, 160),
        queue: document.querySelector('.command-chip')?.parentElement?.innerHTML.slice(0, 400),
        status: document.body.innerText.slice(0, 200),
      })), 'stopped');
    return;
  }
  await check('止まると境目「ここから」が出る', () => page.$eval('.pause-mark', (e) => e.textContent.replace(/\s/g, '')), '✋ここから');
  await check('止まった前の列は薄く表示される', () => page.getAttribute('.command-chip[data-index="0"]', 'data-locked'), 'true');
  await check('止まった後は前の列に×が無い', () => chipCount(page, '.command-remove'), 0);
  await check('後ろの空き枠（番号2）がある', () => page.getAttribute('[data-tray-slot]', 'data-order'), '2');
  await page.click('.command-chip[data-index="0"]');
  await check('前の列のタップは無反応', () => chipCount(page, '.command-chip'), 1);
  await check('止まった後もパレットは使える（うえ）', () => page.$eval('[data-command="up"]', (b) => !b.disabled));

  await page.click('[data-action="pause"]');
  await check('残り回数が0になる', () => page.getAttribute('[data-pause-count]', 'data-pause-left'), '0');
  await check('残り0なら「とめる」は無効', () => page.$eval('[data-action="pause"]', (b) => b.disabled));
  await page.click('[data-remove-index="2"]');
  await check('置いた後ろの「とめる」は取り消せて回数が戻る', () => page.getAttribute('[data-pause-count]', 'data-pause-left'), '1');

  await page.click('[data-command="right"]');
  await check('続きは境目の後ろに追加される（chip index 2・ロックなし）', () =>
    page.evaluate(() => {
      const c = document.querySelector('.command-chip[data-index="2"]');
      return Boolean(c) && c.dataset.locked !== 'true' && c.dataset.order === '2';
    }));
}
