// sort-01（レシピの順番・sort-order）：p1 を逆順で「ためす」→カードが残る失敗 → やりなおす → 正解でクリア演出 → つぎの ステージ(Issue #292)。
export const name = 'SORT01 レシピの順番: 失敗後も並びが残る・やりなおすで戻る・正解でクリア→つぎへ(Issue #292)';
import { enterPlay } from '../helpers.mjs';

const slotIds = (page) => page.$$eval('[data-so-slots] .so-slot', (els) => els.map((e) => e.dataset.cardId ?? null));
const trayIds = (page) => page.$$eval('[data-so-tray] [data-card-id]', (els) => els.map((e) => e.dataset.cardId));
const tap = (page, id) => page.click(`[data-so-tray] [data-card-id="${id}"]`);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await enterPlay(page, 'sort-01-recipe');

  await check('p1: スロット3つ・トレイは配列順(sara,wa,yaku)', async () => ({ s: await slotIds(page), t: await trayIds(page) }),
    { s: [null, null, null], t: ['sara', 'wa', 'yaku'] });

  // 空きスロットがあるまま「ためす」：実行せず並びも変わらない
  await page.click('[data-action="run"]');
  await check('未充填でためす: 何も置かれず結果も出ない', async () => ({ s: await slotIds(page), d: (await page.$$('[data-result-dialog]')).length }),
    { s: [null, null, null], d: 0 });

  // 逆順（トレイの並び sara,wa,yaku のまま）で失敗
  for (const id of ['sara', 'wa', 'yaku']) await tap(page, id);
  await check('3枚置くとスロットに並ぶ', () => slotIds(page), ['sara', 'wa', 'yaku']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('.so-slot.so-wrong', { timeout: 8000 });
  await check('失敗: カードはスロットに残る', () => slotIds(page), ['sara', 'wa', 'yaku']);
  await check('失敗: クリアのダイアログは出ない', async () => (await page.$$('[data-result-dialog]')).length, 0);

  await check('失敗: 理由行が吹き出しに出る', () => page.$eval('[data-so-why="true"]', (e) => e.textContent.trim()), 'おさらには やけた たまご');

  // やりなおす：全部トレイへ
  await page.click('[data-action="reset"]');
  await check('やりなおす: 理由行が消える', async () => (await page.$$('[data-so-why]')).length, 0);
  await check('やりなおす: スロットが空・トレイに3枚', async () => ({ s: await slotIds(page), t: (await trayIds(page)).length }),
    { s: [null, null, null], t: 3 });

  // 正解（wa → yaku → sara）
  for (const id of ['wa', 'yaku', 'sara']) await tap(page, id);
  await check('正解の並びを置く', () => slotIds(page), ['wa', 'yaku', 'sara']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('.so-act[data-act]');
  await check('再生中: ためす・もどすが disabled', () => page.$eval('[data-action="run"]', (b) => b.disabled).then(async (r) => r && (await page.$eval('[data-action="reset"]', (b) => b.disabled))), true);
  await page.click('[data-so-slots] [data-card-id="wa"]', { force: true });
  await check('再生中: カードを押しても並びが変わらない', () => slotIds(page), ['wa', 'yaku', 'sara']);
  await page.click('.so-board', { force: true }); // 盤面のタップで演出を飛ばして結果へ
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('正解: 料理の絵（たまごやき）が1つ', async () => (await page.$$('[data-result-dialog] [data-so-dish="tamagoyaki"]')).length, 1);
  await check('正解: クリア演出に「つぎの ステージ」が出る', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play' && document.querySelector('[data-so-tray] [data-card-id="bata"]'));
  await check('つぎへ: p2 の盤になる(bata,hikku,nagasu)', () => trayIds(page), ['bata', 'hikku', 'nagasu']);
}
