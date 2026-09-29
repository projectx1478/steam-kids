export const name = 'R2 れんしゅう: 絵コード入力・同じたねで同じ盤面・payload.seed・回数表示(Issue #69)';

async function pickCode(page, digits) {
  for (const d of digits) await page.click(`[data-picture-btn="${d}"]`);
}

const boardDom = (page) => page.$$eval('.grid-cell', (els) => els.map((e) => e.outerHTML).join(''));
const events = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events') || '[]'));

// たね確定後、生成盤面のsolutionをそのまま入力してクリアする。
async function clearBySolution(page, code) {
  const solution = await page.evaluate(async (c) => {
    const { generateMap } = await import('/js/engine-generate.js');
    const { codeToSeed } = await import('/js/seed-code.js');
    const step = { generator: null };
    const lesson = await (await fetch('/lessons/cmd-06-practice.json')).json();
    step.generator = lesson.steps.find((s) => s.kind === 'play').generator;
    return generateMap(step.generator, codeToSeed(c)).solution;
  }, code);
  for (const c of solution) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await page.click('[data-action="next"]');
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-06-practice');
  await check('最初はたね入力画面', async () => page.getAttribute('#stage', 'data-step'), 'seedPick');
  await check('絵が8種類ならぶ', async () => (await page.$$('[data-picture-btn]')).length, 8);
  await check('4マスの入力欄がある', async () => (await page.$$('.seed-slot')).length, 4);
  await check('未入力ではスタートが押せない', () => page.$eval('[data-action="start"]', (b) => b.disabled), true);

  await pickCode(page, [0, 1, 2]);
  await check('3つではまだスタートが押せない', () => page.$eval('[data-action="start"]', (b) => b.disabled), true);
  await pickCode(page, [3]);
  await check('4つ選ぶとタップだけでコードが入る', async () => page.$$eval('.seed-slot', (els) => els.map((e) => e.dataset.picture).join('')), '0123');
  await check('4つ揃うとスタートが押せる', () => page.$eval('[data-action="start"]', (b) => b.disabled), false);
  await check('入力欄をタップして選び直せる', async () => {
    await page.click('[data-slot="1"]');
    await page.click('[data-picture-btn="7"]');
    return page.$$eval('.seed-slot', (els) => els.map((e) => e.dataset.picture).join(''));
  }, '0723');

  await page.click('[data-action="random-code"]');
  await check('「ちがう マップ」で4マスすべて埋まる', async () => (await page.$$('.seed-slot[data-picture]')).length, 4);
  await pickCode(page, [0, 1, 2, 3]);
  await page.click('[data-slot="0"]');
  await page.click('[data-picture-btn="4"]');
  await page.click('[data-slot="1"]');
  await page.click('[data-picture-btn="5"]');
  await page.click('[data-slot="2"]');
  await page.click('[data-picture-btn="6"]');
  await page.click('[data-slot="3"]');
  await page.click('[data-picture-btn="7"]');
  await page.click('[data-action="start"]');
  await check('スタートで操作画面へ', async () => page.getAttribute('#stage', 'data-step'), 'play');
  const first = await boardDom(page);
  await check('盤面が生成される（マスが25個）', async () => (await page.$$('.grid-cell')).length, 25);

  await page.goto('/index.html?lesson=cmd-06-practice');
  await pickCode(page, [4, 5, 6, 7]);
  await page.click('[data-action="start"]');
  await check('同じコードなら同じ盤面（DOM一致）', async () => (await boardDom(page)) === first);

  await clearBySolution(page, '4567');
  await check('クリアでまとめへ', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('「この マップの たね」に同じコードが出る', async () => page.getAttribute('.seed-strip', 'data-seed'), '4567');

  const evs = (await events(page)).filter((e) => e.lessonId === 'cmd-06-practice');
  const clear = evs.find((e) => e.type === 'clear');
  await check('clearイベントのpayload.seedにコードが入る', async () => clear?.payload.seed, '4567');
  await check('runイベントにもseedが入る', async () => evs.find((e) => e.type === 'run')?.payload.seed, '4567');
  await check('lessonIdは固定', async () => new Set(evs.map((e) => e.lessonId)).size, 1);

  await page.click('[data-action="another-map"]');
  await check('「ちがう マップ」でたね入力へ戻る', async () => page.getAttribute('#stage', 'data-step'), 'seedPick');
  await check('新しいコードが入った状態で戻る', async () => (await page.$$('.seed-slot[data-picture]')).length, 4);

  await page.goto('/index.html?view=map');
  await check('単元マップにれんしゅうのクリア回数だけが出る', async () => page.textContent('[data-lesson-id="cmd-06-practice"] ~ .practice-count'), '1 かい');
  await check('れんしゅうにはスタンプが付かない', async () => (await page.$$('[data-lesson-id="cmd-06-practice"] ~ .lesson-stamp')).length, 0);
}
