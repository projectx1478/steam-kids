// teko-07-ukabu（predict-slider の buoyancy。うかぶ面。開発者画面から入る。Issue #288・#670・#710）：
// 8面を面ごとの手順で通す。数字なし・点は1〜4面だけ・道具ボタンの付け外し・浮く/沈むヒント・失敗の高さの点線・360px幅で横にはみ出さない。
import { enterPlay } from '../helpers.mjs';

export const name = 'teko-07-flow: teko-07を開発者画面から入り、8面・道具ボタン・点線・点(1〜4面)・360px幅(Issue #288/#670/#710)';

// 8面の解（道具 id）。8面は段2で置き換わるまでの暫定の値。
const SOLUTIONS = [['w2'], ['w1', 'w3'], ['b1'], ['w1', 'w3'], ['w3', 'b1'], ['w1', 'w2'], ['w2', 'b3'], ['w1', 'w3']];
const SECOND_P8 = ['w2', 'w3', 'b1'];

const tool = (id) => `[data-action="tool-${id}"]`;

async function tap(page, ids) {
  for (const id of ids) await page.click(tool(id));
}

async function noOverflow(page, label, check) {
  await page.setViewportSize({ width: 360, height: 640 });
  const o = await page.evaluate(() => {
    const e = document.documentElement;
    return e.scrollWidth <= e.clientWidth;
  });
  await check(`${label}：360px幅で横にはみ出さない`, () => o, true);
  await page.setViewportSize({ width: 1024, height: 640 });
}

const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const toolsOn = (page) => page.evaluate(() => document.querySelector('[data-robot]').dataset.tools);

// 道具を付けて「ためす」→ 失敗 → ヒント確認 → ためしなおす（道具は付いたまま）
async function failOnce(page, check, label, ids, word) {
  await tap(page, ids);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-hint="buoyancy"]', { timeout: 10000 });
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check(`${label}：ヒントに「${word}」`, async () => (await page.textContent('[data-hint="buoyancy"]')).includes(word), true);
  await page.click('[data-action="retry"]');
  await page.waitForSelector('[data-action="run"]');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?view=map&dev=1');
  await check('dev：teko-07が並ぶ', async () => (await page.$$('[data-lesson-id="teko-07-ukabu"]')).length, 1);

  await enterPlay(page, 'teko-07-ukabu');
  await page.waitForSelector(tool('w1'));

  // 1面：道具2個・点あり・数字なし・水そうに段目盛13本
  await check('p1：道具ボタンは2個', async () => await count(page, '[data-action^="tool-"]'), 2);
  await check('p1：点（data-dots）がある', async () => (await count(page, '[data-dots]')) > 0, true);
  await check('p1：盤と道具に数字が無い', async () => await page.evaluate(() => !/[0-9０-９]/.test(document.querySelector('[data-tank]').textContent + document.querySelector('[data-action="tool-w1"]').textContent)), true);
  await check('p1：段目盛が13本（±6段）', async () => await count(page, '[data-tick]'), 13);
  await check('p1：始めは点線なし', async () => await count(page, '[data-fail-line]'), 0);
  await noOverflow(page, 'p1', check);

  // 付け外し：押すと付く、もう一度で外れる
  await page.click(tool('w1'));
  await check('p1：w1を押すと付く', async () => await toolsOn(page), 'w1');
  await page.click(tool('w1'));
  await check('p1：もう一度で外れる', async () => await toolsOn(page), '');

  // 浮く失敗（w1 → net1）→ 線1本。沈む失敗（w1+w2 → net-1）→ 線2本。w1を外してクリア
  await failOnce(page, check, 'p1：浮く', ['w1'], 'うかんだ');
  await check('p1：失敗で点線が1本', async () => await count(page, '[data-fail-line]'), 1);
  await failOnce(page, check, 'p1：沈む', ['w2'], 'しずんだ');
  await check('p1：別の高さの失敗で点線が2本', async () => await count(page, '[data-fail-line]'), 2);
  await page.click(tool('w1'));
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');

  // 2〜8面：決めた解で順に通す
  for (let i = 1; i < SOLUTIONS.length; i += 1) {
    const label = `p${i + 1}`;
    await page.waitForSelector('[data-action^="tool-"]');
    const stageDots = (await count(page, '[data-dots]')) > 0;
    await check(`${label}：点は4面まで`, () => stageDots, i < 4);
    if (i === 4) await check('p5：道具ボタンは4個', async () => await count(page, '[data-action^="tool-"]'), 4);
    if (i === 3 || i === 7) await noOverflow(page, label, check);
    await tap(page, SOLUTIONS[i]);
    await page.click('[data-action="run"]');
    if (i === 7) {
      // 8面（find:2）：1つ目のぴたりで道具が全部外れ、別の組でクリア
      await page.waitForFunction(() => document.querySelector('[data-hint="buoyancy"]')?.textContent.includes('べつの くみあわせも あるよ'), null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-action^="tool-"][aria-pressed="true"]').length === 0, null, { timeout: 10000 });
      await check('p8：1つ目のぴたりの後はクリアにならず編集に戻る', async () => (await page.$$('[data-action="next-stage"]')).length, 0);
      await tap(page, SECOND_P8);
      await page.click('[data-action="run"]');
    }
    const last =i === SOLUTIONS.length - 1;
    await page.waitForSelector(`[data-action="${last ? 'next' : 'next-stage'}"]`, { timeout: 10000 });
    if (!last) await page.click('[data-action="next-stage"]');
  }
  await check('p8：クリアで「つぎへ」が出る', async () => (await page.$$('[data-action="next"]')).length, 1);
}
