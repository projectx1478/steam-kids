// 端末の戻る（history）が「← もどる」と同じく1ステップ戻ること、playの途中で🏠を押すと
// 確認が出ることを確認する（Issue #240）。

export const name = 'C7 端末の戻る・playの途中の離脱確認(Issue #240)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  const step = () => page.getAttribute('#stage', 'data-step');
  const stepId = () => page.getAttribute('#stage', 'data-step-id');

  await enterPlay(page, 'cmd-01-susumu');
  await check('play(p1)に入る', step, 'play');
  const p1 = await stepId();

  // p1をクリアしてp2へ。端末の戻るでp1へ戻る（レッスンの外へは出ない）。
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="next-stage"]');
  await check('p2へ進む', async () => (await stepId()) !== p1);
  await page.goBack();
  await check('端末の戻るでp1へ戻る', stepId, p1);
  await check('レッスンの外へ出ていない', async () => page.url().includes('lesson=cmd-01-susumu'));
  await page.goBack();
  await check('もう一度戻るとintroへ戻る', step, 'intro');
  await page.goForward();
  await check('端末の進むでp1へ戻る', stepId, p1);

  // 命令列を組みかけで🏠を押すと確認が出る。つづけるで残る。
  await page.click('[data-command="up"]');
  await page.click('#home-btn');
  await check('playの途中は🏠で確認が出る', async () => (await page.$$('.leave-confirm')).length, 1);
  await page.click('[data-action="leave-cancel"]');
  await check('つづけるで確認が消えplayに残る', async () => (await page.$$('.leave-confirm')).length, 0);
  await check('命令列は残っている', async () => (await page.$$('.command-chip')).length, 1);
  await page.click('#home-btn');
  await page.click('[data-action="leave-ok"]');
  await page.waitForSelector('[data-screen="picker"]');
  await check('やめるでマップへ移る', async () => page.url().endsWith('/index.html?view=map'));

  // 何も組んでいなければ確認なしで移る。
  await enterPlay(page, 'cmd-01-susumu');
  await page.click('#home-btn');
  await page.waitForSelector('[data-screen="picker"]');
  await check('命令列が空なら確認なしで移る', async () => page.url().endsWith('/index.html?view=map'));
}
