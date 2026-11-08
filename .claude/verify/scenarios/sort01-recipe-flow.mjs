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

  // やりなおす：全部トレイへ
  await page.click('[data-action="reset"]');
  await check('やりなおす: スロットが空・トレイに3枚', async () => ({ s: await slotIds(page), t: (await trayIds(page)).length }),
    { s: [null, null, null], t: 3 });

  // 正解（wa → yaku → sara）
  for (const id of ['wa', 'yaku', 'sara']) await tap(page, id);
  await check('正解の並びを置く', () => slotIds(page), ['wa', 'yaku', 'sara']);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('正解: クリア演出に「つぎの ステージ」が出る', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play' && document.querySelector('[data-so-tray] [data-card-id="bata"]'));
  await check('つぎへ: p2 の盤になる(bata,hikku,nagasu)', () => trayIds(page), ['bata', 'hikku', 'nagasu']);
}
