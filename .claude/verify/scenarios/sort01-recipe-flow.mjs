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
  await check('台所の場面: .so-board 直下に svg.so-scene が1つ・.so-robot-frame なし', () => page.evaluate(() => ({
    scene: document.querySelectorAll('.so-board > svg.so-scene').length,
    frame: document.querySelectorAll('.so-robot-frame').length,
  })), { scene: 1, frame: 0 });
  await check('台所の場面: 鍋・コンロ・調理台・ロボット・吹き出しが svg の中にある', () => page.evaluate(() => {
    const svg = document.querySelector('svg.so-scene');
    return ['[data-p="pot"]', '[data-p="stove"]', '[data-p="counter"]', '.so-robot', '[data-p="bubble"]'].map((q) => !!svg.querySelector(q));
  }), [true, true, true, true, true]);
  await page.click('[data-action="run"]');
  await page.waitForSelector('.so-act[data-act]');
  const first = await page.waitForFunction(() => { const n = document.querySelectorAll('.so-scene .so-in').length; return n >= 1 ? n : false; }, null, { timeout: 5000 });
  await check('再生中: 1手目が終わった時点で具材(.so-in)が1つ', () => first.jsonValue(), 1);
  await page.waitForSelector('.so-slot.so-wrong', { timeout: 8000 });
  await check('失敗: 3手目(a)まで再生して具材が3つ', () => page.$$eval('.so-scene .so-in', (e) => e.length), 3);
  await check('失敗: svg.so-scene の data-scene が fail の種類(empty)・吹き出しは「？」', () => page.evaluate(() => ({
    k: document.querySelector('svg.so-scene').dataset.scene,
    b: document.querySelector('[data-p="bubble"] text').textContent.trim(),
  })), { k: 'empty', b: '？' });
  await check('失敗: 場面の動きに無限繰り返しが無い', () => page.$eval('.so-board', (b) => b.getAnimations({ subtree: true }).filter((a) => a.effect.getComputedTiming().iterations === Infinity && !a.effect.target.closest?.('.so-card')).length), 0);
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

  // 4端末で結果ダイアログ・料理の絵・つぎへが [data-result-row] に収まる(Issue #787)
  for (const [w, h] of [[360, 640], [844, 390], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await enterPlay(page, 'sort-01-recipe');
    for (const id of ['wa', 'yaku', 'sara']) await tap(page, id);
    await page.click('[data-action="run"]');
    await page.waitForSelector('.so-act[data-act]');
    await page.click('.so-board', { force: true });
    await page.waitForSelector('[data-result-dialog] [data-so-dish] svg', { timeout: 10000 });
    await check(`${w}x${h}: svg.so-scene が .so-board の内側に収まる`, () => page.evaluate(() => {
      const bd = document.querySelector('.so-board').getBoundingClientRect();
      const sc = document.querySelector('svg.so-scene').getBoundingClientRect();
      return sc.width > 0 && sc.left >= bd.left - 1 && sc.right <= bd.right + 1 && sc.top >= bd.top - 1 && sc.bottom <= bd.bottom + 1;
    }), true);
    await check(`${w}x${h}: ダイアログ・料理の絵・つぎへが結果行に収まる`, () => page.evaluate(() => {
      const row = document.querySelector('[data-result-row]').getBoundingClientRect();
      const inside = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return r.left >= row.left - 1 && r.right <= row.right + 1 && r.top >= row.top - 1 && r.bottom <= row.bottom + 1;
      };
      return ['[data-result-dialog]', '[data-so-dish] svg', '[data-action="next-stage"]'].map(inside);
    }), [true, true, true]);
    if (h !== 390) {
      await check(`${w}x${h}: 料理の絵の描画高さが200px以上（0pxに戻らない。#797）`, () => page.$eval('[data-so-dish] svg', (e) => e.getBoundingClientRect().height >= 200), true);
    }
    if (h === 390) {
      await check('844x390: 料理の絵の描画高さが120px以上', () => page.$eval('[data-so-dish] svg', (e) => e.getBoundingClientRect().height >= 120), true);
    }
  }
}
