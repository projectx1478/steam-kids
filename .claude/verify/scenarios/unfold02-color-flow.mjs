// unfold-02（色ぬり・unfold-cube の unfoldColor）：intro の色 → p1 の盤 → 塗り残しは進まない → 開き直しで復元 →
// 失敗（向かい合う2マスが光る・すけた箱）→ 塗り直して成功 → p2(Issue #813)。

export const name = 'UNFOLD02 色ぬり: intro3色・塗り残しは進まない・開き直しで復元・失敗で2面が光る・塗り直して成功→p2(Issue #813)';

const cell = (x, y) => `.uf-cell[data-x="${x}"][data-y="${y}"]`;
const msg = (page) => page.textContent('[data-unfold-msg]').then((t) => t.trim());
const color = (page, x, y) => page.getAttribute(cell(x, y), 'data-color');
const count = async (page, sel) => (await page.$$(sel)).length;

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html?lesson=unfold-02-iro');
  await page.waitForSelector('[data-unfold-intro]');

  await check('intro: 展開図の6マスが3色ずつ2個', () =>
    page.$$eval('.uf-slide[data-slide="1"] rect', (els) => {
      const n = {};
      els.forEach((e) => { n[e.getAttribute('fill')] = (n[e.getAttribute('fill')] || 0) + 1; });
      return { total: els.length, n };
    }), { total: 6, n: { '#2563eb': 2, '#16a34a': 2, '#db2777': 2 } });

  await page.click('[data-action="start"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await page.waitForSelector('[data-unfold-color]');

  await check('p1: 15マス・void10・そこ1(2,1)・given2・空き2・帯「どこを ぬる？」', async () => ({
    cells: await count(page, '.uf-cell'),
    voids: await count(page, '.uf-void'),
    base: await page.$$eval('.uf-base', (els) => els.map((e) => `${e.dataset.x},${e.dataset.y}`)),
    given: await count(page, '.uf-given'),
    blank: await count(page, '.uf-blank'),
    m: await msg(page),
  }), { cells: 15, voids: 10, base: ['2,1'], given: 2, blank: 2, m: 'どこを ぬる？' });

  await page.click('[data-action="run"]');
  await check('塗り残しでためす: 帯「あと 2めん」・折り上げなし', async () => ({
    m: await msg(page),
    fold: await count(page, '[data-unfold-fold]'),
  }), { m: 'あと 2めん', fold: 0 });

  // (2,2) を1回 → a。開き直しても残る → もどすで空きに戻る
  await page.click(cell(2, 2));
  await check('(2,2) を1回タップで a', () => color(page, 2, 2), 'a');
  await page.goto('/index.html?lesson=unfold-02-iro');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-unfold-color]');
  await check('開き直し: (2,2) が a のまま', () => color(page, 2, 2), 'a');
  await page.click('[data-action="reset"]');
  await check('もどす: 空き2に戻る', () => count(page, '.uf-blank'), 2);

  // (2,2) a・(3,1) a → 向かい合う (1,1)b と (3,1)a がそろわない
  await page.click(cell(2, 2));
  await page.click(cell(3, 1));
  await check('(2,2)(3,1) を1回ずつで両方 a', async () => [await color(page, 2, 2), await color(page, 3, 1)], ['a', 'a']);
  await page.click(cell(2, 0));
  await check('given (2,0) はタップしても a のまま', () => color(page, 2, 0), 'a');

  await page.click('[data-action="run"]');
  await page.waitForSelector('.uf-cell.uf-wrong-still', { timeout: 8000 });
  await check('失敗: 光るマスは (1,1)(3,1)', () =>
    page.$$eval('.uf-cell.uf-wrong-still', (els) => els.map((e) => `${e.dataset.x},${e.dataset.y}`).sort()), ['1,1', '3,1']);
  await check('失敗の折り上げ: 面5・miss2面(1,1)(3,1)が向かい合う面{4,5}・穴0', async () => ({
    faces: await count(page, '[data-unfold-fold] .uf-fold-face'),
    miss: await page.$$eval('.uf-fold-face--miss', (els) => els.map((e) => `${e.dataset.x},${e.dataset.y}`).sort()),
    missFaces: await page.$$eval('.uf-fold-face--miss', (els) => els.map((e) => e.dataset.face).sort()),
    holes: await count(page, '.uf-fold-hole'),
  }), { faces: 5, miss: ['1,1', '3,1'], missFaces: ['4', '5'], holes: 0 });
  await check('失敗: 理由「ここが むかいあうよ」', async () => (await page.textContent('[data-uf-why="true"]')).trim(), 'ここが むかいあうよ');

  const fits = () => page.evaluate(() => {
    const w = document.querySelector('[data-unfold-fold]');
    const b = document.querySelector('.so-board');
    const app = document.querySelector('#app');
    if (!w || !b) return false;
    const r = w.getBoundingClientRect();
    const q = b.getBoundingClientRect();
    return r.left >= q.left - 0.5 && r.right <= q.right + 0.5 && r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5
      && Number(w.dataset.foldSize) >= 12 && app.scrollHeight <= app.clientHeight;
  });
  await check('360x640: 場面が結果帯の内側・面12以上・縦スクロールなし', fits, true);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.click(cell(3, 1)); // a→b
  await page.click(cell(3, 1)); // b→c
  await page.click(cell(3, 1)); // c→なし
  await page.click(cell(3, 1)); // →a（もう一度同じ失敗）
  await page.click('[data-action="run"]');
  await page.waitForSelector('.uf-cell.uf-wrong-still', { timeout: 8000 });
  await check('844x390: 場面が結果帯の内側・面12以上・縦スクロールなし', fits, true);
  await page.setViewportSize({ width: 360, height: 640 });

  // (3,1) をもう1回 → b。場面と理由が消え、帯が見える
  await page.click(cell(3, 1));
  await check('塗り直し: (3,1) が b・場面と理由が消え、帯が見える', async () => ({
    c: await color(page, 3, 1),
    fold: await count(page, '[data-unfold-fold]'),
    why: await count(page, '[data-uf-why]'),
    msg: await page.isVisible('[data-unfold-msg]'),
  }), { c: 'b', fold: 0, why: 0, msg: true });

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('成功: miss0・帯「いろが そろった！」・つぎの ステージが出る', async () => ({
    miss: await count(page, '.uf-fold-face--miss'),
    m: await msg(page),
    next: await count(page, '[data-action="next-stage"]'),
  }), { miss: 0, m: 'いろが そろった！', next: 1 });
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play' && document.querySelector('[data-unfold-color]'));
  await check('つぎへ: p2 の盤（そこ(2,1)・given (1,0)(2,2)）', async () => ({
    base: await page.$$eval('.uf-base', (els) => els.map((e) => `${e.dataset.x},${e.dataset.y}`)),
    given: await page.$$eval('.uf-given', (els) => els.map((e) => `${e.dataset.x},${e.dataset.y}`).sort()),
  }), { base: ['2,1'], given: ['1,0', '2,2'] });
}
