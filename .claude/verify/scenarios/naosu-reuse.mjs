export const name = 'naosu-reuse: ice-01・key-01・switch-02 の p3 で、ずれた列を1つ消して直せる(Issue #377)';

import { enterPlay, clearStage, clickRetryKeep } from '../helpers.mjs';

// [lessonId, 初期列の長さ, 消すチップのindex]
const CASES = [
  ['ice-01-suberu', 6, 3],
  ['key-01-kagi', 9, 1],
  ['switch-02-futatsu', 10, 5],
];

export default async function run({ page, check }) {
  for (const [id, len, removeIndex] of CASES) {
    await enterPlay(page, id);
    const lesson = await page.evaluate((lid) => fetch(`./lessons/${lid}.json`).then((r) => r.json()), id);
    const plays = lesson.steps.filter((s) => s.kind === 'play');
    await check(`${id}: playは p1・p2・p3`, async () => plays.map((s) => s.stepId).join(','), 'p1,p2,p3');
    for (const play of plays.slice(0, 2)) await clearStage(page, play.solution);

    await check(`${id}/p3: 初期列のチップ数`, async () => (await page.$$('.command-chip')).length, len);
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
    await check(`${id}/p3: そのまま実行ではクリアしない`, async () => (await page.$('.clear-reaction')) === null);
    await clickRetryKeep(page);
    await check(`${id}/p3: ためしなおすで列が残る`, async () => (await page.$$('.command-chip')).length, len);
    await page.click(`[data-remove-index="${removeIndex}"]`);
    await check(`${id}/p3: 1つ消すとチップが1つ減る`, async () => (await page.$$('.command-chip')).length, len - 1);
    await page.click('[data-action="run"]');
    await page.waitForSelector('.clear-reaction', { timeout: 15000 });
    await check(`${id}/p3: 直した列でクリアする`, async () => (await page.$('.clear-reaction')) !== null);
  }
}
