export const name = 'A1 効果音: 命令追加/削除・実行・壁停止・ゴール・ステップ遷移・予想の答え合わせ';

async function sfxLog(page) {
  return page.evaluate(() => window.__sfxLog);
}

import { clickRetry } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('startでwhooshが鳴る', async () => (await sfxLog(page)).includes('whoosh'));

  await page.click('[data-option="B"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await check('予想実行開始でrunが鳴る', async () => (await sfxLog(page)).includes('run'));
  await check('予想実行中にstepが鳴る', async () => (await sfxLog(page)).includes('step'));
  await check('予想の答え合わせでrevealが鳴る', async () => (await sfxLog(page)).includes('reveal'));

  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // 盤外へ進む1手だけを実行してbumpを確認する（start(0,3)からleftは盤外）
  await page.click('[data-command="left"]');
  await check('命令追加でtapが鳴る', async () => (await sfxLog(page)).includes('tap'));
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await check('盤外へ進んでbumpが鳴る', async () => (await sfxLog(page)).includes('bump'));
  // 不正解時は罰則音ではなくtryAgain（低音スイープ）を鳴らす（Issue #106）。
  await check('不正解でtryAgainが鳴る', async () => (await sfxLog(page)).includes('tryAgain'));

  // retryは正解・不正解に関わらず命令列をリセットする（Issue #104）ため、ぜんぶ けすを
  // 試すには先に何か積み直す必要がある。
  await clickRetry(page);
  await page.click('[data-command="up"]');
  await page.click('[data-action="clear-all"]');
  // ぜんぶけすは個別削除(remove)と区別するため専用のreset音を鳴らす（Issue #95）。
  await check('ぜんぶけすでresetが鳴る', async () => (await sfxLog(page)).includes('reset'));

  const commands = ['up', 'up', 'up', 'right', 'right', 'right'];
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  // ゴール到達（showSuccess）はclearよりも長いfanfare音を鳴らす（Issue #104）。
  await check('ゴール到達でfanfareが鳴る', async () => (await sfxLog(page)).includes('fanfare'));

  const before = (await sfxLog(page)).length;
  await page.click('[data-action="next"]');
  await check('summaryへの遷移でもログが増える', async () => (await sfxLog(page)).length > before);
  // summaryは達成感の演出（星のはじけ）でfanfare音を再生するため、最後に鳴るのはwhooshではなく
  // fanfareになる（Issue #91・#104）。
  const log = await sfxLog(page);
  await check('最後に鳴った音はfanfare（summaryのクリア演出）', () => log[log.length - 1], 'fanfare');
}
