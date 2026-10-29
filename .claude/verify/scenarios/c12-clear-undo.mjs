// C12 ぜんぶけすの取り消し: 「↶ もとに もどす」で命令列が戻る・札は64px以上・5秒で消える・命令0個では押せない。
// ぜんぶけす（取り消し札の表示中も）と 1コマ・じっこう の最短距離は3端末で16px以上（Issue #549）。

export const name = 'C12 ぜんぶけすの取り消し: 戻す・64px以上・5秒で消える・1コマ/じっこうと16px以上(Issue #549)';
import { enterPlay } from '../helpers.mjs';

const SIZES = [
  [360, 640],
  [844, 390],
  [1024, 600],
];

// ぜんぶけす（または取り消し札）と 1コマ・じっこう の最短距離(px)。
const gapToRunSide = () =>
  document.querySelector('[data-sk-screen="actions"]') &&
  (() => {
    const slot = document.querySelector('[data-action="clear-all"], [data-action="undo-clear"]').getBoundingClientRect();
    let min = Infinity;
    for (const a of ['step', 'run']) {
      const r = document.querySelector(`[data-action="${a}"]`).getBoundingClientRect();
      const dx = Math.max(0, slot.left - r.right, r.left - slot.right);
      const dy = Math.max(0, slot.top - r.bottom, r.top - slot.bottom);
      min = Math.min(min, Math.hypot(dx, dy));
    }
    return Math.round(min * 10) / 10;
  })();

const queue = (page) => page.$$eval('.command-chip', (els) => els.map((e) => e.textContent.trim()));

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-01-susumu');

  await check('命令0個: ぜんぶけすは押せない', () => page.$eval('[data-action="clear-all"]', (b) => b.disabled), true);

  for (const c of ['up', 'up', 'right']) await page.click(`[data-command="${c}"]`);
  const before = await queue(page);
  await check('3個積む', () => before.length, 3);

  await page.click('[data-action="clear-all"]');
  await check('ぜんぶけすで0個になる', async () => (await queue(page)).length, 0);
  await check('取り消し札が出る', async () => (await page.$$('[data-action="undo-clear"]')).length, 1);
  await check('ぜんぶけすは札に入れ替わる', async () => (await page.$$('[data-action="clear-all"]')).length, 0);
  await check('札の文言', () => page.$eval('[data-action="undo-clear"]', (b) => b.textContent.trim().replace(/\s+/g, ' ')), '↶ もとに もどす');
  await check('札は64px以上', () =>
    page.$eval('[data-action="undo-clear"]', (b) => {
      const r = b.getBoundingClientRect();
      return r.width >= 63.5 && r.height >= 63.5;
    }), true);
  await check('減り棒がある', async () => (await page.$$('[data-undo-bar]')).length, 1);

  await page.click('[data-action="undo-clear"]');
  await check('もとに もどす で命令列が一致する', () => queue(page), before);
  await check('戻した後は札が消えてぜんぶけすに戻る', async () => [(await page.$$('[data-action="undo-clear"]')).length, (await page.$$('[data-action="clear-all"]')).length], [0, 1]);

  // 5秒で札が消える。
  await page.click('[data-action="clear-all"]');
  await check('再び札が出る', async () => (await page.$$('[data-action="undo-clear"]')).length, 1);
  await page.waitForFunction(() => !document.querySelector('[data-action="undo-clear"]'), null, { timeout: 8000 });
  await check('5秒後に札が消えてぜんぶけすに戻る', async () => (await page.$$('[data-action="clear-all"]')).length, 1);
  await check('5秒後は命令0個のぜんぶけすが押せない', () => page.$eval('[data-action="clear-all"]', (b) => b.disabled), true);
  await check('5秒たつと戻せない（命令は0個のまま）', async () => (await queue(page)).length, 0);

  // 命令を足したら札は破棄される。
  for (const c of ['up', 'up']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="clear-all"]');
  await page.click('[data-command="left"]');
  await check('命令を足すと札が消える', async () => (await page.$$('[data-action="undo-clear"]')).length, 0);
  // チップの表示は日本語ラベル（ui-commands.js の COMMAND_LABELS）。パレットのボタン表示を正として比べる。
  const leftLabel = await page.$eval('[data-command="left"]', (b) => b.textContent.trim());
  await check('足した命令だけが残る', () => queue(page), [leftLabel]);

  // 札の表示中は 1コマ・じっこう が押せない（空の命令列では実行が始まらない）。実行・1コマを始めたら札は残らない。
  await page.click('[data-action="clear-all"]');
  await check('札の表示中は 1コマ・じっこう が押せない', () => page.evaluate(() => ['step', 'run'].map((a) => document.querySelector(`[data-action="${a}"]`).disabled)), [true, true]);
  await page.click('[data-command="left"]');
  await page.click('[data-action="step"]');
  await check('1コマを押した後は札が残らない', async () => (await page.$$('[data-action="undo-clear"]')).length, 0);
  await page.goto('/index.html');
  await enterPlay(page, 'cmd-01-susumu');
  await page.click('[data-command="left"]');
  await page.click('[data-action="clear-all"]');
  await page.click('[data-command="left"]');
  await page.click('[data-action="run"]');
  await check('じっこうを押した後は札が残らない', async () => (await page.$$('[data-action="undo-clear"]')).length, 0);
  await page.goto('/index.html');
  await enterPlay(page, 'cmd-01-susumu');

  // 3端末で、ぜんぶけす・札と 1コマ・じっこう の最短距離が16px以上（札の表示中も）。
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await enterPlay(page, 'cmd-01-susumu');
    for (const c of ['up', 'up']) await page.click(`[data-command="${c}"]`);
    await check(`${w}x${h}: ぜんぶけすと 1コマ・じっこう の最短距離16px以上`, async () => (await page.evaluate(gapToRunSide)) >= 16, true);
    await page.click('[data-action="clear-all"]');
    await check(`${w}x${h}: 取り消し札の表示中も 1コマ・じっこう と16px以上`, async () => (await page.evaluate(gapToRunSide)) >= 16, true);
    await check(`${w}x${h}: 札は64px以上`, () =>
      page.$eval('[data-action="undo-clear"]', (b) => {
        const r = b.getBoundingClientRect();
        return r.width >= 63.5 && r.height >= 63.5;
      }), true);
  }

  // reduced-motion: 減り棒は静止（幅が変わらない）。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'cmd-01-susumu');
  await page.click('[data-command="up"]');
  await page.click('[data-action="clear-all"]');
  const w0 = await page.$eval('[data-undo-bar]', (b) => b.getBoundingClientRect().width);
  await page.waitForTimeout(1500);
  const w1 = await page.$eval('[data-undo-bar]', (b) => b.getBoundingClientRect().width);
  await check('reduced-motion: 減り棒は静止', () => w0 === w1 && w0 > 0, true);

  // キー操作（Issue #380）：Backspace で1個減り、取り消し札は出ない（札はぜんぶけす専用）。
  await enterPlay(page, 'cmd-01-susumu');
  for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
  await page.keyboard.press('Backspace');
  await check('キー: Backspace でチップが1個減り、取り消し札は出ない', async () =>
    [(await queue(page)).length, (await page.$$('[data-action="undo-clear"]')).length], [2, 0]);

  // キー操作（Issue #380、#615 で上限なしに変更）：14個積んだ後も、矢印を押せばチップが増える（命令ボタンが disabled でない）。
  await enterPlay(page, 'cmd-01-susumu');
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  for (let i = 0; i < 14; i += 1) await page.keyboard.press(keys[i % 4]);
  const before = (await queue(page)).length;
  for (let i = 0; i < 4; i += 1) await page.keyboard.press(keys[i]);
  await check('キー: 14個積んだ後も矢印でチップが増える（命令ボタンが disabled でない）', async () =>
    [before, (await queue(page)).length, await page.$eval('[data-command="up"]', (b) => b.disabled)], [14, 18, false]);
}
