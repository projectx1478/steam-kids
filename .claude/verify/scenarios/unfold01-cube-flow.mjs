// unfold-01（展開図キューブ・unfold-cube）：intro 切替 → p1 で枚数不足は進まない → 重なる1マスで失敗(2マス点滅) → 消して正解 → つぎへ(Issue #289)。
export const name = 'UNFOLD01 展開図キューブ: intro切替・枚数不足は進まない・失敗後もマスが残る・正解でクリア→つぎへ(Issue #289)';
import { enterPlay } from '../helpers.mjs';

const cell = (x, y) => `.uf-cell[data-x="${x}"][data-y="${y}"]`;
const msg = (page) => page.textContent('[data-unfold-msg]').then((t) => t.trim());
const cls = (page, x, y) => page.getAttribute(cell(x, y), 'class');
const has = async (page, x, y, c) => (await cls(page, x, y)).split(/\s+/).includes(c);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html?lesson=unfold-01-cube');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-unfold-intro]');

  const shown = () => page.$$eval('.uf-slide', (els) => els.filter((e) => !e.classList.contains('uf-hide')).map((e) => e.dataset.slide));
  await check('intro: 最初は①(てんかいず)が出る', shown, ['1']);
  await page.click('.uf-dot[data-i="2"]');
  await check('intro: ②をタップするとはこが出る', shown, ['2']);
  await page.click('.uf-dot[data-i="2"]');
  await check('intro: ②を連打しても変わらない(冪等)', shown, ['2']);
  await page.click('.uf-dot[data-i="1"]');
  await check('intro: ①に戻せる', shown, ['1']);

  await page.click('[data-action="start"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await page.waitForSelector('[data-unfold-grid]');

  await check('p1: 格子は5x3で preset 5マスだけ塗られている', async () => ({
    cells: (await page.$$('.uf-cell')).length,
    pre: (await page.$$('.uf-cell.uf-pre')).length,
    paint: (await page.$$('.uf-cell.uf-paint')).length,
  }), { cells: 15, pre: 5, paint: 0 });

  // 5枚のまま「ためす」：進まず点滅もなし、帯が「あと 1ます」
  await page.click('[data-action="run"]');
  await check('枚数不足でためす: 帯が「あと 1ます」・点滅なし', async () => ({
    m: await msg(page),
    w: (await page.$$('.uf-cell.uf-wrong, .uf-cell.uf-wrong-still')).length,
    d: (await page.$$('[data-result-dialog]')).length,
  }), { m: 'あと 1ます', w: 0, d: 0 });

  // 重なる1マス(1,1)：6マスで連結だが展開図でない → (0,0)と(4,1)が点滅、塗りは残る
  await page.click(cell(1, 1));
  await page.click('[data-action="run"]');
  await page.waitForSelector('.uf-cell.uf-wrong-still', { timeout: 8000 });
  await check('失敗: 重なる2マス(0,0)(4,1)だけ点滅の印が残る', async () => ({
    a: await has(page, 0, 0, 'uf-wrong-still'),
    b: await has(page, 4, 1, 'uf-wrong-still'),
    n: (await page.$$('.uf-cell.uf-wrong-still')).length,
  }), { a: true, b: true, n: 2 });
  await check('失敗: 塗ったマスが残る・クリア演出は出ない', async () => ({
    kept: await has(page, 1, 1, 'uf-paint'),
    d: (await page.$$('[data-result-dialog]')).length,
  }), { kept: true, d: 0 });

  // 消して(トグル)、正しい1マス(2,0)を塗る
  await page.click(cell(1, 1));
  await check('塗ったマスをタップで消える', () => has(page, 1, 1, 'uf-paint'), false);
  await page.click(cell(2, 0));
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('正解: 6マスに点の目が出る', async () => (await page.$$('.uf-cell.uf-ok')).length, 6);
  await check('正解: クリア演出に「つぎの ステージ」が出る', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play' && document.querySelector('[data-unfold-grid]'));
  await check('つぎへ: p2 の盤(preset 5マス)になる', async () => (await page.$$('.uf-cell.uf-pre')).length, 5);
  await check('つぎへ: p2 の (1,0) が preset', () => has(page, 1, 0, 'uf-pre'), true);
}
