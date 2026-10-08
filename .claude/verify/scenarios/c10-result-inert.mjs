// クリア後の背面ロック(inert)：間の始まりで操作画面の外枠に付き、結果ダイアログ(非モーダル show())の間も続き、
// どの経路で画面を離れても外れること。Esc でダイアログが残り、暗幕が controls に一致すること(Issue #347)。

export const name = 'C10 クリア後の背面ロック: 外枠inert・Escで残る・経路ごとに外れる(play・シーソー)(Issue #347)';
import { enterPlay } from '../helpers.mjs';

const cmd01 = ['up', 'up', 'left', 'left'];

async function clearByStepping(page) {
  for (const dir of cmd01) await page.click(`[data-command="${dir}"]`);
  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
}

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 360, height: 640 });
  const queueCount = async () => (await page.$$('.command-queue [data-index]')).length;
  const inertOn = (sel) => page.evaluate((s) => document.querySelector(s).inert === true, sel);
  const noLeftovers = async () =>
    page.evaluate(() => ({
      dialogs: document.querySelectorAll('[data-result-row]').length,
      stageRelative: document.querySelector('#stage').classList.contains('relative'),
      inertCount: document.querySelectorAll('[inert]').length,
    }));
  const clean = { dialogs: 0, stageRelative: false, inertCount: 0 };

  // --- play: 間（1.5秒）の最中 ---
  await enterPlay(page, 'cmd-01-susumu');
  const upBox = await (await page.$('[data-command="up"]')).boundingBox();
  await clearByStepping(page);
  await page.waitForSelector('[data-result-gap]');
  await check('間の最中: 外枠(.play-screen)が inert', () => inertOn('.play-screen'), true);
  const before = await queueCount();
  await page.mouse.click(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
  await check('間の最中: 操作ボタンを押しても何も起きない', queueCount, before);

  // --- play: ダイアログ表示中 ---
  await page.waitForSelector('[data-result-dialog]', { timeout: 4000 });
  await check('ダイアログ表示中: 外枠は inert のまま', () => inertOn('.play-screen'), true);
  await check('ダイアログは外枠の外（#stage の子の dialog）', () =>
    page.evaluate(() => {
      const row = document.querySelector('[data-result-row]');
      return row.tagName === 'DIALOG' && row.open && row.parentElement.id === 'stage' && row.closest('.play-screen') === null;
    }), true);
  await check('ダイアログのボタンは inert でない', () =>
    page.evaluate(() => document.querySelector('[data-action="next-stage"]').closest('[inert]') === null), true);
  await check('暗幕の境界ボックスが controls と ±1px で一致', () =>
    page.evaluate(() => {
      const a = document.querySelector('[data-result-row]').getBoundingClientRect();
      const b = document.querySelector('.controller-panel').getBoundingClientRect();
      return ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1);
    }), true);
  await page.keyboard.press('Escape');
  await check('Esc を押してもダイアログが残る', async () => (await page.$$('[data-result-dialog]')).length, 1);

  // --- play: もういちど → 外れる ---
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="step"]');
  await check('もういちど: ダイアログ・inert・relative が残らない', noLeftovers, clean);
  await check('もういちど: 操作ボタンが押せる', async () => {
    const n = await queueCount();
    await page.click('[data-command="up"]');
    return (await queueCount()) === n + 1;
  }, true);

  // --- play: つぎの ステージ → 外れる ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await enterPlay(page, 'cmd-01-susumu');
  await clearByStepping(page);
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 4000 });
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage').dataset.stepId !== undefined && !document.querySelector('[data-result-row]'));
  await check('つぎの ステージ: ダイアログ・inert・relative が残らない', noLeftovers, clean);
  await check('つぎの ステージ: 操作ボタンが押せる', async () => {
    const n = await queueCount();
    await page.click('[data-command="up"]');
    return (await queueCount()) === n + 1;
  }, true);

  // --- play: ダイアログ表示中の「← もどる」→ 外れる ---
  await page.reload();
  await enterPlay(page, 'cmd-01-susumu');
  await clearByStepping(page);
  await page.waitForSelector('[data-result-dialog]', { timeout: 4000 });
  await page.click('#back-btn');
  await check('もどる(ダイアログ表示中): playから出る', async () => (await page.getAttribute('#stage', 'data-step')) !== 'play');
  await check('もどる(ダイアログ表示中): ダイアログ・inert・relative が残らない', noLeftovers, clean);

  // --- play: 間の最中の「← もどる」→ 外れる ---
  await enterPlay(page, 'cmd-01-susumu');
  await clearByStepping(page);
  await page.waitForSelector('[data-result-gap]');
  await page.click('#back-btn');
  await check('もどる(間の最中): ダイアログ・inert・relative が残らない', noLeftovers, clean);
  await page.waitForTimeout(2200);
  await check('もどる(間の最中): 後からダイアログが現れない', noLeftovers, clean);

  // --- シーソー(teko-01-tsuriai) ---
  await enterPlay(page, 'teko-01-tsuriai');
  const rightBox = await (await page.$('[data-action="pos-right"]')).boundingBox();
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-gap]', { timeout: 10000 });
  await check('シーソー 間の最中: 外枠(.play-screen)が inert', () => inertOn('.play-screen'), true);
  const posBefore = await page.evaluate(() => document.querySelector('svg [data-pos], [data-pos]').dataset.pos);
  await page.mouse.click(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
  await check('シーソー 間の最中: 操作ボタンを押しても何も起きない', () =>
    page.evaluate(() => document.querySelector('[data-pos]').dataset.pos), posBefore);
  await page.waitForSelector('[data-result-dialog]', { timeout: 4000 });
  await check('シーソー ダイアログ表示中: 外枠は inert のまま', () => inertOn('.play-screen'), true);
  await check('シーソー 暗幕の境界ボックスが外枠(.play-screen)と ±1px で一致', () =>
    page.evaluate(() => {
      const a = document.querySelector('[data-result-row]').getBoundingClientRect();
      const b = document.querySelector('.play-screen').getBoundingClientRect();
      return ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1);
    }), true);
  await page.keyboard.press('Escape');
  await check('シーソー Esc を押してもダイアログが残る', async () => (await page.$$('[data-result-dialog]')).length, 1);
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="run"]');
  await check('シーソー もういちど: ダイアログ・inert・relative が残らない', noLeftovers, clean);
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');
  await page.waitForSelector('[data-action="pos-right"]');
  await check('シーソー つぎの ステージ: ダイアログ・inert・relative が残らない', noLeftovers, clean);
  await check('シーソー つぎの ステージ: 操作ボタンが押せる', async () => {
    await page.click('[data-action="pos-right"]');
    return true;
  }, true);
}
