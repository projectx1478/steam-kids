export const name = 'cmd-07: 条件カード（もし）の操作・目の行の切替・下書き復元・飛ばし表示・3面クリア(Issue #291)';

import { enterPlay, clickRetryKeep } from '../helpers.mjs';

const chips = (page) => page.$$eval('.command-chip', (els) => els.length);
const innerCount = (page) => page.$$eval('.command-chip[data-cond] [data-inner]', (e) => e.length);
const DIRS = ['right', 'down', 'left', 'up'];

// もし → 目の行を回して向きを合わせる → 中身を入れる → とじる
async function placeCond(page, dir, then) {
  await page.click('[data-action="cond-open"]');
  for (let t = 0; t < DIRS.indexOf(dir); t += 1) await page.locator('.command-chip[data-open] [data-cond-eye]').click();
  for (const d of then) await page.click(`[data-command="${d}"]`);
  await page.click('[data-action="box-close"]');
}

async function place(page, list) {
  for (const c of list) {
    if (typeof c === 'string') await page.click(`[data-command="${c}"]`);
    else await placeCond(page, c.if, c.then);
  }
}

async function solveStage(page, solution) {
  await place(page, solution);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"], [data-action="next-stage"], [data-action="retry"]', { timeout: 20000 });
  const cleared = (await page.$('[data-action="retry"]')) === null;
  if (cleared) await page.click('[data-action="next"], [data-action="next-stage"]');
  return cleared;
}

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-07-moshi');
  const lesson = await page.evaluate(() => fetch('./lessons/cmd-07-moshi.json').then((r) => r.json()));
  const plays = lesson.steps.filter((s) => s.kind === 'play');
  const p1 = plays[0].solution;

  await check('パレットに「もし」ボタンがある', async () => (await page.$('[data-action="cond-open"]')) !== null, true);
  await check('カードを開く前は回数ボタン・とじるが無い', async () => [await page.$('[data-action="box-times"]'), await page.$('[data-action="box-close"]')], [null, null]);

  await page.click('[data-action="cond-open"]');
  await check('もし→空のカードが1チップ（開いている）', async () => page.$eval('.command-chip', (e) => [e.dataset.cond, e.dataset.open, e.dataset.condDir]), ['true', 'true', 'right']);
  await check('開いている間は操作行にけす・とじるだけ（じっこう・1コマ・ぜんぶけすが無い）', async () => [
    (await page.$('[data-action="remove-last"]')) !== null,
    (await page.$('[data-action="box-close"]')) !== null,
    (await page.$('[data-action="run"]')) === null,
    (await page.$('[data-action="step"]')) === null,
    (await page.$('[data-action="clear-all"]')) === null,
    (await page.$('[data-action="box-times"]')) === null,
  ], [true, true, true, true, true, true]);
  for (const d of ['up', 'right', 'right']) await page.click(`[data-command="${d}"]`);
  await check('方向タップで中身が3つ入る（チップは1個）', async () => [await chips(page), await innerCount(page)], [1, 3]);
  await page.click('[data-command="left"]');
  await check('4つ目は入らない', () => innerCount(page), 3);
  await page.click('[data-action="remove-last"]');
  await check('けすで中身が1つ減る', () => innerCount(page), 2);
  await page.click('[data-command="right"]');
  await page.keyboard.press('ArrowRight');
  await check('矢印キーでも開いたカードの中へ入るが3つまで', () => innerCount(page), 3);
  await page.keyboard.press('Enter');
  await check('Enterは何も起きない（カードは開いたまま）', () => page.$eval('.command-chip', (e) => e.dataset.open), 'true');

  const dirs = [];
  for (let i = 0; i < 4; i += 1) {
    await page.locator('[data-cond-eye]').first().click();
    dirs.push(await page.$eval('.command-chip', (e) => e.dataset.condDir));
  }
  await check('目の行のタップで向きが down→left→up→right と回る', async () => dirs, ['down', 'left', 'up', 'right']);
  await check('目の行のタップでカードは消えない', () => chips(page), 1);

  await page.click('[data-action="box-close"]');
  await check('とじるとカードが閉じる（中身は残る）', async () => [await page.$eval('.command-chip', (e) => e.dataset.open ?? null), await innerCount(page)], [null, 3]);
  await page.click('[data-action="remove-last"]');
  await check('閉じたカードは１つけすで丸ごと消える', () => chips(page), 0);

  await page.click('[data-action="cond-open"]');
  await page.click('[data-action="remove-last"]');
  await check('空のカードを開いた状態で１つけすするとカードが消える', () => chips(page), 0);

  // 解の列を並べて再読込：{if,then} を含む列が復元され、全カードが閉じている
  await place(page, p1);
  await page.waitForTimeout(200);
  await enterPlay(page, 'cmd-07-moshi');
  await check('再読込で{if,then}を含む命令列が復元される', () => chips(page), p1.length);
  await check('復元されたカードはすべて閉じている', async () => page.$$eval('.command-chip[data-cond][data-open]', (e) => e.length), 0);
  await check('復元されたカードの向きと中身が保たれる', async () => page.$$eval('.command-chip[data-cond]', (els) => els.map((e) => [e.dataset.condDir, e.querySelectorAll('[data-inner]').length])), [['right', 3], ['right', 3]]);

  // 誤配置：みぎ・もし(うえ){みぎ,みぎ}・みぎ → 偽のカードが飛ばされ、壁に当たって失敗
  await page.click('[data-action="clear-all"]');
  await place(page, ['right', { if: 'up', then: ['right', 'right'] }, 'right']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await check('偽のカードだけが灰色になり「かべ なし」と出る', async () => page.$$eval('.command-chip[data-skipped="true"]', (els) => els.map((e) => [e.dataset.index, e.textContent.includes('かべ なし')])), [['1', true]]);
  await check('クリアしない（ためしなおすが出る）', async () => (await page.$('[data-action="next-stage"]')) === null, true);
  await clickRetryKeep(page);
  await check('ためしなおすで灰色が消え列は残る', async () => [await page.$$eval('.command-chip[data-skipped]', (e) => e.length), await chips(page)], [0, 3]);
  await check('360x640で横スクロールが出ない', async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

  // 3面を solution でクリア
  await page.click('[data-action="clear-all"]');
  for (const play of plays) {
    await check(`${play.stepId}を条件カードの解でクリア`, () => solveStage(page, play.solution), true);
  }
  await check('3面クリアでまとめへ', () => page.getAttribute('#stage', 'data-step'), 'summary');
}
