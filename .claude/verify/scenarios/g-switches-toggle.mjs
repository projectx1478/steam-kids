// switches mode:"toggle"：踏むたびに奇偶で壁が入れ替わる・レバーの向き・沈んだ壁の点線の輪郭・reduced-motion・連続で踏んでもアニメが重ならない(Issue #388)。実レッスンに依存しない。DOM判定のみ。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'switches toggle: 奇数回で壁が沈み偶数回で立つ・レバーの向き・点線の輪郭・reduced-motion即時・連続タップでアニメが重ならない(Issue #388)';

// スイッチ(1,1)を踏むたびに壁(3,1)が入れ替わる。左へ行ってアイテム(0,1)を取り、戻ってもう1回踏む。
const play = {
  stepId: 'p1',
  kind: 'play',
  text: 'もういちど ふむと どうなる？',
  grid: { cols: 5, rows: 3 },
  start: { x: 2, y: 1 },
  goal: { x: 4, y: 1 },
  walls: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
  items: [{ x: 0, y: 1 }],
  switches: [{ x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] }],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['left', 'left', 'right', 'right', 'left', 'right', 'right', 'right'],
  maxCommands: 10,
};
const lesson = {
  lessonId: 'g-switches-toggle',
  unitId: 'g-switches',
  title: 'switches toggle',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [{ stepId: 's1', kind: 'intro', text: 'スイッチ' }, play, { stepId: 's2', kind: 'summary', text: 'おわり' }],
};

const WALL = '.grid-cell[data-x="3"][data-y="1"]';
const SW = '.grid-cell[data-x="1"][data-y="1"]';
const wallState = (page) => page.$eval(WALL, (c) => c.dataset.switchWall);
const pressed = (page) => page.$eval(SW, (c) => c.dataset.switchPressed);
// レバーの向き：棒の先のx。左（偶数回・初期）＝32、右（奇数回）＝45。
const leverX = (page) => page.$eval(`${SW} .grid-switch-svg line`, (l) => l.getAttribute('x2'));
const outline = (page) =>
  page.$eval(WALL, (c) => {
    const o = c.querySelector('.grid-switch-wall-outline');
    return o ? [o.getAttribute('stroke'), o.getAttribute('stroke-opacity'), o.getAttribute('stroke-width'), o.getAttribute('stroke-dasharray')].join() : 'none';
  });
const OUTLINE = '#7c6338,0.6,2.6,5 4.5';

// 実アプリのDOMを使い、switches.onStepを同期で連続して呼ぶ（run.pressedは呼び出し側が持つ）。
const stepN = (page, n) =>
  page.evaluate(async ({ n, play }) => {
    const { switches } = await import('/js/gimmicks/switches.js');
    const at = (sel) => document.querySelector(sel);
    const view = { gimmickEls: { switches: { switchCells: new Map([['1,1', at('.grid-cell[data-x="1"][data-y="1"]')]]), wallCells: new Map([['3,1', at('.grid-cell[data-x="3"][data-y="1"]')]]) } } };
    window.__toggleRun ??= {};
    for (let k = 0; k < n; k += 1) switches.onStep({ pos: { x: 1, y: 1 }, spec: play, view, run: window.__toggleRun });
  }, { n, play });
const wallInfo = (page) =>
  page.$eval(WALL, (c) => ({
    svgs: c.querySelectorAll('.grid-switch-wall-svg').length,
    top: c.querySelectorAll('.grid-switch-wall-top').length,
    running: c.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    all: c.getAnimations({ subtree: true }).length,
  }));

export default async function run({ page, check }) {
  await routeLesson(page, lesson);
  await enterPlay(page, lesson.lessonId);

  // ① 初期（偶数回＝0回）：壁が立つ・レバーは左・点線なし
  await check('初期：壁が立つ(on)・スイッチ未押下・レバー左・点線なし', async () => [await wallState(page), await pressed(page), await leverX(page), await outline(page)].join('/'), 'on/false/32/none');

  // ② 1回踏む（奇数回）：壁が沈み、レバーが右、沈んだ壁に点線の輪郭
  await page.click('[data-command="left"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await page.waitForSelector(`${WALL} .grid-switch-wall-outline`, { timeout: 4000 });
  await check('1回踏む(奇数)：壁が沈む(off)・スイッチ押下・レバー右', async () => [await wallState(page), await pressed(page), await leverX(page)].join('/'), 'off/true/45');
  await check('沈んだ壁に点線の輪郭（色・不透明度・線幅・破線）', () => outline(page), OUTLINE);

  // ③ 2回踏む（偶数回）：壁が戻り、レバーが左、点線は消える
  await clickRetry(page);
  await check('retryで初期（壁が立つ・レバー左）に戻る', async () => [await wallState(page), await leverX(page)].join('/'), 'on/32');
  for (const c of ['left', 'left', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAnimations({ subtree: true }).length === 0, WALL, { timeout: 4000 });
  await check('2回踏む(偶数)：壁が立つ(on)・スイッチ未押下・レバー左・点線なし', async () => [await wallState(page), await pressed(page), await leverX(page), await outline(page)].join('/'), 'on/false/32/none');

  // ④ 3回踏んでゴール（奥で踏んで戻る）
  await clickRetry(page);
  for (const c of ['left', 'left', 'right', 'right', 'left', 'right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 20000 });
  await check('3回踏む(奇数)：壁が沈んでゴールできる(off・レバー右)', async () => [await wallState(page), await leverX(page)].join('/'), 'off/45');

  // ⑤ 連続で踏む（滑走・連続タップ相当）：前のアニメを最終状態に揃えてから次を始める＝アニメが重ならない
  await enterPlay(page, lesson.lessonId);
  await stepN(page, 1);
  await check('連続1回目：沈むアニメ中（動作中3本・壁のSVGは1つ）', async () => JSON.stringify(await wallInfo(page)), JSON.stringify({ svgs: 1, top: 1, running: 3, all: 3 }));
  await stepN(page, 1);
  await check('連続2回目（0.5秒以内）：沈むアニメは終わり、立ち上がるアニメだけ動作中(3本・壁のSVGは1つ)', async () => JSON.stringify(await wallInfo(page)) + '/' + (await wallState(page)) + '/' + (await leverX(page)), JSON.stringify({ svgs: 1, top: 1, running: 3, all: 3 }) + '/on/32');
  await stepN(page, 1);
  await check('連続3回目：また沈むアニメだけ(3本・壁のSVGは1つ)', async () => JSON.stringify(await wallInfo(page)) + '/' + (await wallState(page)) + '/' + (await leverX(page)), JSON.stringify({ svgs: 1, top: 1, running: 3, all: 3 }) + '/off/45');
  await page.waitForSelector(`${WALL} .grid-switch-wall-outline`, { timeout: 4000 });
  await check('アニメ終了後：1つの沈んだ壁（上面なし・点線あり・アニメ無し）', async () => JSON.stringify(await wallInfo(page)) + '/' + (await outline(page)), JSON.stringify({ svgs: 1, top: 0, running: 0, all: 0 }) + '/' + OUTLINE);

  // ⑥ prefers-reduced-motion：踏むと即時に差し替わる（アニメ無し）
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, lesson.lessonId);
  await stepN(page, 1);
  await check('reduced-motion：沈んだ壁へ即時（アニメ0・上面なし・点線あり）', async () => JSON.stringify(await wallInfo(page)) + '/' + (await outline(page)), JSON.stringify({ svgs: 1, top: 0, running: 0, all: 0 }) + '/' + OUTLINE);
  await stepN(page, 1);
  await check('reduced-motion：立つ壁へ即時（アニメ0・上面あり・点線なし）', async () => JSON.stringify(await wallInfo(page)) + '/' + (await outline(page)), JSON.stringify({ svgs: 1, top: 1, running: 0, all: 0 }) + '/none');
}
